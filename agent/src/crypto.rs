#[cfg(any(test, feature = "enterprise"))]
use rsa::{RsaPrivateKey, pkcs8::{EncodePrivateKey, LineEnding}};
#[cfg(any(test, feature = "enterprise"))]
use rand::thread_rng;
#[cfg(any(test, feature = "enterprise"))]
use tracing::info;

/// Generates a new RSA-2048 private key in PEM format.
#[cfg(any(test, feature = "enterprise"))]
pub fn generate_identity_key() -> Result<String, Box<dyn std::error::Error>> {
    info!("Generating new RSA-2048 Agent Identity Key...");
    let mut rng = thread_rng();
    let bits = 2048;
    let priv_key = RsaPrivateKey::new(&mut rng, bits)?;
    
    let pem = priv_key.to_pkcs8_pem(LineEnding::LF)?;
    Ok(pem.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rsa_key_generation() {
        let pem = generate_identity_key().expect("Failed to generate RSA key");
        
        // Basic PEM validation
        assert!(pem.starts_with("-----BEGIN PRIVATE KEY-----"));
        assert!(pem.ends_with("-----END PRIVATE KEY-----\n") || pem.ends_with("-----END PRIVATE KEY-----"));
        
        // Ensure it's reachable and non-empty
        assert!(pem.len() > 1000);
    }
}
