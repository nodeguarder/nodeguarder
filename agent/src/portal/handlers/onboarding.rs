use axum::{extract::State, http::StatusCode, routing::{get, post}, Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/onboarding/status", get(onboarding_status))
        .route("/api/v1/onboarding/complete", post(complete_onboarding))
}

async fn onboarding_status(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let completed: Option<bool> = sqlx::query_scalar(
        "SELECT onboarding_completed FROM organizations WHERE id = $1",
    )
    .bind(user.org_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .unwrap_or(Some(false));

    let agent_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM agents WHERE org_id = $1",
    )
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let policy_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM policies WHERE org_id = $1",
    )
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    Ok(Json(json!({
        "completed": completed.unwrap_or(false),
        "steps": [
            { "id": "enroll", "label": "Enroll an Agent", "done": agent_count > 0 },
            { "id": "policy", "label": "Create Your First Policy", "done": policy_count > 0 },
            { "id": "groups", "label": "Set Up Groups", "done": false },
        ],
    })))
}

async fn complete_onboarding(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    sqlx::query("UPDATE organizations SET onboarding_completed = true WHERE id = $1")
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({"status": "completed"})))
}
