use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[allow(dead_code)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing)]
    pub disconnect_password_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub org_id: Uuid,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub display_name: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub last_active_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Agent {
    pub uuid: String,
    pub org_id: Uuid,
    pub hostname: String,
    pub ip_address: Option<String>,
    pub status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub policy_version: Option<String>,
    pub agent_version: Option<String>,
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    pub identity_key_pem: Option<String>,
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    pub cert_pem: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Policy {
    pub id: Uuid,
    pub org_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub redaction_enforced: bool,
    pub upstream_url: Option<String>,
    pub upstream_api_key: Option<String>,
    pub bind_port: Option<i32>,
    pub enable_ocr: Option<bool>,
    pub disable_atr_auto_update: Option<bool>,
    pub allow_custom_allowlists: bool,
    pub bearer_token: Option<String>,
    #[serde(alias = "detection_overrides")]
    #[sqlx(rename = "detection_overrides")]
    pub enabled_detection_categories: Option<serde_json::Value>,
    pub custom_regex: Option<serde_json::Value>,
    pub allowlists: Option<serde_json::Value>,
    pub target_mode: String,
    pub target_regex: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub updated_by: Option<Uuid>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub org_id: Uuid,
    pub agent_uuid: String,
    pub user_name: Option<String>,
    pub content_type: String,
    pub severity: String,
    pub action_taken: String,
    pub detection_method: Option<String>,
    pub preview: Option<String>,
    pub flagged_at: DateTime<Utc>,
    pub session_id: Option<String>,
    pub timeout_triggered: bool,
    pub policy_enforced: bool,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct EnrollmentCode {
    pub id: Uuid,
    pub org_id: Uuid,
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub used_by: Option<String>,
    pub used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePolicyRequest {
    pub name: String,
    pub description: Option<String>,
    pub redaction_enforced: Option<bool>,
    pub upstream_url: Option<String>,
    pub upstream_api_key: Option<String>,
    pub bind_port: Option<i32>,
    pub enable_ocr: Option<bool>,
    pub disable_atr_auto_update: Option<bool>,
    pub allow_custom_allowlists: Option<bool>,
    pub bearer_token: Option<String>,
    #[serde(alias = "detection_overrides")]
    pub enabled_detection_categories: Option<Vec<String>>,
    pub custom_regex: Option<Vec<String>>,
    pub allowlists: Option<Vec<String>>,
    pub target_mode: Option<String>,
    pub target_regex: Option<String>,
    pub group_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateCodeRequest {
    pub ttl_hours: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentGroup {
    pub id: Uuid,
    pub org_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[allow(dead_code)]
pub struct AgentGroupMember {
    pub group_id: Uuid,
    pub agent_uuid: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddMembersRequest {
    pub agent_uuids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ComplianceReport {
    pub id: Uuid,
    pub org_id: Uuid,
    pub framework: String,
    pub status: String,
    pub score: f64,
    pub report_data: serde_json::Value,
    pub generated_at: DateTime<Utc>,
    pub generated_by: Option<Uuid>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateReportRequest {
    pub framework: String,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}
