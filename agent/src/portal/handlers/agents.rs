use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;
use crate::portal::models::Agent;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/agents", get(list_agents))
        .route("/api/v1/agents/:uuid", get(get_agent))
        .route("/api/v1/agents/:uuid/revoke", post(revoke_agent))
}

#[derive(Deserialize)]
pub struct AgentQuery {
    pub status: Option<String>,
    pub search: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub group_id: Option<uuid::Uuid>,
}

async fn list_agents(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Query(query): Query<AgentQuery>,
) -> Result<Json<Value>, StatusCode> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(100);
    let offset = (page - 1) * per_page;

    let agents = if let Some(gid) = query.group_id {
        sqlx::query_as::<_, Agent>(
            r#"SELECT a.* FROM agents a
               JOIN agent_group_members m ON m.agent_uuid = a.uuid
               WHERE a.org_id = $1 AND m.group_id = $5
               AND ($2::text IS NULL OR a.status = $2)
               AND ($3::text IS NULL OR a.hostname ILIKE '%' || $3 || '%' OR a.uuid ILIKE '%' || $3 || '%')
               ORDER BY a.last_seen DESC NULLS LAST
               LIMIT $4 OFFSET $6"#,
        )
        .bind(user.org_id)
        .bind(&query.status)
        .bind(&query.search)
        .bind(per_page)
        .bind(gid)
        .bind(offset)
        .fetch_all(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        sqlx::query_as::<_, Agent>(
            r#"SELECT * FROM agents WHERE org_id = $1
               AND ($2::text IS NULL OR status = $2)
               AND ($3::text IS NULL OR hostname ILIKE '%' || $3 || '%' OR uuid ILIKE '%' || $3 || '%')
               ORDER BY last_seen DESC NULLS LAST
               LIMIT $4 OFFSET $5"#,
        )
        .bind(user.org_id)
        .bind(&query.status)
        .bind(&query.search)
        .bind(per_page)
        .bind(offset)
        .fetch_all(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    let total: i64 = if query.group_id.is_some() {
        sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM agents a
               JOIN agent_group_members m ON m.agent_uuid = a.uuid
               WHERE a.org_id = $1 AND m.group_id = $3
               AND ($2::text IS NULL OR a.status = $2)"#,
        )
        .bind(user.org_id)
        .bind(&query.status)
        .bind(query.group_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0)
    } else {
        sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM agents WHERE org_id = $1
               AND ($2::text IS NULL OR status = $2)"#,
        )
        .bind(user.org_id)
        .bind(&query.status)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0)
    };

    let mut agent_list = Vec::new();
    for a in agents {
        let group_ids: Vec<uuid::Uuid> = sqlx::query_scalar(
            "SELECT group_id FROM agent_group_members WHERE agent_uuid = $1",
        )
        .bind(&a.uuid)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

        agent_list.push(json!({
            "uuid": a.uuid,
            "org_id": a.org_id,
            "hostname": a.hostname,
            "ip_address": a.ip_address,
            "status": a.status,
            "last_seen": a.last_seen,
            "policy_version": a.policy_version,
            "agent_version": a.agent_version,
            "created_at": a.created_at,
            "group_ids": group_ids,
        }));
    }

    Ok(Json(json!({
        "agents": agent_list,
        "total": total,
        "page": page,
        "per_page": per_page,
    })))
}

async fn get_agent(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(uuid): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let agent =
        sqlx::query_as::<_, Agent>("SELECT * FROM agents WHERE uuid = $1 AND org_id = $2")
            .bind(&uuid)
            .bind(user.org_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

    let recent_logs = sqlx::query_as::<_, crate::portal::models::AuditLog>(
        r#"SELECT id, org_id, agent_uuid, user_name, content_type, severity, action_taken,
                  detection_method, preview, flagged_at, session_id, timeout_triggered, policy_enforced
           FROM audit_logs WHERE agent_uuid = $1 AND org_id = $2
           ORDER BY flagged_at DESC LIMIT 20"#,
    )
    .bind(&uuid)
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let group_ids: Vec<uuid::Uuid> = sqlx::query_scalar(
        "SELECT group_id FROM agent_group_members WHERE agent_uuid = $1",
    )
    .bind(&uuid)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    Ok(Json(json!({
        "agent": {
            "uuid": agent.uuid,
            "org_id": agent.org_id,
            "hostname": agent.hostname,
            "ip_address": agent.ip_address,
            "status": agent.status,
            "last_seen": agent.last_seen,
            "policy_version": agent.policy_version,
            "agent_version": agent.agent_version,
            "created_at": agent.created_at,
            "group_ids": group_ids,
        },
        "recent_logs": recent_logs,
    })))
}

async fn revoke_agent(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(uuid): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    // 1. Mark revoked so the next heartbeat sends agent_revoked=true to the client
    let mark = sqlx::query(
        "UPDATE agents SET status = 'revoked' WHERE uuid = $1 AND org_id = $2",
    )
    .bind(&uuid)
    .bind(user.org_id)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if mark.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // 2. Delete associated data (metrics have no FK cascade; others cascade on agent delete)
    sqlx::query("DELETE FROM agent_request_metrics WHERE agent_uuid = $1::uuid")
        .bind(&uuid)
        .execute(&state.pool)
        .await
        .ok();

    sqlx::query("DELETE FROM agents WHERE uuid = $1 AND org_id = $2")
        .bind(&uuid)
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .ok();

    Ok(Json(json!({"status": "revoked"})))
}
