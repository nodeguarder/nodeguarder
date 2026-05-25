use aes_gcm::{
    aead::{Aead, KeyInit, OsRng, AeadCore},
    Aes256Gcm,
};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;
use base64::{Engine as _, engine::general_purpose::STANDARD};

#[derive(Serialize, Deserialize, Debug)]
pub struct AuditLog {
    pub timestamp: String,
    pub agent_uuid: String,
    pub content_type: String,
    pub action_taken: String,
    pub preview: String,
    #[serde(default)]
    pub severity: String,
    #[serde(default)]
    pub detection_method: String,
    #[serde(default)]
    pub session_id: String,
}

fn load_or_create_key() -> [u8; 32] {
    static CACHED_KEY: OnceLock<[u8; 32]> = OnceLock::new();
    *CACHED_KEY.get_or_init(|| {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        let mut key_dir = PathBuf::from(appdata);
        key_dir.push("NodeGuarder");
        let key_path = key_dir.join("audit_key.bin");

        // Try reading existing key file
        if let Ok(data) = std::fs::read(&key_path) {
            if data.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&data);
                return key;
            }
        }

        // Generate new random key and persist to file
        let mut key = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut key);
        let _ = std::fs::create_dir_all(&key_dir);
        let _ = std::fs::write(&key_path, key);

        tracing::info!("Generated new AES-256 audit log key.");
        key
    })
}

fn cipher_from_key(key_bytes: &[u8]) -> Aes256Gcm {
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(key_bytes);
    Aes256Gcm::new(key)
}

pub fn log_event(log: AuditLog) {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let mut log_dir = PathBuf::from(appdata);
    log_dir.push("NodeGuarder");
    log_dir.push("logs");

    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).unwrap();
    }

    let log_path = log_dir.join("agent_audit.enc");
    let key_bytes = load_or_create_key();
    let cipher = cipher_from_key(&key_bytes);
    
    // Generate 96-bit nonce
    let nonce = <Aes256Gcm as AeadCore>::generate_nonce(&mut OsRng); // 12-bytes
    
    let plaintext = serde_json::to_vec(&log).unwrap();
    if let Ok(ciphertext) = cipher.encrypt(&nonce, plaintext.as_ref()) {
        // We write the nonce + ciphertext as a single line, base64 encoded
        let mut combined = nonce.to_vec();
        combined.extend(ciphertext);
        let record = format!("{}\n", STANDARD.encode(combined));

        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
            let _ = file.write_all(record.as_bytes());
        }
    }
}

pub fn read_logs() -> Vec<AuditLog> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let mut log_dir = PathBuf::from(appdata);
    log_dir.push("NodeGuarder");
    log_dir.push("logs");
    let log_path = log_dir.join("agent_audit.enc");

    if !log_path.exists() {
        return Vec::new();
    }

    let key_bytes = load_or_create_key();
    let cipher = cipher_from_key(&key_bytes);

    let content = std::fs::read_to_string(&log_path).unwrap_or_default();
    let mut logs = Vec::new();

    for line in content.lines() {
        if let Ok(combined) = STANDARD.decode(line) {
            if combined.len() < 12 { continue; }
            let (nonce_bytes, ciphertext) = combined.split_at(12);
            let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
            
            if let Ok(plaintext) = cipher.decrypt(nonce, ciphertext) {
                if let Ok(log) = serde_json::from_slice::<AuditLog>(&plaintext) {
                    logs.push(log);
                }
            }
        }
    }
    // Return latest logs first
    logs.reverse();
    logs
}
