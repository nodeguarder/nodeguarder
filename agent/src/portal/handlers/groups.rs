use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, delete},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;
use crate::portal::models::{
    AgentGroup, AddMembersRequest, CreateGroupRequest, UpdateGroupRequest,
};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/groups", get(list_groups).post(create_group))
        .route("/api/v1/groups/:id", patch(update_group).delete(delete_group))
        .route("/api/v1/groups/:id/members", get(list_members).post(add_members))
        .route("/api/v1/groups/:id/members/:uuid", delete(remove_member))
}

async fn list_groups(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let groups = sqlx::query_as::<_, AgentGroup>(
        "SELECT id, org_id, name, description, created_at \
         FROM agent_groups WHERE org_id = $1 \
         ORDER BY created_at DESC",
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::new();
    for g in groups {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM agent_group_members WHERE group_id = $1",
        )
        .bind(g.id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

        result.push(json!({
            "id": g.id,
            "org_id": g.org_id,
            "name": g.name,
            "description": g.description,
            "member_count": count,
            "created_at": g.created_at,
        }));
    }

    Ok(Json(json!({ "groups": result })))
}

async fn create_group(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(req): Json<CreateGroupRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if req.name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Group name is required"}))));
    }

    let group = sqlx::query_as::<_, AgentGroup>(
        "INSERT INTO agent_groups (org_id, name, description) \
         VALUES ($1, $2, $3) \
         RETURNING id, org_id, name, description, created_at",
    )
    .bind(user.org_id)
    .bind(req.name.trim())
    .bind(req.description.as_deref().unwrap_or(""))
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to create group"}))))?;

    Ok(Json(json!({ "group": {
        "id": group.id,
        "org_id": group.org_id,
        "name": group.name,
        "description": group.description,
        "member_count": 0,
        "created_at": group.created_at,
    }})))
}

async fn update_group(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<uuid::Uuid>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<Json<Value>, StatusCode> {
    let result = sqlx::query(
        "UPDATE agent_groups SET \
         name = COALESCE($1, name), \
         description = COALESCE($2, description) \
         WHERE id = $3 AND org_id = $4",
    )
    .bind(&req.name)
    .bind(&req.description)
    .bind(id)
    .bind(user.org_id)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(json!({"status": "updated"})))
}

async fn delete_group(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Value>, StatusCode> {
    let result = sqlx::query("DELETE FROM agent_groups WHERE id = $1 AND org_id = $2")
        .bind(id)
        .bind(user.org_id)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(Json(json!({"status": "deleted"})))
}

async fn list_members(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Value>, StatusCode> {
    let members = sqlx::query_as::<_, crate::portal::models::Agent>(
        r#"SELECT a.* FROM agents a
           JOIN agent_group_members m ON m.agent_uuid = a.uuid
           WHERE m.group_id = $1 AND a.org_id = $2
           ORDER BY a.hostname"#,
    )
    .bind(id)
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "members": members })))
}

async fn add_members(
    State(state): State<Arc<AppState>>,
    _user: AuthenticatedUser,
    Path(id): Path<uuid::Uuid>,
    Json(req): Json<AddMembersRequest>,
) -> Result<Json<Value>, StatusCode> {
    for uuid in &req.agent_uuids {
        sqlx::query(
            "INSERT INTO agent_group_members (group_id, agent_uuid) VALUES ($1, $2) \
             ON CONFLICT DO NOTHING",
        )
        .bind(id)
        .bind(uuid)
        .execute(&state.pool)
        .await
        .ok();
    }

    Ok(Json(json!({"status": "added", "count": req.agent_uuids.len()})))
}

async fn remove_member(
    State(state): State<Arc<AppState>>,
    _user: AuthenticatedUser,
    Path((id, uuid)): Path<(uuid::Uuid, String)>,
) -> Result<Json<Value>, StatusCode> {
    sqlx::query(
        "DELETE FROM agent_group_members WHERE group_id = $1 AND agent_uuid = $2",
    )
    .bind(id)
    .bind(&uuid)
    .execute(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({"status": "removed"})))
}
