use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;
use serde_json;

use crate::portal::grpc::agent::{
    agent_controller_server::AgentController, HeartbeatRequest, HeartbeatResponse,
    LogAckResponse, LogBatch, MetricsAckResponse, MetricsBatch, PolicyRequest, PolicyResponse,
    RegisterRequest, RegisterResponse, PolicyEnforcement,
};
use crate::portal::mtls::MtlsStore;

pub struct AgentControllerImpl {
    pool: PgPool,
    mtls_store: MtlsStore,
    admin_grpc_url: String,
}

impl AgentControllerImpl {
    pub fn new(pool: PgPool, mtls_store: MtlsStore, admin_grpc_url: String) -> Self {
        Self { pool, mtls_store, admin_grpc_url }
    }
}

#[tonic::async_trait]
impl AgentController for AgentControllerImpl {
    async fn register_agent(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<RegisterResponse>, Status> {
        let req = request.into_inner();

        let code = sqlx::query_as::<_, (String, Uuid)>(
            "SELECT code, org_id FROM enrollment_codes WHERE code = $1 AND expires_at > NOW() AND used_by IS NULL",
        )
        .bind(&req.enrollment_code)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .ok_or_else(|| Status::failed_precondition("Invalid or expired enrollment code"))?;

        let org_id = code.1;

        let (cert_pem, _key_pem) = self
            .mtls_store
            .generate_agent_cert(&req.agent_uuid, &req.hostname)
            .map_err(|e| Status::internal(e.to_string()))?;

        sqlx::query(
            r#"INSERT INTO agents (uuid, org_id, hostname, ip_address, status, last_seen, identity_key_pem, cert_pem, agent_version)
               VALUES ($1, $2, $3, $4, 'online', NOW(), $5, $6, $7)
               ON CONFLICT (uuid) DO UPDATE SET
                   hostname = EXCLUDED.hostname,
                   ip_address = EXCLUDED.ip_address,
                   status = 'online',
                   last_seen = NOW(),
                   agent_version = EXCLUDED.agent_version"#,
        )
        .bind(&req.agent_uuid)
        .bind(org_id)
        .bind(&req.hostname)
        .bind(&req.ip_address)
        .bind(&String::from_utf8_lossy(&req.public_key))
        .bind(&cert_pem)
        .bind(&req.agent_version)
        .execute(&self.pool)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        sqlx::query("UPDATE enrollment_codes SET used_by = $1, used_at = NOW() WHERE code = $2")
            .bind(&req.agent_uuid)
            .bind(&req.enrollment_code)
            .execute(&self.pool)
            .await
            .ok();

        Ok(Response::new(RegisterResponse {
            certificate: cert_pem.into_bytes(),
            admin_grpc_endpoint: self.admin_grpc_url.clone(),
            org_id: org_id.to_string(),
        }))
    }

    async fn push_logs(
        &self,
        request: Request<LogBatch>,
    ) -> Result<Response<LogAckResponse>, Status> {
        let batch = request.into_inner();

        let agent = sqlx::query_as::<_, (Uuid,)>("SELECT org_id FROM agents WHERE uuid = $1")
            .bind(&batch.agent_uuid)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found("Agent not found"))?;

        let org_id = agent.0;

        for log in batch.logs.iter() {
            sqlx::query(
                r#"INSERT INTO audit_logs (org_id, agent_uuid, content_type, severity, action_taken, detection_method, preview, flagged_at, session_id, timeout_triggered, policy_enforced, user_name)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11, $12)
                   ON CONFLICT (org_id, agent_uuid, content_type, action_taken, flagged_at, session_id, preview) DO NOTHING"#,
            )
            .bind(org_id)
            .bind(&batch.agent_uuid)
            .bind(&log.content_type)
            .bind(&log.severity)
            .bind(&log.action_taken)
            .bind(&log.detection_method)
            .bind(&log.preview)
            .bind(&log.timestamp)
            .bind(&log.session_id)
            .bind(log.timeout_triggered)
            .bind(log.policy_enforced)
            .bind(&log.user_name)
            .execute(&self.pool)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        }

        sqlx::query("UPDATE agents SET last_seen = NOW(), status = 'online' WHERE uuid = $1")
            .bind(&batch.agent_uuid)
            .execute(&self.pool)
            .await
            .ok();

        Ok(Response::new(LogAckResponse { success: true }))
    }

