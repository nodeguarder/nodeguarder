use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{TcpStream, SocketAddr};
use std::time::Duration;
use tracing::info;

/// A detected LLM endpoint on the local machine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedEndpoint {
    /// Type of the detected service (ollama, lm_studio, vllm, openai_env, etc.)
    pub service_type: String,
    /// Human-readable name
    pub name: String,
    /// Base URL of the detected service
    pub url: String,
    /// Whether the service is currently reachable
    pub reachable: bool,
    /// Model names detected (if discoverable)
    pub models: Vec<String>,
    /// Raw metadata (provider, version, etc.)
    pub metadata: HashMap<String, String>,
}

/// A detected IDE configuration relevant to LLM usage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedIde {
    /// IDE type (vscode, cursor, jetbrains, continue, windsurf)
    pub ide_type: String,
    /// Path to the config file
    pub config_path: String,
    /// Whether Copilot is enabled (for VSCode/Cursor/JetBrains)
    pub copilot_enabled: Option<bool>,
    /// LLM proxy settings found
    pub proxy_settings: Option<String>,
    /// Whether the IDE is currently detected as running
    pub is_running: bool,
}

/// A detected environment variable relevant to LLM configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedEnvVar {
    /// Variable name (e.g., OPENAI_API_KEY)
    pub name: String,
    /// Whether the variable is set
    pub is_set: bool,
    /// Prefix of the value (first 8 chars for identification, or empty if not set)
    pub value_prefix: String,
}

/// The full environment report compiled by the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentReport {
    /// Agent UUID
    pub agent_uuid: String,
    /// Hostname
    pub hostname: String,
    /// Timestamp of the report
    pub reported_at: String,
    /// Detected LLM endpoints
    pub detected_endpoints: Vec<DetectedEndpoint>,
    /// Detected IDEs
    pub detected_ides: Vec<DetectedIde>,
    /// Detected environment variables
    pub detected_env_vars: Vec<DetectedEnvVar>,
    /// OS info
    pub os: String,
    /// Suggested upstream URL (best guess based on priority)
    pub suggested_upstream_url: Option<String>,
    /// Suggested upstream API key source (env var name or detected config)
    pub suggested_upstream_key_source: Option<String>,
    /// Suggested Continue config snippet
    pub continue_config_suggestion: Option<ContinueConfigSuggestion>,
    /// All detected suggested configurations
    pub config_suggestions: Vec<ConfigSuggestion>,
}

/// A configuration suggestion for the admin
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSuggestion {
    /// Category (upstream_url, api_key, proxy_setting, etc.)
    pub category: String,
    /// Human-readable description
    pub description: String,
    /// Suggested value
    pub suggested_value: String,
    /// Priority (high, medium, low)
    pub priority: String,
    /// Number of agents this applies to (set by portal aggregation)
    #[serde(default)]
    pub affected_agent_count: u64,
}

/// Suggestion for Continue.dev IDE configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContinueConfigSuggestion {
    /// Current apiBase in Continue config (if found)
    pub current_api_base: Option<String>,
    /// Suggested apiBase (NodeGuarder proxy URL)
    pub suggested_api_base: String,
    /// Whether Continue is already configured correctly
    pub already_configured: bool,
}

/// Well-known LLM ports to scan
const LLM_PORTS: &[(u16, &str, &str)] = &[
    (11434, "ollama", "Ollama"),
    (1234, "lm_studio", "LM Studio"),
    (8000, "vllm", "vLLM"),
    (5000, "textgen_webui", "text-generation-webui"),
    (7860, "textgen_webui_alt", "text-generation-webui (alt)"),
    (5001, "koboldcpp", "KoboldCPP"),
    (8080, "llamafile", "llamafile"),
    (4891, "gpt4all", "GPT4All"),
    (1337, "jan", "Jan.ai"),
    (3000, "localai", "LocalAI"),
    (9090, "openai_api_proxy", "OpenAI API Proxy"),
    (4000, "litellm", "LiteLLM Proxy"),
    (8008, "tabby", "Tabby"),
    (8787, "portkey", "Portkey Gateway"),
];

