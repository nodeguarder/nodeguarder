use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;
use crate::portal::models::AuditLog;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/audit-logs", get(list_audit_logs))
        .route("/api/v1/audit-logs/export", get(export_audit_logs_csv))
}

#[derive(Deserialize)]
pub struct AuditLogQuery {
    pub agent_uuid: Option<String>,
    pub content_type: Option<String>,
    pub action: Option<String>,
    pub severity: Option<String>,
    pub search: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Query(query): Query<AuditLogQuery>,
) -> Result<Json<Value>, StatusCode> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(200);
    let offset = (page - 1) * per_page;

    let logs = sqlx::query_as::<_, AuditLog>(
        r#"SELECT id, org_id, agent_uuid, user_name, content_type, severity, action_taken,
                  detection_method, preview, flagged_at, session_id, timeout_triggered, policy_enforced
           FROM audit_logs
           WHERE org_id = $1
           AND ($2::text IS NULL OR agent_uuid = $2)
           AND ($3::text IS NULL OR content_type = $3)
           AND ($4::text IS NULL OR action_taken = $4)
           AND ($5::text IS NULL OR severity = $5)
           AND ($6::text IS NULL OR preview ILIKE '%' || $6 || '%' OR detection_method ILIKE '%' || $6 || '%')
           AND ($7::timestamptz IS NULL OR flagged_at >= $7::timestamptz)
           AND ($8::timestamptz IS NULL OR flagged_at <= $8::timestamptz)
           ORDER BY flagged_at DESC
           LIMIT $9 OFFSET $10"#,
    )
    .bind(user.org_id)
    .bind(&query.agent_uuid)
    .bind(&query.content_type)
    .bind(&query.action)
    .bind(&query.severity)
    .bind(&query.search)
    .bind(&query.from)
    .bind(&query.to)
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs
           WHERE org_id = $1
           AND ($2::text IS NULL OR agent_uuid = $2)
           AND ($3::text IS NULL OR content_type = $3)
           AND ($4::text IS NULL OR action_taken = $4)
           AND ($5::text IS NULL OR severity = $5)
           AND ($6::text IS NULL OR preview ILIKE '%' || $6 || '%')
           AND ($7::timestamptz IS NULL OR flagged_at >= $7::timestamptz)
           AND ($8::timestamptz IS NULL OR flagged_at <= $8::timestamptz)"#,
    )
    .bind(user.org_id)
    .bind(&query.agent_uuid)
    .bind(&query.content_type)
    .bind(&query.action)
    .bind(&query.severity)
    .bind(&query.search)
    .bind(&query.from)
    .bind(&query.to)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    Ok(Json(json!({
        "logs": logs,
        "total": total,
        "page": page,
        "per_page": per_page,
    })))
}

async fn export_audit_logs_csv(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Query(query): Query<AuditLogQuery>,
) -> Result<(StatusCode, [(String, String); 1], String), StatusCode> {
    let logs = sqlx::query_as::<_, AuditLog>(
        r#"SELECT id, org_id, agent_uuid, user_name, content_type, severity, action_taken,
                  detection_method, preview, flagged_at, session_id, timeout_triggered, policy_enforced
           FROM audit_logs
           WHERE org_id = $1
           AND ($2::text IS NULL OR agent_uuid = $2)
           AND ($3::text IS NULL OR content_type = $3)
           AND ($4::text IS NULL OR action_taken = $4)
           AND ($5::text IS NULL OR severity = $5)
           AND ($6::text IS NULL OR preview ILIKE '%' || $6 || '%')
           AND ($7::timestamptz IS NULL OR flagged_at >= $7::timestamptz)
           AND ($8::timestamptz IS NULL OR flagged_at <= $8::timestamptz)
           ORDER BY flagged_at DESC
           LIMIT 10000"#,
    )
    .bind(user.org_id)
    .bind(&query.agent_uuid)
    .bind(&query.content_type)
    .bind(&query.action)
    .bind(&query.severity)
    .bind(&query.search)
    .bind(&query.from)
    .bind(&query.to)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    fn csv_escape(s: &str) -> String {
        if s.starts_with('=') || s.starts_with('+') || s.starts_with('-') || s.starts_with('@') {
            format!("'{}", s)
        } else {
            s.to_string()
        }
    }

    let mut csv = String::from(
        "id,org_id,agent_uuid,user_name,content_type,severity,action_taken,detection_method,preview,flagged_at,session_id,timeout_triggered,policy_enforced\n",
    );
    for log in logs {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            log.id,
            log.org_id,
            csv_escape(&log.agent_uuid),
            csv_escape(&log.user_name.unwrap_or_default()),
            csv_escape(&log.content_type),
            csv_escape(&log.severity),
            csv_escape(&log.action_taken),
            csv_escape(&log.detection_method.unwrap_or_default()),
            csv_escape(&log.preview.unwrap_or_default().replace(',', " ")),
            log.flagged_at,
            csv_escape(&log.session_id.unwrap_or_default()),
            log.timeout_triggered,
            log.policy_enforced,
        ));
    }

    Ok((
        StatusCode::OK,
        [(
            "Content-Type".to_string(),
            "text/csv".to_string(),
        )],
        csv,
    ))
}
