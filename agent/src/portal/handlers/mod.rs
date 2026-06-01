pub mod agents;
pub mod audit_logs;
pub mod auth;
pub mod compliance;
pub mod dashboard;
pub mod enrollment_codes;
pub mod environment;
pub mod groups;
pub mod health;
pub mod metrics;
pub mod onboarding;
pub mod organization;
pub mod policies;
pub mod users;

use sqlx::PgPool;
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub grpc_admin_url: String,
}
