use axum::{
    body::Body,
    extract::{Path, State},
    http::StatusCode,
    response::Response,
    routing::{delete, get},
    Json, Router,
};
use rand::Rng;
use serde_json::{json, Value};
use std::sync::Arc;

use uuid::Uuid;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;
use crate::portal::models::{EnrollmentCode, GenerateCodeRequest};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/enrollment-codes", get(list_codes).post(generate_code))
        .route("/api/v1/enrollment-codes/:id", delete(revoke_code))
        .route("/api/v1/enrollment-codes/:id/provisioning-file", get(download_provisioning))
}

async fn list_codes(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let codes = sqlx::query_as::<_, EnrollmentCode>(
        "SELECT * FROM enrollment_codes WHERE org_id = $1 ORDER BY created_at DESC",
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "codes": codes })))
}

fn generate_random_code() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..12)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

async fn generate_code(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(req): Json<GenerateCodeRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let ttl_hours = req.ttl_hours.unwrap_or(24).max(1).min(720);
    let code = generate_random_code();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(ttl_hours as i64);

    let enrollment_code = sqlx::query_as::<_, EnrollmentCode>(
        r#"INSERT INTO enrollment_codes (org_id, code, expires_at)
           VALUES ($1, $2, $3)
           RETURNING *"#,
    )
    .bind(user.org_id)
    .bind(&code)
    .bind(expires_at)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Failed to generate code: {}", e)})),
        )
    })?;

    Ok(Json(json!({
        "code": enrollment_code,
        "admin_grpc_url": state.grpc_admin_url,
    })))
}

async fn revoke_code(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, StatusCode> {
    let result = sqlx::query("DELETE FROM enrollment_codes WHERE id = $1 AND org_id = $2")
        .bind(id)
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(json!({"status": "revoked"})))
}

async fn download_provisioning(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(code): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let enrollment = sqlx::query_as::<_, EnrollmentCode>(
        "SELECT * FROM enrollment_codes WHERE code = $1 AND org_id = $2",
    )
    .bind(&code)
    .bind(user.org_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let url = if state.grpc_admin_url.starts_with("http://") || state.grpc_admin_url.starts_with("https://") {
        state.grpc_admin_url.clone()
    } else {
        format!("http://{}", state.grpc_admin_url)
    };
    let toml_content = format!(
        r#"admin_url = "{}"
enrollment_code = "{}"
"#,
        url, enrollment.code
    );

    let disposition = format!("attachment; filename=\"provisioning.toml\"");
    let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/octet-stream")
        .header("Content-Disposition", &disposition)
        .body(Body::from(toml_content))
        .unwrap();
    Ok(response)
}
