use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub uuid: String,
    pub bearer_token: String,
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
    #[serde(default = "default_bind_port")]
    pub bind_port: u16,
    #[serde(default)]
    pub allowlists_regex: Vec<String>,
    #[serde(default)]
    pub enrolled_admin: Option<String>,
    #[serde(default)]
    pub enforce_redaction: bool,

    // Enterprise Sync Fields
    #[serde(default)]
    pub admin_url: Option<String>,
    #[serde(default)]
    pub identity_key_pem: Option<String>,
    #[serde(default)]
    pub admin_cert_pem: Option<String>,
    #[serde(default = "default_true")]
    pub enable_ocr: bool,

    // Detection Categories
    #[serde(default = "default_true")]
    pub detect_api_keys: bool,
    #[serde(default = "default_true")]
    pub detect_db_credentials: bool,
    #[serde(default = "default_true")]
    pub detect_pii: bool,
    // ATR-powered detection (419 rules across 10 categories, all enabled by default)
    #[serde(default = "default_true")]
    pub detect_injection: bool,
    #[serde(default = "default_true")]
    pub detect_code_execution: bool,
    #[serde(default = "default_true")]
    pub detect_social_engineering: bool,
    #[serde(default = "default_true")]
    pub detect_skill_compromise: bool,
    #[serde(default = "default_true")]
    pub detect_excessive_autonomy: bool,
    #[serde(default = "default_true")]
    pub detect_model_abuse: bool,
    #[serde(default = "default_true")]
    pub detect_data_poisoning: bool,
    // Upstream LLM endpoint (OpenAI-compatible)
    #[serde(default = "default_upstream_url")]
    pub upstream_url: String,
    #[serde(default)]
    pub disable_atr_auto_update: bool,
    /// Disconnect password hash (bcrypt) from org policy
    #[serde(default)]
    pub disconnect_password_hash: Option<String>,
    /// Upstream LLM API key. Three modes:
    /// - None (not set) → strip Authorization header (for local models like Ollama)
    /// - Some("") → strip Authorization header (same as None)
    /// - Some("sk-...") → replace Authorization header with `Bearer <value>`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upstream_api_key: Option<String>,
    #[serde(default = "default_true")]
    pub auto_start: bool,
    #[serde(default)]
    pub policy_version: Option<String>,
    /// Bearer token enforced by enterprise policy (shared across agents)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enforced_bearer_token: Option<String>,
    }

fn default_upstream_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_true() -> bool {
    true
}

fn default_bind_address() -> String {
    "127.0.0.1".to_string()
}

fn default_bind_port() -> u16 {
    51820
}

pub fn load_or_create_config() -> AppConfig {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let mut config_dir = PathBuf::from(appdata);
    config_dir.push("NodeGuarder");

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).expect("Failed to create NodeGuarder config directory");
    }

    let config_path = config_dir.join("config.toml");

    if config_path.exists() {
        let content = fs::read_to_string(&config_path).expect("Failed to read config file");
        let mut config: AppConfig = toml::from_str(&content).expect("Failed to parse config.toml");

        // Clear legacy/default patterns that are now handled internally
        let legacy_patterns = ["ng-[a-zA-Z0-9]{32}", "ng-[a-zA-Z0-9]{31}", "localhost"];
        let original_count = config.allowlists_regex.len();
        config
            .allowlists_regex
            .retain(|p| !legacy_patterns.contains(&p.as_str()));

        // Save if we cleared any patterns
        if config.allowlists_regex.len() != original_count {
            save_config(&config);
        }

        config
    } else {
        let rng = rand::thread_rng();
        let token: String = rng
            .clone()
            .sample_iter(&Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let uuid = uuid::Uuid::new_v4().to_string();

        let config = AppConfig {
            uuid,
            bearer_token: format!("ng-{}", token),
            bind_address: default_bind_address(),
            bind_port: default_bind_port(),
            allowlists_regex: vec![],
            enrolled_admin: None,
            enforce_redaction: false,
            admin_url: None,
            identity_key_pem: None,
            admin_cert_pem: None,
            enable_ocr: true,
            detect_api_keys: true,
            detect_db_credentials: true,
            detect_pii: true,
            detect_injection: true,
            detect_code_execution: true,
            detect_social_engineering: true,
            detect_skill_compromise: true,
            detect_excessive_autonomy: true,
            detect_model_abuse: true,
            detect_data_poisoning: true,
            upstream_url: default_upstream_url(),
            disable_atr_auto_update: false,
            upstream_api_key: None,
            disconnect_password_hash: None,
            auto_start: true,
            policy_version: None,
            enforced_bearer_token: None,
        };

        let content = toml::to_string_pretty(&config).expect("Failed to serialize config");
        fs::write(&config_path, content).expect("Failed to write config.toml");

        config
    }
}

pub fn save_config(config: &AppConfig) {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let mut config_path = PathBuf::from(appdata);
    config_path.push("NodeGuarder");
    config_path.push("config.toml");

    let content = toml::to_string_pretty(config).expect("Failed to serialize config");
    fs::write(&config_path, content).expect("Failed to write config.toml");
}

pub fn add_allowlist_rule(rule: &str) -> bool {
    let mut config = load_or_create_config();
    if config.enforce_redaction {
        return false;
    }
    if !config.allowlists_regex.contains(&rule.to_string()) {
        config.allowlists_regex.push(rule.to_string());
        save_config(&config);
        return true;
    }
    false
}

pub fn remove_allowlist_rule(rule: &str) -> bool {
    let mut config = load_or_create_config();
    if config.enforce_redaction {
        return false;
    }
    if let Some(pos) = config.allowlists_regex.iter().position(|r| r == rule) {
        config.allowlists_regex.remove(pos);
        save_config(&config);
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_config_persistence() {
        let dir = tempdir().unwrap();
        let config_path = dir.path().join("config.toml");

        let config = AppConfig {
            uuid: "test-uuid".to_string(),
            bearer_token: "test-token".to_string(),
            bind_address: "127.0.0.1".to_string(),
            bind_port: 51820,
            allowlists_regex: vec!["rule1".to_string()],
            enrolled_admin: None,
            enforce_redaction: false,
            admin_url: None,
            identity_key_pem: None,
            admin_cert_pem: None,
            detect_api_keys: true,
            detect_db_credentials: true,
            detect_pii: true,
            detect_injection: true,
            detect_code_execution: true,
            detect_social_engineering: true,
            detect_skill_compromise: true,
            detect_excessive_autonomy: true,
            detect_model_abuse: true,
            detect_data_poisoning: true,
            enable_ocr: false,
            upstream_url: "https://api.openai.com/v1".to_string(),
            disable_atr_auto_update: false,
            upstream_api_key: None,
            disconnect_password_hash: None,
            auto_start: true,
            policy_version: None,
            enforced_bearer_token: None,
        };

        let content = toml::to_string_pretty(&config).unwrap();
        fs::write(&config_path, content).unwrap();

        // Simulate loading
        let loaded_content = fs::read_to_string(&config_path).unwrap();
        let loaded: AppConfig = toml::from_str(&loaded_content).unwrap();

        assert_eq!(loaded.uuid, "test-uuid");
        assert_eq!(loaded.allowlists_regex.len(), 1);
    }
}

