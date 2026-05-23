use rcgen::{CertificateParams, KeyPair, DnType};
use std::fs;
use std::path::Path;

pub struct MtlsStore {
    pub ca_cert_pem: String,
    pub ca_key_pem: String,
}

impl MtlsStore {
    pub fn load_or_create(data_dir: &Path) -> Self {
        let ca_cert_path = data_dir.join("ca_cert.pem");
        let ca_key_path = data_dir.join("ca_key.pem");

        if ca_cert_path.exists() && ca_key_path.exists() {
            let ca_cert_pem = fs::read_to_string(&ca_cert_path).expect("Failed to read CA cert");
            let ca_key_pem = fs::read_to_string(&ca_key_path).expect("Failed to read CA key");
            return Self { ca_cert_pem, ca_key_pem };
        }

        let mut params = CertificateParams::new(vec!["NodeGuarder Enterprise CA".to_string()])
            .expect("Failed to create CA cert params");
        params.distinguished_name.push(DnType::OrganizationName, "NodeGuarder");
        params.distinguished_name.push(DnType::CommonName, "NodeGuarder Enterprise CA");

        let key_pair = KeyPair::generate().expect("Failed to generate CA key pair");
        let cert = params.self_signed(&key_pair).expect("Failed to self-sign CA cert");

        let ca_cert_pem = cert.pem();
        let ca_key_pem = key_pair.serialize_pem();

        fs::create_dir_all(data_dir).expect("Failed to create data directory");
        fs::write(&ca_cert_path, &ca_cert_pem).expect("Failed to write CA cert");
        fs::write(&ca_key_path, &ca_key_pem).expect("Failed to write CA key");

        Self { ca_cert_pem, ca_key_pem }
    }

    pub fn generate_agent_cert(&self, agent_uuid: &str, _hostname: &str) -> Result<(String, String), anyhow::Error> {
        let ca_key = KeyPair::from_pem(&self.ca_key_pem)?;
        let ca_cert_params = CertificateParams::from_ca_cert_pem(&self.ca_cert_pem)?;
        let ca_cert = ca_cert_params.self_signed(&ca_key)?;

        let mut params = CertificateParams::new(vec![agent_uuid.to_string()])?;
        params.distinguished_name.push(DnType::CommonName, agent_uuid);
        params.distinguished_name.push(DnType::OrganizationName, "NodeGuarder Agent");

        let agent_key = KeyPair::generate()?;
        let agent_cert = params.signed_by(&agent_key, &ca_cert, &ca_key)?;

        Ok((agent_cert.pem(), agent_key.serialize_pem()))
    }
}