/// Known IDE config file paths (relative to user home)
const IDE_CONFIG_PATHS: &[(&str, &str, &str, &str)] = &[
    // (ide_type, config_subpath, proxy_setting_key, copilot_key)
    ("vscode", r"AppData\Roaming\Code\User\settings.json", "http.proxy", "github.copilot.enabled"),
    ("vscodium", r"AppData\Roaming\VSCodium\User\settings.json", "http.proxy", "github.copilot.enabled"),
    ("cursor", r"AppData\Roaming\Cursor\User\settings.json", "http.proxy", "github.copilot.enabled"),
    ("windsurf", r"AppData\Roaming\Windsurf\User\settings.json", "http.proxy", "github.copilot.enabled"),
];

/// Known environment variables to check
const LLM_ENV_VARS: &[&str] = &[
    "OPENAI_API_KEY",
    "AZURE_OPENAI_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "COHERE_API_KEY",
    "REPLICATE_API_TOKEN",
    "HUGGINGFACE_API_TOKEN",
    "TOGETHER_API_KEY",
    "MISTRAL_API_KEY",
    "DEEPSEEK_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "XAI_API_KEY",
    "PERPLEXITY_API_KEY",
    "AI21_API_KEY",
    "FIREWORKS_API_KEY",
];

/// Scan a port on localhost to see if something is listening
fn scan_port(port: u16) -> bool {
    let addr: SocketAddr = match format!("127.0.0.1:{}", port).parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Check if a port is serving HTTP (not just a raw TCP listener like Docker relay)
async fn is_http_server(base_url: &str) -> bool {
    match reqwest::Client::builder()
        .timeout(Duration::from_secs(1))
        .build()
    {
        Ok(client) => client.get(base_url).send().await.is_ok(),
        Err(_) => false,
    }
}

/// Try to fetch models from an OpenAI-compatible endpoint
async fn fetch_models(base_url: &str) -> Vec<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok();

    let client = match client {
        Some(c) => c,
        None => return vec![],
    };

    // Try OpenAI-compatible /v1/models first
    let models_url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    match client.get(&models_url).send().await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                    let models: Vec<String> = data
                        .iter()
                        .filter_map(|m| m.get("id").and_then(|id| id.as_str()))
                        .map(|s| s.to_string())
                        .collect();
                    if !models.is_empty() {
                        return models;
                    }
                }
            }
        }
        Err(_) => {}
    }

    // Try Ollama-specific /api/tags
    let tags_url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    match client.get(&tags_url).send().await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
                    let names: Vec<String> = models
                        .iter()
                        .filter_map(|m| m.get("name").and_then(|n| n.as_str()))
                        .map(|s| s.to_string())
                        .collect();
                    if !names.is_empty() {
                        return names;
                    }
                }
            }
        }
        Err(_) => {}
    }

    vec![]
}

/// Detect LLM endpoints by scanning well-known ports
async fn detect_endpoints() -> Vec<DetectedEndpoint> {
    let mut endpoints = Vec::new();

    for &(port, service_type, name) in LLM_PORTS {
        if scan_port(port) {
            let base_url = format!("http://127.0.0.1:{}", port);

            // Verify this is actually an HTTP server (not Docker relay, system service, etc.)
            if !is_http_server(&base_url).await {
                continue;
            }

            let models = fetch_models(&base_url).await;

            let mut metadata = HashMap::new();
            metadata.insert("port".to_string(), port.to_string());
            metadata.insert("protocol".to_string(), "http".to_string());

            endpoints.push(DetectedEndpoint {
                service_type: service_type.to_string(),
                name: name.to_string(),
                url: format!("{}/v1", base_url),
                reachable: true,
                models,
                metadata,
            });
        }
    }

    endpoints
}

