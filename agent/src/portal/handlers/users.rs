use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, patch, put},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;
use crate::portal::models::{CreateUserRequest, ResetPasswordRequest, User};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/users", get(list_users).post(create_user))
        .route("/api/v1/users/:id", patch(update_user_role))
        .route("/api/v1/users/:id", delete(delete_user))
        .route("/api/v1/users/:id/password", put(reset_password))
}

async fn list_users(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, org_id, email, password_hash, display_name, role, created_at, last_active_at
         FROM users WHERE org_id = $1 ORDER BY created_at DESC",
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "users": users })))
}

async fn create_user(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if user.role != "ADMIN" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only admins can create users"})),
        ));
    }

    let role = req.role.as_deref().unwrap_or("SECURITYOPS");
    if !["ADMIN", "SECURITYOPS", "AUDITOR"].contains(&role) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid role. Must be ADMIN, SECURITYOPS, or AUDITOR"})),
        ));
    }

    if req.password.len() < 8
        || !req.password.chars().any(|c| c.is_uppercase())
        || !req.password.chars().any(|c| c.is_lowercase())
        || !req.password.chars().any(|c| c.is_ascii_digit())
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, and one digit"})),
        ));
    }

    let password_hash = bcrypt::hash(&req.password, 12).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to hash password"})),
        )
    })?;

    let new_user = sqlx::query_as::<_, User>(
        r#"INSERT INTO users (org_id, email, password_hash, display_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, org_id, email, password_hash, display_name, role, created_at, last_active_at"#,
    )
    .bind(user.org_id)
    .bind(&req.email)
    .bind(&password_hash)
    .bind(req.display_name.unwrap_or_default())
    .bind(role)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        let msg = if e
            .to_string()
            .to_lowercase()
            .contains("duplicate key")
        {
            "A user with this email already exists"
        } else {
            "Failed to create user"
        };
        (
            StatusCode::CONFLICT,
            Json(json!({"error": msg})),
        )
    })?;

    Ok(Json(json!({ "user": new_user })))
}

async fn update_user_role(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<Uuid>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if user.role != "ADMIN" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only admins can update user roles"})),
        ));
    }

    let new_role = body
        .get("role")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Role is required"})),
            )
        })?;

    if !["ADMIN", "SECURITYOPS", "AUDITOR"].contains(&new_role) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid role. Must be ADMIN, SECURITYOPS, or AUDITOR"})),
        ));
    }

    let updated = sqlx::query("UPDATE users SET role = $1 WHERE id = $2 AND org_id = $3")
        .bind(new_role)
        .bind(id)
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to update user"})),
            )
        })?;

    if updated.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        ));
    }

    Ok(Json(json!({"status": "updated", "role": new_role})))
}

async fn delete_user(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if user.role != "ADMIN" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only admins can delete users"})),
        ));
    }

    if id == user.user_id {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Cannot delete yourself"})),
        ));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = $1 AND org_id = $2")
        .bind(id)
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to delete user"})),
            )
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        ));
    }

    Ok(Json(json!({"status": "deleted"})))
}

async fn reset_password(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<Uuid>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if user.role != "ADMIN" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only admins can reset passwords"})),
        ));
    }

    if req.new_password.len() < 8
        || !req.new_password.chars().any(|c| c.is_uppercase())
        || !req.new_password.chars().any(|c| c.is_lowercase())
        || !req.new_password.chars().any(|c| c.is_ascii_digit())
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, and one digit"})),
        ));
    }

    let new_hash = bcrypt::hash(&req.new_password, 12).map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to hash password"})))
    })?;

    let result = sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2 AND org_id = $3")
        .bind(&new_hash)
        .bind(id)
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to update password"})))
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        ));
    }

    Ok(Json(json!({"status": "updated"})))
}
