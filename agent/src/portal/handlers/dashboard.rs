use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/dashboard/summary", get(dashboard_summary))
        .route("/api/v1/dashboard/timeline", get(dashboard_timeline))
}

async fn dashboard_summary(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let total_agents: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE org_id = $1")
            .bind(user.org_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    let online_agents: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE org_id = $1 AND status = 'online'")
            .bind(user.org_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    let offline_agents: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE org_id = $1 AND status = 'offline'")
            .bind(user.org_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    let total_policies: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM policies WHERE org_id = $1")
            .bind(user.org_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    let total_flags_24h: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs
           WHERE org_id = $1 AND flagged_at >= NOW() - INTERVAL '24 hours'"#,
    )
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let redacted_count_24h: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs
           WHERE org_id = $1 AND flagged_at >= NOW() - INTERVAL '24 hours'
           AND action_taken = 'REDACTED'"#,
    )
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let allowed_count_24h: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs
           WHERE org_id = $1 AND flagged_at >= NOW() - INTERVAL '24 hours'
           AND action_taken = 'ALLOWED'"#,
    )
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let blocked_count_24h: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs
           WHERE org_id = $1 AND flagged_at >= NOW() - INTERVAL '24 hours'
           AND action_taken = 'BLOCKED'"#,
    )
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    Ok(Json(json!({
        "total_agents": total_agents,
        "online_agents": online_agents,
        "offline_agents": offline_agents,
        "total_policies": total_policies,
        "total_flags_24h": total_flags_24h,
        "redacted_count_24h": redacted_count_24h,
        "allowed_count_24h": allowed_count_24h,
        "blocked_count_24h": blocked_count_24h,
    })))
}

async fn dashboard_timeline(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let recent_events = sqlx::query_as::<_, crate::portal::models::AuditLog>(
        r#"SELECT id, org_id, agent_uuid, user_name, content_type, severity, action_taken,
                  detection_method, preview, flagged_at, session_id, timeout_triggered, policy_enforced
           FROM audit_logs
           WHERE org_id = $1
           ORDER BY flagged_at DESC
           LIMIT 10"#,
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "events": recent_events })))
}