/// Read VSCode-style settings.json files
fn read_vscode_settings(path: &std::path::Path) -> Option<serde_json::Value> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Detect IDEs and their LLM-related config
fn detect_ides() -> Vec<DetectedIde> {
    let mut ides = Vec::new();
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();

    let home = match home {
        Some(h) => h,
        None => return ides,
    };

    for &(ide_type, config_subpath, _proxy_key, _copilot_key) in IDE_CONFIG_PATHS {
        let config_path = std::path::Path::new(&home).join(config_subpath);
        let is_running = false; // Would need process enumeration - skip for now

        if config_path.exists() {
            if let Some(settings) = read_vscode_settings(&config_path) {
                let proxy = settings.get("http.proxy").and_then(|v| v.as_str()).map(|s| s.to_string());
                let copilot = settings
                    .get("github.copilot.enabled")
                    .or_else(|| settings.get("github.copilot.advanced"))
                    .and_then(|v| v.as_bool());

                ides.push(DetectedIde {
                    ide_type: ide_type.to_string(),
                    config_path: config_path.to_string_lossy().to_string(),
                    copilot_enabled: copilot,
                    proxy_settings: proxy,
                    is_running,
                });
            }
        }
    }

    // Check if Cursor process is running (detects it even without settings.json)
    #[cfg(windows)]
    {
        if !ides.iter().any(|i| i.ide_type == "cursor") {
            let cursor_running = std::process::Command::new("tasklist")
                .args(["/FI", "IMAGENAME eq Cursor.exe", "/NH"])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).contains("Cursor.exe"))
                .unwrap_or(false);
            if cursor_running {
                ides.push(DetectedIde {
                    ide_type: "cursor".to_string(),
                    config_path: "Process: Cursor.exe".to_string(),
                    copilot_enabled: None,
                    proxy_settings: None,
                    is_running: true,
                });
            }
        }
    }

    // Check for Continue.dev config
    let continue_paths = &[
        format!(r"{}\AppData\Local\Continue\config.json", home),
        format!(r"{}\.continue\config.json", home),
        format!("{}/.continue/config.json", home),
    ];

    for path_str in continue_paths {
        let config_path = std::path::Path::new(&path_str);
        if config_path.exists() {
            if let Some(settings) = read_vscode_settings(config_path) {
                let models = settings.get("models").and_then(|m| m.as_array());
                let copilot_enabled = None;
                let mut proxy_settings = None;

                if let Some(models_arr) = models {
                    for model in models_arr {
                        if let Some(provider) = model.get("provider").and_then(|p| p.as_str()) {
                            if provider == "openai" || provider == "openai-with-key" {
                                if let Some(api_base) = model.get("apiBase").and_then(|a| a.as_str()) {
                                    proxy_settings = Some(format!("apiBase: {}", api_base));
                                }
                            }
                        }
                    }
                }

                ides.push(DetectedIde {
                    ide_type: "continue".to_string(),
                    config_path: config_path.to_string_lossy().to_string(),
                    copilot_enabled,
                    proxy_settings,
                    is_running: false,
                });
            }
        }
    }

    // Check for Zed editor config
    let zed_path = format!(r"{}\AppData\Roaming\Zed\settings.json", home);
    let zed_config = std::path::Path::new(&zed_path);
    if zed_config.exists() {
        if let Some(settings) = read_vscode_settings(zed_config) {
            let proxy = settings.get("assistant")
                .and_then(|a| a.get("openai_base_url"))
                .and_then(|v| v.as_str())
                .or_else(|| settings.get("openai_base_url").and_then(|v| v.as_str()))
                .or_else(|| settings.get("base_url").and_then(|v| v.as_str()))
                .map(|s| format!("apiBase: {}", s));

            ides.push(DetectedIde {
                ide_type: "zed".to_string(),
                config_path: zed_config.to_string_lossy().to_string(),
                copilot_enabled: None,
                proxy_settings: proxy,
                is_running: false,
            });
        }
    }

    // Check for JetBrains proxy config
    let jetbrains_dir = format!(r"{}\AppData\Roaming\JetBrains", home);
    let jetbrains_path = std::path::Path::new(&jetbrains_dir);
    if jetbrains_path.exists() {
        if let Ok(entries) = std::fs::read_dir(jetbrains_path) {
            for entry in entries.flatten() {
                let proxy_path = entry.path().join("options").join("proxy.xml");
                if proxy_path.exists() {
                    let content = std::fs::read_to_string(&proxy_path).unwrap_or_default();
                    let has_proxy = content.contains("<proxy>") || content.contains("proxyHost");
                    if has_proxy {
                        ides.push(DetectedIde {
                            ide_type: "jetbrains".to_string(),
                            config_path: proxy_path.to_string_lossy().to_string(),
                            copilot_enabled: None,
                            proxy_settings: Some("Custom proxy configured".to_string()),
                            is_running: false,
                        });
                    }
                }
            }
        }
    }

    ides
}

