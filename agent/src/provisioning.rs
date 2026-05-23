use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize, Debug)]
pub struct ProvisioningConfig {
    pub admin_url: String,
    pub enrollment_code: String,
}

pub fn provisioning_path() -> PathBuf {
    let progdata = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let mut path = PathBuf::from(progdata);
    path.push("NodeGuarder");
    path.push("provisioning.toml");
    path
}

pub fn load(path: &PathBuf) -> Result<ProvisioningConfig, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read provisioning file: {}", e))?;
    toml::from_str(&content).map_err(|e| format!("Failed to parse provisioning file: {}", e))
}