    async fn get_policy(
        &self,
        request: Request<PolicyRequest>,
    ) -> Result<Response<PolicyResponse>, Status> {
        let req = request.into_inner();

        let agent = sqlx::query_as::<_, (String, Uuid)>(
            "SELECT hostname, org_id FROM agents WHERE uuid = $1 AND status != 'revoked'",
        )
        .bind(&req.agent_uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .ok_or_else(|| Status::not_found("Agent not found or revoked"))?;

        let (hostname, org_id) = (agent.0.clone(), agent.1);

        // Fetch org disconnect password hash
        let disconnect_password_hash: Option<String> = sqlx::query_scalar(
            "SELECT disconnect_password_hash FROM organizations WHERE id = $1",
        )
        .bind(org_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .unwrap_or(None);

        let policy_row = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<i32>, Option<bool>, Option<bool>, bool, Option<String>, Option<serde_json::Value>, Option<serde_json::Value>, Option<serde_json::Value>, Uuid, i32, i32)>(
            r#"SELECT 
                name, on_detection, upstream_url, upstream_api_key, bind_port,
                enable_ocr, disable_atr_auto_update, allow_custom_allowlists,
                bearer_token, detection_overrides, custom_regex, allowlists, id,
                priority, version
               FROM policies 
               WHERE org_id = $1 AND (
                   target_mode = 'all'
                   OR (
                       target_mode = 'group'
                       AND EXISTS (
                           SELECT 1 FROM policy_assignments pa
                           JOIN agent_group_members agm ON pa.group_id = agm.group_id
                           WHERE pa.policy_id = policies.id AND agm.agent_uuid = $2
                       )
                   )
                   OR (
                       target_mode = 'hostname_regex'
                       AND $3 ~ target_regex
                   )
               )
               ORDER BY priority ASC, updated_at DESC
               LIMIT 1"#,
        )
        .bind(org_id)
        .bind(&req.agent_uuid)
        .bind(&hostname)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let policy = match policy_row {
            Some(p) => {
                let bearer_token: Option<String> = p.8.clone();

                let detection_categories: Vec<String> = p
                    .9
                    .and_then(|v| serde_json::from_value(v).ok())
                    .unwrap_or_default();

                let custom_regex: Vec<String> = p
                    .10
                    .and_then(|v| serde_json::from_value(v).ok())
                    .unwrap_or_default();

                let allowlists: Vec<String> = p
                    .11
                    .and_then(|v| serde_json::from_value(v).ok())
                    .unwrap_or_default();

                let policy_name = p.0.clone();
                let policy_ver = p.14;
                let policy_id = p.12;

                let version_string = format!("{} v{}", policy_name, policy_ver);

                // Load upstream routes
                let db_routes = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, i32)>(
                    "SELECT match_pattern, url, api_key, api_key_source, priority
                     FROM policy_upstream_routes
                     WHERE policy_id = $1
                     ORDER BY priority ASC, created_at ASC",
                )
                .bind(policy_id)
                .fetch_all(&self.pool)
                .await
                .unwrap_or_default();

                let upstream_routes: Vec<crate::portal::grpc::agent::UpstreamRoute> = db_routes
                    .into_iter()
                    .map(|(mp, url, key, source, prio)| crate::portal::grpc::agent::UpstreamRoute {
                        match_pattern: mp,
                        url,
                        api_key: key.unwrap_or_default(),
                        api_key_source: source.unwrap_or_default(),
                        priority: prio,
                    })
                    .collect();

                // Update agents.policy_version so the portal displays the name + version
                let _ = sqlx::query("UPDATE agents SET policy_version = $2 WHERE uuid = $1")
                    .bind(&req.agent_uuid)
                    .bind(&version_string)
                    .execute(&self.pool)
                    .await;

                PolicyResponse {
                    policy_version: version_string,
                    enforcement: Some(PolicyEnforcement {
                        redaction_enforced: p.1 == "enforced_redact" || p.1 == "enforced_block",
                        on_detection: p.1.clone(),
                        upstream_url_enforced: p.2.is_some(),
                        upstream_url: p.2.unwrap_or_default(),
                        upstream_api_key_enforced: p.3.is_some(),
                        upstream_api_key: p.3.unwrap_or_default(),
                        bind_port_enforced: p.4.is_some(),
                        bind_port: p.4.unwrap_or(0),
                        ocr_enforced: p.5.is_some(),
                        enable_ocr: p.5.unwrap_or(true),
                        atr_auto_update_enforced: p.6.is_some(),
                        disable_atr_auto_update: p.6.unwrap_or(false),
                        allow_custom_allowlists: p.7,
                        bearer_token_enforced: bearer_token.as_ref().is_some_and(|t| !t.is_empty()),
                        bearer_token: bearer_token.unwrap_or_default(),
                        enabled_detection_categories: detection_categories,
                        custom_regex,
                        allowlists,
                        disconnect_password_hash: disconnect_password_hash.unwrap_or_default(),
                        upstream_routes,
                    }),
                    signature: vec![],
                }
            }
            None => PolicyResponse {
                policy_version: "0".to_string(),
                enforcement: None,
                signature: vec![],
            },
        };

        Ok(Response::new(policy))
    }

