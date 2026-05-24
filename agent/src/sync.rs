use std::sync::{Arc, RwLock, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use std::fs;
use tokio::time::sleep;
use tracing::{info, warn};
use crate::config::{AppConfig, save_config};
#[cfg(feature = "enterprise")]
use crate::grpc::{AgentControllerClient, RegisterRequest, PolicyRequest, LogBatch, AuditLogEntry, HeartbeatRequest};
#[cfg(feature = "enterprise")]
use crate::crypto::generate_identity_key;
#[cfg(feature = "enterprise")]
use crate::audit;
use crate::ui::events::UiEvent;
use tao::event_loop::EventLoopProxy;
use serde_json::json;
#[cfg(feature = "enterprise")]
use tonic::transport::Channel;

pub struct SyncEngine {
    config: Arc<RwLock<AppConfig>>,
    ui_proxy: EventLoopProxy<UiEvent>,
    connected: AtomicBool,
}

impl SyncEngine {
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    pub fn new(config: Arc<RwLock<AppConfig>>, ui_proxy: EventLoopProxy<UiEvent>) -> Self {
        Self { config, ui_proxy, connected: AtomicBool::new(false) }
    }

    pub async fn run(&self) {
        info!("Enterprise Sync Engine started.");

        // Auto-enrollment via provisioning file
        let prov_path = crate::provisioning::provisioning_path();
        if prov_path.exists() {
            let enrolled = self.config.read().unwrap().enrolled_admin.is_some();
            if !enrolled {
                info!("Provisioning file found. Attempting auto-enrollment...");
                match crate::provisioning::load(&prov_path) {
                    Ok(prov) => {
                        match self.enroll(prov.admin_url, prov.enrollment_code).await {
                            Ok(_) => {
                                info!("Auto-enrollment successful. Removing provisioning file.");
                                let _ = fs::remove_file(&prov_path);
                            }
                            Err(e) => {
                                warn!("Auto-enrollment failed: {}. Provisioning file retained for retry.", e);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to read provisioning file: {}", e);
                    }
                }
            } else {
                info!("Agent already enrolled. Removing provisioning file.");
                let _ = fs::remove_file(&prov_path);
            }
        }

        loop {
            let (enrolled, admin_url) = {
                let cfg = self.config.read().unwrap();
                (cfg.enrolled_admin.is_some(), cfg.admin_url.clone())
            };

            if enrolled {
                if let Some(url) = admin_url {
                    match self.sync_heartbeat(&url).await {
                        Ok(_) => {
                            if !self.connected.load(Ordering::Relaxed) {
                                self.connected.store(true, Ordering::Relaxed);
                                let _ = self.ui_proxy.send_event(UiEvent::UpdateConfigInUI(json!({
                                    "connected": true,
                                }).to_string()));
                            }
                        }
                        Err(e) => {
                            warn!("Sync heartbeat failed: {}. Re-trying in 1 minute...", e);
                            if self.connected.load(Ordering::Relaxed) {
                                self.connected.store(false, Ordering::Relaxed);
                                let _ = self.ui_proxy.send_event(UiEvent::UpdateConfigInUI(json!({
                                    "connected": false,
                                }).to_string()));
                            }
                            sleep(Duration::from_secs(60)).await;
                            continue;
                        }
                    }
                }
            } else if self.connected.load(Ordering::Relaxed) {
                self.connected.store(false, Ordering::Relaxed);
            }
            
            let wait = 30;
            sleep(Duration::from_secs(wait)).await;
        }
    }

    pub async fn enroll(&self, url: String, code: String) -> Result<(), String> {
        info!("Attempting enterprise enrollment.");

        // REAL ENROLLMENT (gRPC)
        #[cfg(feature = "enterprise")]
        {
            let (uuid, identity_key) = {
                let mut cfg = self.config.write().unwrap();
                if cfg.identity_key_pem.is_none() {
                    let key = generate_identity_key().map_err(|e| e.to_string())?;
                    cfg.identity_key_pem = Some(key);
                }
                (cfg.uuid.clone(), cfg.identity_key_pem.clone().unwrap())
            };

            let mut client = AgentControllerClient::connect(url.clone()).await
                .map_err(|e| format!("Failed to connect to Admin platform: {}", e))?;

            let hostname = whoami::hostname().unwrap_or_else(|_| "unknown-host".to_string());

            let request = tonic::Request::new(RegisterRequest {
                agent_uuid: uuid,
                hostname,
                ip_address: "127.0.0.1".to_string(),
                public_key: identity_key.into_bytes(),
                enrollment_code: code,
                agent_version: env!("CARGO_PKG_VERSION").to_string(),
            });

            match client.register_agent(request).await {
                Ok(response) => {
                    let res = response.into_inner();
                    let agent_id;
                    {
                        let mut cfg = self.config.write().unwrap();
                        cfg.enrolled_admin = Some(res.org_id.clone());
                        cfg.admin_url = Some(url);
                        cfg.admin_cert_pem = Some(String::from_utf8_lossy(&res.certificate).to_string());
                        save_config(&cfg);
                        agent_id = cfg.uuid.clone();
                    }
                    
                    self.connected.store(true, Ordering::Relaxed);

                    let _ = self.ui_proxy.send_event(UiEvent::UpdateConfigInUI(json!({
                        "enrolled": true,
                        "orgId": res.org_id,
                        "connected": true,
                    }).to_string()));

                    info!("Successfully enrolled with Admin Platform.");

                    // Push an immediate environment report (don't wait for heartbeat cycle)
                    let hostname = whoami::hostname().unwrap_or_else(|_| "unknown-host".to_string());
                    let ip = local_ip_address();
                    self.push_environment_report(&mut client, &agent_id, &hostname, &ip).await;

                    Ok(())
                }
                Err(e) => Err(format!("Registration failed: {}", e.message())),
            }
        }
        #[cfg(not(feature = "enterprise"))]
        {
            let _ = (url, code);
            Err("Enterprise features are disabled in this build.".to_string())
        }
    }

    pub async fn disconnect(&self) {
        let mut cfg = self.config.write().unwrap();
        cfg.enrolled_admin = None;
        cfg.admin_url = None;
        cfg.admin_cert_pem = None;
        cfg.enforce_redaction = false;
        cfg.disconnect_password_hash = None;
        save_config(&cfg);
        
        self.connected.store(false, Ordering::Relaxed);

        let _ = self.ui_proxy.send_event(UiEvent::UpdateConfigInUI(json!({
            "enrolled": false,
            "orgId": "N/A",
            "connected": false,
            "redactionEnforced": false,
            "upstreamUrlEnforced": false,
            "upstreamApiKeyEnforced": false,
            "bindPortEnforced": false,
            "ocrEnforced": false,
            "atrAutoUpdateEnforced": false,
            "allowCustomAllowlists": true,
            "detectionTogglesEnforced": false,
            "disconnect_password_required": false,
        }).to_string()));

        info!("Agent disconnected from Enterprise management.");
    }

    /// Compile and send the environment report via the existing gRPC client
    #[cfg(feature = "enterprise")]
    async fn push_environment_report(&self, client: &mut AgentControllerClient<Channel>, uuid: &str, hostname: &str, ip: &str) {
        let port = {
            let cfg = self.config.read().unwrap();
            cfg.bind_port
        };

        let report = crate::discovery::compile_report(uuid, port).await;
        let report_json = serde_json::to_string(&report).unwrap_or_default();

        let heartbeat = tonic::Request::new(HeartbeatRequest {
            agent_uuid: uuid.to_string(),
            hostname: hostname.to_string(),
            ip_address: ip.to_string(),
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
            environment_report_json: report_json,
        });

        match client.heartbeat(heartbeat).await {
            Ok(resp) => {
                let hb_resp = resp.into_inner();
                if hb_resp.agent_revoked {
                    info!("Agent has been revoked by admin. Disconnecting.");
                    let _ = self.ui_proxy.send_event(UiEvent::DisconnectAgent);
                }
            }
            Err(e) => {
                warn!("Failed to send environment report heartbeat: {}", e);
            }
        }
    }

    async fn sync_heartbeat(&self, url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (uuid, _enrolled_admin) = {
            let cfg = self.config.read().unwrap();
            (cfg.uuid.clone(), cfg.enrolled_admin.clone())
        };

        info!("Performing sync with Admin Platform at {}...", url);

        #[cfg(feature = "enterprise")]
        {
            let mut client = AgentControllerClient::connect(url.to_string()).await?;
            let hostname = whoami::hostname().unwrap_or_else(|_| "unknown-host".to_string());
            let ip = local_ip_address();
            
            // Push Environment Report (includes discovery data + heartbeat, reuses client)
            self.push_environment_report(&mut client, &uuid, &hostname, &ip).await;

            // Push Logs
            let logs = audit::read_logs();
            let entries: Vec<AuditLogEntry> = logs.iter().take(50).map(|l| AuditLogEntry {
                timestamp: l.timestamp.clone(),
                content_type: l.content_type.clone(),
                action_taken: l.action_taken.clone(),
                preview: l.preview.clone(),
                severity: l.severity.clone(),
                detection_method: l.detection_method.clone(),
                timeout_triggered: false,
                policy_enforced: true,
            }).collect();

            if !entries.is_empty() {
                let log_batch = tonic::Request::new(LogBatch {
                    agent_uuid: uuid.clone(),
                    logs: entries,
                    timestamp_ms: chrono::Utc::now().timestamp_millis(),
                });
                let _ = client.push_logs(log_batch).await?;
                info!("Uploaded log batch to Admin Platform.");
            }

            // Pull Policy
            let policy_req = tonic::Request::new(PolicyRequest {
                agent_uuid: uuid,
                current_version: env!("CARGO_PKG_VERSION").to_string(),
            });
            
            match client.get_policy(policy_req).await {
                Ok(res) => {
                    let policy = res.into_inner();
                    let enforcement = policy.enforcement.unwrap_or_default();
                    let mut cfg = self.config.write().unwrap();

                    // Apply enforcement fields
                    cfg.enforce_redaction = enforcement.redaction_enforced;

                    if enforcement.upstream_url_enforced {
                        cfg.upstream_url = enforcement.upstream_url.clone();
                    }
                    if enforcement.upstream_api_key_enforced {
                        cfg.upstream_api_key = Some(enforcement.upstream_api_key.clone());
                    }
                    if enforcement.bind_port_enforced && enforcement.bind_port > 0 {
                        cfg.bind_port = enforcement.bind_port as u16;
                    }
                    if enforcement.ocr_enforced {
                        cfg.enable_ocr = enforcement.enable_ocr;
                    }
                    if enforcement.atr_auto_update_enforced {
                        cfg.disable_atr_auto_update = enforcement.disable_atr_auto_update;
                    }

                    // Detection categories
                    if !enforcement.enabled_detection_categories.is_empty() {
                        cfg.detect_api_keys = enforcement.enabled_detection_categories.contains(&"api_keys".to_string());
                        cfg.detect_db_credentials = enforcement.enabled_detection_categories.contains(&"db_credentials".to_string());
                        cfg.detect_pii = enforcement.enabled_detection_categories.contains(&"pii".to_string());
                        cfg.detect_injection = enforcement.enabled_detection_categories.contains(&"injection".to_string());
                        cfg.detect_code_execution = enforcement.enabled_detection_categories.contains(&"code_execution".to_string());
                        cfg.detect_social_engineering = enforcement.enabled_detection_categories.contains(&"social_engineering".to_string());
                        cfg.detect_skill_compromise = enforcement.enabled_detection_categories.contains(&"skill_compromise".to_string());
                        cfg.detect_excessive_autonomy = enforcement.enabled_detection_categories.contains(&"excessive_autonomy".to_string());
                        cfg.detect_model_abuse = enforcement.enabled_detection_categories.contains(&"model_abuse".to_string());
                        cfg.detect_data_poisoning = enforcement.enabled_detection_categories.contains(&"data_poisoning".to_string());
                    }

                    // Disconnect password hash
                    cfg.disconnect_password_hash = if enforcement.disconnect_password_hash.is_empty() {
                        None
                    } else {
                        Some(enforcement.disconnect_password_hash.clone())
                    };

                    // Allowlists
                    if !enforcement.allowlists.is_empty() {
                        for a in enforcement.allowlists.iter() {
                            if !cfg.allowlists_regex.contains(a) {
                                cfg.allowlists_regex.push(a.clone());
                            }
                        }
                    }

                    save_config(&cfg);

                    // Build UI update payload
                    let mut ui_cfg = json!({
                        "enforce_redaction": cfg.enforce_redaction,
                        "redactionEnforced": enforcement.redaction_enforced,
                        "detectionTogglesEnforced": !enforcement.enabled_detection_categories.is_empty(),
                        "disconnect_password_required": cfg.disconnect_password_hash.is_some(),
                        "detect_api_keys": cfg.detect_api_keys,
                        "detect_db_credentials": cfg.detect_db_credentials,
                        "detect_pii": cfg.detect_pii,
                        "detect_injection": cfg.detect_injection,
                        "detect_code_execution": cfg.detect_code_execution,
                        "detect_social_engineering": cfg.detect_social_engineering,
                        "detect_skill_compromise": cfg.detect_skill_compromise,
                        "detect_excessive_autonomy": cfg.detect_excessive_autonomy,
                        "detect_model_abuse": cfg.detect_model_abuse,
                        "detect_data_poisoning": cfg.detect_data_poisoning,
                        "enable_ocr": cfg.enable_ocr,
                        "upstream_url": cfg.upstream_url,
                        "disable_atr_auto_update": cfg.disable_atr_auto_update,
                    });

                    if enforcement.upstream_url_enforced {
                        ui_cfg["upstreamUrlEnforced"] = json!(true);
                        ui_cfg["upstream_url"] = json!(enforcement.upstream_url);
                    }
                    if enforcement.upstream_api_key_enforced {
                        ui_cfg["upstreamApiKeyEnforced"] = json!(true);
                    }
                    if enforcement.bind_port_enforced {
                        ui_cfg["bindPortEnforced"] = json!(true);
                        ui_cfg["bind_port"] = json!(enforcement.bind_port);
                    }
                    if enforcement.ocr_enforced {
                        ui_cfg["ocrEnforced"] = json!(true);
                    }
                    if enforcement.atr_auto_update_enforced {
                        ui_cfg["atrAutoUpdateEnforced"] = json!(true);
                    }
                    ui_cfg["allowCustomAllowlists"] = json!(enforcement.allow_custom_allowlists);

                    let _ = self.ui_proxy.send_event(UiEvent::UpdateConfigInUI(ui_cfg.to_string()));

                    info!("Synchronized policy version: {}", policy.policy_version);
                }
                Err(status) => {
                    if status.code() == tonic::Code::NotFound {
                        info!("Agent has been revoked. Disconnecting.");
                        let _ = self.ui_proxy.send_event(UiEvent::DisconnectAgent);
                        return Err("Agent revoked".into());
                    }
                    warn!("GetPolicy failed: {}. Retrying...", status);
                    return Err(status.message().into());
                }
            }
        }

        #[cfg(not(feature = "enterprise"))]
        {
            let _ = (uuid, url);
            warn!("Skipping heartbeat: Enterprise features disabled.");
        }

        Ok(())
    }
}

/// Get the local IP address of this machine
#[cfg(feature = "enterprise")]
fn local_ip_address() -> String {
    // Try to get the local IP by connecting to a public DNS
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:53").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                return local_addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}
