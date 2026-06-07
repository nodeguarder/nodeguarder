use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, patch},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;
use crate::portal::models::{CreatePolicyRequest, Policy};

async fn resolve_user_id(pool: &sqlx::PgPool, user: &AuthenticatedUser) -> Option<Uuid> {
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE id = $1")
        .bind(user.user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/policies", get(list_policies).post(create_policy))
        .route("/api/v1/policies/:id", get(get_policy))
        .route("/api/v1/policies/:id", patch(update_policy))
        .route("/api/v1/policies/:id", delete(delete_policy))
}

async fn list_policies(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let policies = sqlx::query_as::<_, Policy>(
        "SELECT * FROM policies WHERE org_id = $1 ORDER BY updated_at DESC",
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::new();
    for p in policies {
        let group_ids: Vec<uuid::Uuid> = sqlx::query_scalar(
            "SELECT group_id FROM policy_assignments WHERE policy_id = $1",
        )
        .bind(p.id)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

        result.push(json!({
            "id": p.id,
            "org_id": p.org_id,
            "name": p.name,
            "description": p.description,
            "redaction_enforced": p.redaction_enforced,
            "upstream_url": p.upstream_url,
            "upstream_api_key": p.upstream_api_key,
            "bind_port": p.bind_port,
            "enable_ocr": p.enable_ocr,
            "disable_atr_auto_update": p.disable_atr_auto_update,
            "allow_custom_allowlists": p.allow_custom_allowlists,
            "bearer_token": p.bearer_token,
            "enabled_detection_categories": p.enabled_detection_categories,
            "custom_regex": p.custom_regex,
            "allowlists": p.allowlists,
            "target_mode": p.target_mode,
            "target_regex": p.target_regex,
            "group_ids": group_ids,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "updated_by": p.updated_by,
        }));
    }

    Ok(Json(json!({ "policies": result })))
}

async fn get_policy(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, StatusCode> {
    let policy =
        sqlx::query_as::<_, Policy>("SELECT * FROM policies WHERE id = $1 AND org_id = $2")
            .bind(id)
            .bind(user.org_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

    let group_ids: Vec<uuid::Uuid> = sqlx::query_scalar(
        "SELECT group_id FROM policy_assignments WHERE policy_id = $1",
    )
    .bind(policy.id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    Ok(Json(json!({
        "policy": {
            "id": policy.id,
            "org_id": policy.org_id,
            "name": policy.name,
            "description": policy.description,
            "redaction_enforced": policy.redaction_enforced,
            "upstream_url": policy.upstream_url,
            "upstream_api_key": policy.upstream_api_key,
            "bind_port": policy.bind_port,
            "enable_ocr": policy.enable_ocr,
            "disable_atr_auto_update": policy.disable_atr_auto_update,
            "allow_custom_allowlists": policy.allow_custom_allowlists,
            "bearer_token": policy.bearer_token,
            "enabled_detection_categories": policy.enabled_detection_categories,
            "custom_regex": policy.custom_regex,
            "allowlists": policy.allowlists,
            "target_mode": policy.target_mode,
            "target_regex": policy.target_regex,
            "group_ids": group_ids,
            "created_at": policy.created_at,
            "updated_at": policy.updated_at,
            "updated_by": policy.updated_by,
        }
    })))
}

async fn create_policy(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(req): Json<CreatePolicyRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let detection = req
        .enabled_detection_categories
        .as_ref()
        .map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Array(vec![])));
    let regex = req
        .custom_regex
        .as_ref()
        .map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Array(vec![])));
    let allowlists = req
        .allowlists
        .as_ref()
        .map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Array(vec![])));

    let updated_by = resolve_user_id(&state.pool, &user).await;

    let policy = sqlx::query_as::<_, Policy>(
        r#"INSERT INTO policies
           (org_id, name, description, redaction_enforced, upstream_url, upstream_api_key,
            bind_port, enable_ocr, disable_atr_auto_update, allow_custom_allowlists,
            bearer_token, detection_overrides, custom_regex, allowlists, target_mode, target_regex, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING *"#,
    )
    .bind(user.org_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(req.redaction_enforced.unwrap_or(false))
    .bind(&req.upstream_url)
    .bind(&req.upstream_api_key)
    .bind(req.bind_port)
    .bind(req.enable_ocr)
    .bind(req.disable_atr_auto_update)
    .bind(req.allow_custom_allowlists.unwrap_or(true))
    .bind(&req.bearer_token)
    .bind(detection)
    .bind(regex)
    .bind(allowlists)
    .bind(req.target_mode.unwrap_or_else(|| "all".to_string()))
    .bind(&req.target_regex)
    .bind(updated_by)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Failed to create policy: {}", e)})),
        )
    })?;

    if let Some(group_ids) = &req.group_ids {
        for gid in group_ids {
            sqlx::query(
                "INSERT INTO policy_assignments (policy_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(policy.id)
            .bind(gid)
            .execute(&state.pool)
            .await
            .ok();
        }
    }

    let group_ids_result: Vec<uuid::Uuid> = sqlx::query_scalar(
        "SELECT group_id FROM policy_assignments WHERE policy_id = $1",
    )
    .bind(policy.id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    Ok(Json(json!({
        "policy": {
            "id": policy.id,
            "org_id": policy.org_id,
            "name": policy.name,
            "description": policy.description,
            "redaction_enforced": policy.redaction_enforced,
            "upstream_url": policy.upstream_url,
            "upstream_api_key": policy.upstream_api_key,
            "bind_port": policy.bind_port,
            "enable_ocr": policy.enable_ocr,
            "disable_atr_auto_update": policy.disable_atr_auto_update,
            "allow_custom_allowlists": policy.allow_custom_allowlists,
            "bearer_token": policy.bearer_token,
            "enabled_detection_categories": policy.enabled_detection_categories,
            "custom_regex": policy.custom_regex,
            "allowlists": policy.allowlists,
            "target_mode": policy.target_mode,
            "target_regex": policy.target_regex,
            "group_ids": group_ids_result,
            "created_at": policy.created_at,
            "updated_at": policy.updated_at,
            "updated_by": policy.updated_by,
        }
    })))
}

async fn update_policy(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<Uuid>,
    Json(req): Json<CreatePolicyRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let detection = req
        .enabled_detection_categories
        .as_ref()
        .map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Array(vec![])));
    let regex = req
        .custom_regex
        .as_ref()
        .map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Array(vec![])));
    let allowlists = req
        .allowlists
        .as_ref()
        .map(|v| serde_json::to_value(v).unwrap_or(serde_json::Value::Array(vec![])));

    let updated_by = resolve_user_id(&state.pool, &user).await;

    let policy = sqlx::query_as::<_, Policy>(
        r#"UPDATE policies SET
           name = COALESCE($3, name),
           description = COALESCE($4, description),
           redaction_enforced = COALESCE($5, redaction_enforced),
           upstream_url = COALESCE($6, upstream_url),
           upstream_api_key = COALESCE(NULLIF($7, ''), upstream_api_key),
           bind_port = COALESCE($8, bind_port),
           enable_ocr = COALESCE($9, enable_ocr),
           disable_atr_auto_update = COALESCE($10, disable_atr_auto_update),
           allow_custom_allowlists = COALESCE($11, allow_custom_allowlists),
           bearer_token = COALESCE(NULLIF($12, ''), bearer_token),
           detection_overrides = COALESCE($13, detection_overrides),
           custom_regex = COALESCE($14, custom_regex),
           allowlists = COALESCE($15, allowlists),
           target_mode = COALESCE($16, target_mode),
           target_regex = COALESCE($17, target_regex),
           updated_at = NOW(),
           updated_by = $18
           WHERE id = $1 AND org_id = $2
           RETURNING *"#,
    )
    .bind(id)
    .bind(user.org_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(req.redaction_enforced)
    .bind(&req.upstream_url)
    .bind(&req.upstream_api_key)
    .bind(req.bind_port)
    .bind(req.enable_ocr)
    .bind(req.disable_atr_auto_update)
    .bind(req.allow_custom_allowlists)
    .bind(&req.bearer_token)
    .bind(detection)
    .bind(regex)
    .bind(allowlists)
    .bind(req.target_mode)
    .bind(&req.target_regex)
    .bind(updated_by)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Failed to update policy: {}", e)})),
        )
    })?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Policy not found"})),
        )
    })?;

    if let Some(group_ids) = &req.group_ids {
        sqlx::query("DELETE FROM policy_assignments WHERE policy_id = $1")
            .bind(policy.id)
            .execute(&state.pool)
            .await
            .ok();
        for gid in group_ids {
            sqlx::query(
                "INSERT INTO policy_assignments (policy_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(policy.id)
            .bind(gid)
            .execute(&state.pool)
            .await
            .ok();
        }
    }

    let group_ids_result: Vec<uuid::Uuid> = sqlx::query_scalar(
        "SELECT group_id FROM policy_assignments WHERE policy_id = $1",
    )
    .bind(policy.id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    Ok(Json(json!({
        "policy": {
            "id": policy.id,
            "org_id": policy.org_id,
            "name": policy.name,
            "description": policy.description,
            "redaction_enforced": policy.redaction_enforced,
            "upstream_url": policy.upstream_url,
            "bind_port": policy.bind_port,
            "enable_ocr": policy.enable_ocr,
            "disable_atr_auto_update": policy.disable_atr_auto_update,
            "allow_custom_allowlists": policy.allow_custom_allowlists,
            "bearer_token": policy.bearer_token,
            "enabled_detection_categories": policy.enabled_detection_categories,
            "custom_regex": policy.custom_regex,
            "allowlists": policy.allowlists,
            "target_mode": policy.target_mode,
            "target_regex": policy.target_regex,
            "group_ids": group_ids_result,
            "created_at": policy.created_at,
            "updated_at": policy.updated_at,
            "updated_by": policy.updated_by,
        }
    })))
}

async fn delete_policy(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, StatusCode> {
    let result = sqlx::query("DELETE FROM policies WHERE id = $1 AND org_id = $2")
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


