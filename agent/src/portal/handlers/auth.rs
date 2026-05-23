use axum::{extract::State, http::StatusCode, routing::{post, patch}, Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use crate::portal::auth::{self, AuthenticatedUser};
use crate::portal::handlers::AppState;
use crate::portal::models::{ChangePasswordRequest, LoginRequest, User};

use argon2::password_hash::{PasswordHash, PasswordVerifier};
use argon2::Argon2;

fn login_attempts() -> &'static Mutex<HashMap<String, Vec<Instant>>> {
    static ATTEMPTS: OnceLock<Mutex<HashMap<String, Vec<Instant>>>> = OnceLock::new();
    ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn check_rate_limit(ip: &str) -> bool {
    let mut attempts = login_attempts().lock().unwrap();
    let now = Instant::now();
    let entry = attempts.entry(ip.to_string()).or_default();
    entry.retain(|t| now.duration_since(*t).as_secs() < 300);
    if entry.len() >= 5 {
        return false;
    }
    entry.push(now);
    true
}

fn validate_password_complexity(password: &str) -> Result<(), &'static str> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters");
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        return Err("Password must contain at least one uppercase letter");
    }
    if !password.chars().any(|c| c.is_lowercase()) {
        return Err("Password must contain at least one lowercase letter");
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err("Password must contain at least one digit");
    }
    Ok(())
}

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/password", patch(change_password))
}

async fn login(
    state: axum::extract::State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let ip = "unknown";
    if !check_rate_limit(ip) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "Too many login attempts. Please try again later."})),
        ));
    }

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Database error"})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid email or password"})),
            )
        })?;

    let password_bytes = req.password.as_bytes();
    let parsed_hash = PasswordHash::new(&user.password_hash).ok();
    let argon2_valid = parsed_hash
        .map(|h| Argon2::default().verify_password(password_bytes, &h).is_ok())
        .unwrap_or(false);

    let bcrypt_valid = bcrypt::verify(&req.password, &user.password_hash).unwrap_or(false);

    if !argon2_valid && !bcrypt_valid {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid email or password"})),
        ));
    }

    let token = auth::create_token(user.id, user.org_id, &user.email, &user.role).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to generate token"})),
        )
    })?;

    sqlx::query("UPDATE users SET last_active_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&state.pool)
        .await
        .ok();

    Ok(Json(json!({
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "org_id": user.org_id,
        }
    })))
}

async fn change_password(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let stored = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user.user_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"})))
        })?
        .ok_or_else(|| {
            (StatusCode::NOT_FOUND, Json(json!({"error": "User not found"})))
        })?;

    let password_bytes = req.current_password.as_bytes();
    let parsed_hash = PasswordHash::new(&stored.password_hash).ok();
    let argon2_valid = parsed_hash
        .map(|h| Argon2::default().verify_password(password_bytes, &h).is_ok())
        .unwrap_or(false);
    let bcrypt_valid = bcrypt::verify(&req.current_password, &stored.password_hash).unwrap_or(false);

    if !argon2_valid && !bcrypt_valid {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Current password is incorrect"})),
        ));
    }

    if let Err(e) = validate_password_complexity(&req.new_password) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": e})),
        ));
    }

    let new_hash = bcrypt::hash(&req.new_password, 12).map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to hash password"})))
    })?;

    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(user.user_id)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to update password"})))
        })?;

    Ok(Json(json!({"status": "updated"})))
}