    async fn heartbeat(
        &self,
        request: Request<HeartbeatRequest>,
    ) -> Result<Response<HeartbeatResponse>, Status> {
        let req = request.into_inner();

        let agent =
            sqlx::query_as::<_, (String, Uuid)>("SELECT status, org_id FROM agents WHERE uuid = $1")
                .bind(&req.agent_uuid)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| Status::internal(e.to_string()))?;

        let (revoked, org_id) = match agent {
            Some((status, org)) => (status == "revoked", org),
            None => (true, uuid::Uuid::nil()),
        };

        if !revoked {
            sqlx::query(
                "UPDATE agents SET last_seen = NOW(), status = 'online', hostname = $2, ip_address = $3 WHERE uuid = $1",
            )
            .bind(&req.agent_uuid)
            .bind(&req.hostname)
            .bind(&req.ip_address)
            .execute(&self.pool)
            .await
            .ok();

            // Store environment report if provided
            if !req.environment_report_json.is_empty() {
                let report_value: Result<serde_json::Value, _> =
                    serde_json::from_str(&req.environment_report_json);

                match report_value {
                    Ok(report) => {
                        // Replace the latest report for this agent (delete old, insert new)
                        let _ = sqlx::query(
                            "DELETE FROM agent_environment_reports WHERE org_id = $1 AND agent_uuid = $2",
                        )
                        .bind(org_id)
                        .bind(&req.agent_uuid)
                        .execute(&self.pool)
                        .await;

                        let _ = sqlx::query(
                            r#"INSERT INTO agent_environment_reports (org_id, agent_uuid, report, detected_at)
                               VALUES ($1, $2, $3, NOW())"#,
                        )
                        .bind(org_id)
                        .bind(&req.agent_uuid)
                        .bind(&report)
                        .execute(&self.pool)
                        .await;
                    }
                    Err(e) => {
                        tracing::warn!("Failed to parse environment report JSON: {}", e);
                    }
                }
            }
        }

        Ok(Response::new(HeartbeatResponse {
            policy_updated: false,
            latest_policy_version: env!("CARGO_PKG_VERSION").to_string(),
            agent_revoked: revoked,
        }))
    }

    async fn push_metrics(
        &self,
        request: Request<MetricsBatch>,
    ) -> Result<Response<MetricsAckResponse>, Status> {
        let batch = request.into_inner();

        let org_id = sqlx::query_as::<_, (Uuid,)>(
            "SELECT org_id FROM agents WHERE uuid = $1",
        )
        .bind(&batch.agent_uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .ok_or_else(|| Status::not_found("Agent not found"))?
        .0;

        let agent_uuid = Uuid::parse_str(&batch.agent_uuid)
            .map_err(|e| Status::invalid_argument(format!("Invalid agent_uuid: {}", e)))?;

        for m in batch.metrics.iter() {
            sqlx::query(
                r#"INSERT INTO agent_request_metrics 
               (org_id, agent_uuid, timestamp_ms, session_id, model_requested, model_used,
                prompt_tokens, completion_tokens, total_tokens,
                total_latency_ms, detection_latency_ms, upstream_latency_ms,
                was_cached, was_blocked, was_redacted, upstream_status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)"#,
            )
            .bind(org_id)
            .bind(agent_uuid)
            .bind(m.timestamp_ms)
            .bind(&m.session_id)
            .bind(&m.model_requested)
            .bind(&m.model_used)
            .bind(m.prompt_tokens.map(|v| v as i64))
            .bind(m.completion_tokens.map(|v| v as i64))
            .bind(m.total_tokens.map(|v| v as i64))
            .bind(m.total_latency_ms as i64)
            .bind(m.detection_latency_ms as i64)
            .bind(m.upstream_latency_ms as i64)
            .bind(m.was_cached)
            .bind(m.was_blocked)
            .bind(m.was_redacted)
            .bind(m.upstream_status as i32)
            .execute(&self.pool)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        }

        sqlx::query("UPDATE agents SET last_seen = NOW(), status = 'online' WHERE uuid = $1")
            .bind(&batch.agent_uuid)
            .execute(&self.pool)
            .await
            .ok();

        Ok(Response::new(MetricsAckResponse { success: true }))
    }
}