/// Detect environment variables related to LLMs
fn detect_env_vars() -> Vec<DetectedEnvVar> {
    let mut vars = Vec::new();
    for &var_name in LLM_ENV_VARS {
        let value = std::env::var(var_name).ok();
        let prefix = value.as_ref().map(|v| {
            if v.len() > 12 {
                format!("{}...", &v[..12])
            } else {
                v.clone()
            }
        }).unwrap_or_default();

        vars.push(DetectedEnvVar {
            name: var_name.to_string(),
            is_set: value.is_some(),
            value_prefix: prefix,
        });
    }
    vars
}

/// Get OS string
fn detect_os() -> String {
    std::env::consts::OS.to_string()
}

/// Build configuration suggestions from detected environment
fn build_suggestions(
    endpoints: &[DetectedEndpoint],
    env_vars: &[DetectedEnvVar],
    ides: &[DetectedIde],
    proxy_port: u16,
) -> (Option<String>, Option<String>, Vec<ConfigSuggestion>, Option<ContinueConfigSuggestion>) {
    let mut suggestions = Vec::new();
    let mut suggested_url: Option<String> = None;
    let mut suggested_key_source: Option<String> = None;
    let mut continue_suggestion: Option<ContinueConfigSuggestion> = None;

    let proxy_url = format!("http://127.0.0.1:{}/v1", proxy_port);

    // Priority 1: Detected local LLM endpoint takes precedence for URL
    for ep in endpoints {
        if ep.reachable && !ep.models.is_empty() {
            if suggested_url.is_none() {
                suggested_url = Some(ep.url.clone());
                suggestions.push(ConfigSuggestion {
                    category: "upstream_url".to_string(),
                    description: format!("Detected {} running with {} models", ep.name, ep.models.len()),
                    suggested_value: ep.url.clone(),
                    priority: "high".to_string(),
                    affected_agent_count: 0,
                });
            }
            break;
        }
    }

    // Priority 2: First detected reachable endpoint (even without models)
    if suggested_url.is_none() {
        for ep in endpoints {
            if ep.reachable {
                suggested_url = Some(ep.url.clone());
                suggestions.push(ConfigSuggestion {
                    category: "upstream_url".to_string(),
                    description: format!("Detected {} running on port", ep.name),
                    suggested_value: ep.url.clone(),
                    priority: "medium".to_string(),
                    affected_agent_count: 0,
                });
                break;
            }
        }
    }

    // API key suggestions from env vars
    for env in env_vars {
        if env.is_set {
            let key_name = env.name.clone();
            suggested_key_source = Some(key_name.clone());
            suggestions.push(ConfigSuggestion {
                category: "api_key".to_string(),
                description: format!("{} is set in environment", env.name),
                suggested_value: format!("Use value from {}", env.name),
                priority: "high".to_string(),
                affected_agent_count: 0,
            });
            break;
        }
    }

    // Suggestions for Continue config
    for ide in ides {
        if ide.ide_type == "continue" {
            let current_api_base = ide.proxy_settings.as_ref()
                .and_then(|s| s.strip_prefix("apiBase: "))
                .map(|s| s.to_string());
            let already = current_api_base
                .as_deref()
                .map(|url| url.starts_with("http://127.0.0.1:") || url.starts_with("http://localhost:"))
                .unwrap_or(false);

            continue_suggestion = Some(ContinueConfigSuggestion {
                current_api_base,
                suggested_api_base: proxy_url.clone(),
                already_configured: already,
            });

            if !already {
                suggestions.push(ConfigSuggestion {
                    category: "ide_config".to_string(),
                    description: "Continue.dev not configured to use NodeGuarder proxy".to_string(),
                    suggested_value: format!("Set apiBase to {}", proxy_url),
                    priority: "medium".to_string(),
                    affected_agent_count: 0,
                });
            }
        }
    }

    // Suggestions for VSCode/Cursor proxy
    for ide in ides {
        if (ide.ide_type == "vscode" || ide.ide_type == "cursor" || ide.ide_type == "windsurf")
            && ide.copilot_enabled == Some(true)
        {
            let proxy_configured = ide.proxy_settings.as_deref() == Some(&format!("http://127.0.0.1:{}", proxy_port))
                || ide.proxy_settings.as_deref() == Some(&proxy_url);

            if !proxy_configured {
                suggestions.push(ConfigSuggestion {
                    category: "proxy_setting".to_string(),
                    description: format!("Copilot enabled in {} but proxy not set", ide.ide_type),
                    suggested_value: format!("Set http.proxy to http://127.0.0.1:{}", proxy_port),
                    priority: "medium".to_string(),
                    affected_agent_count: 0,
                });
            }
        }
    }

    (suggested_url, suggested_key_source, suggestions, continue_suggestion)
}

