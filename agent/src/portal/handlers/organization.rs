use axum::{extract::State, http::StatusCode, routing::{get, put, delete}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/organization", get(get_org_settings))
        .route("/api/v1/organization/disconnect-password", put(set_disconnect_password))
        .route("/api/v1/organization/disconnect-password", delete(clear_disconnect_password))
}

async fn get_org_settings(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let hash: Option<String> = sqlx::query_scalar(
        "SELECT disconnect_password_hash FROM organizations WHERE id = $1",
    )
    .bind(user.org_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .unwrap_or(None);

    Ok(Json(json!({
        "disconnect_password_set": hash.is_some(),
    })))
}

#[derive(Deserialize)]
pub struct SetPasswordRequest {
    pub password: String,
}

async fn set_disconnect_password(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(req): Json<SetPasswordRequest>,
) -> Result<Json<Value>, StatusCode> {
    if req.password.len() < 4 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let hash = bcrypt::hash(&req.password, bcrypt::DEFAULT_COST)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query("UPDATE organizations SET disconnect_password_hash = $1 WHERE id = $2")
        .bind(&hash)
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({"status": "ok"})))
}

async fn clear_disconnect_password(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    sqlx::query("UPDATE organizations SET disconnect_password_hash = NULL WHERE id = $1")
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({"status": "ok"})))
}