/// Compile the full environment report
pub async fn compile_report(agent_uuid: &str, proxy_port: u16) -> EnvironmentReport {
    info!("Compiling LLM environment report...");

    let endpoints = detect_endpoints().await;
    let ides = detect_ides();
    let env_vars = detect_env_vars();
    let os = detect_os();
    let hostname = whoami::hostname().unwrap_or_else(|_| "unknown-host".to_string());

    let (suggested_url, suggested_key_source, suggestions, continue_suggestion) =
        build_suggestions(&endpoints, &env_vars, &ides, proxy_port);

    EnvironmentReport {
        agent_uuid: agent_uuid.to_string(),
        hostname,
        reported_at: chrono::Utc::now().to_rfc3339(),
        detected_endpoints: endpoints,
        detected_ides: ides,
        detected_env_vars: env_vars,
        os,
        suggested_upstream_url: suggested_url,
        suggested_upstream_key_source: suggested_key_source,
        continue_config_suggestion: continue_suggestion,
        config_suggestions: suggestions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_port_not_listening() {
        // Should not crash on unopened ports
        assert!(!scan_port(9999));
    }

    #[test]
    fn test_detect_env_vars_runs() {
        let vars = detect_env_vars();
        assert!(!vars.is_empty(), "Should check at least some env vars");
        assert!(vars.iter().any(|v| v.name == "OPENAI_API_KEY"));
    }

    #[test]
    fn test_detect_os_runs() {
        let os = detect_os();
        assert!(!os.is_empty(), "Should detect OS");
    }

    #[test]
    fn test_build_suggestions_empty() {
        let (url, key, suggestions, continue_sug) = build_suggestions(&[], &[], &[], 51820);
        assert!(url.is_none());
        assert!(key.is_none());
        assert!(suggestions.is_empty());
        assert!(continue_sug.is_none());
    }

    #[test]
    fn test_build_suggestions_with_env_key() {
        let env_vars = vec![DetectedEnvVar {
            name: "OPENAI_API_KEY".to_string(),
            is_set: true,
            value_prefix: "sk-proj-...".to_string(),
        }];
        let (_url, key, suggestions, _) = build_suggestions(&[], &env_vars, &[], 51820);
        assert!(key.is_some());
        assert_eq!(key.unwrap(), "OPENAI_API_KEY");
        assert!(suggestions.iter().any(|s| s.category == "api_key"));
    }

    #[test]
    fn test_build_suggestions_with_endpoint() {
        let endpoints = vec![DetectedEndpoint {
            service_type: "ollama".to_string(),
            name: "Ollama".to_string(),
            url: "http://127.0.0.1:11434/v1".to_string(),
            reachable: true,
            models: vec!["llama3".to_string(), "codellama".to_string()],
            metadata: HashMap::new(),
        }];
        let (url, _, suggestions, _) = build_suggestions(&endpoints, &[], &[], 51820);
        assert!(url.is_some());
        assert_eq!(url.unwrap(), "http://127.0.0.1:11434/v1");
        assert!(suggestions.iter().any(|s| s.category == "upstream_url"));
    }

    #[test]
    fn test_detect_ides_runs() {
        // Should not crash, and may find Continue or VSCode
        let ides = detect_ides();
        // This is just a smoke test - results depend on what's installed
        println!("Detected IDEs: {:?}", ides.iter().map(|i| &i.ide_type).collect::<Vec<_>>());
    }
}
