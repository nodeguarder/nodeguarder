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
use crate::portal::models::{CreatePolicyRequest, Policy, UpstreamRoute};

async fn resolve_user_id(pool: &sqlx::PgPool, user: &AuthenticatedUser) -> Option<Uuid> {
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE id = $1")
        .bind(user.user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

async fn load_routes(pool: &sqlx::PgPool, policy_id: Uuid) -> Vec<UpstreamRoute> {
    sqlx::query_as::<_, (Uuid, Uuid, String, String, Option<String>, Option<String>, i32)>(
        "SELECT id, policy_id, match_pattern, url, api_key, api_key_source, priority
         FROM policy_upstream_routes
         WHERE policy_id = $1
         ORDER BY priority ASC, created_at ASC",
    )
    .bind(policy_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(id, policy_id, match_pattern, url, api_key, api_key_source, priority)| UpstreamRoute {
        id: Some(id),
        policy_id: Some(policy_id),
        match_pattern,
        url,
        api_key,
        api_key_source,
        priority,
    })
    .collect()
}

async fn save_routes(pool: &sqlx::PgPool, policy_id: Uuid, routes: &[UpstreamRoute]) {
    // Remove existing routes
    sqlx::query("DELETE FROM policy_upstream_routes WHERE policy_id = $1")
        .bind(policy_id)
        .execute(pool)
        .await
        .ok();

    // Insert new routes
    for route in routes {
        let api_key = if route.api_key_source.is_some() { None } else { route.api_key.clone() };
        sqlx::query(
            "INSERT INTO policy_upstream_routes (policy_id, match_pattern, url, api_key, api_key_source, priority)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(policy_id)
        .bind(&route.match_pattern)
        .bind(&route.url)
        .bind(&api_key)
        .bind(&route.api_key_source)
        .bind(route.priority)
        .execute(pool)
        .await
        .ok();
    }
}

fn build_policy_json(policy: &Policy, group_ids: &[Uuid], routes: &[UpstreamRoute]) -> serde_json::Value {
    json!({
        "id": policy.id,
        "org_id": policy.org_id,
        "name": policy.name,
        "description": policy.description,
        "version": policy.version,
        "priority": policy.priority,
        "redaction_enforced": policy.redaction_enforced,
        "on_detection": policy.on_detection,
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
        "upstream_routes": routes,
        "created_at": policy.created_at,
        "updated_at": policy.updated_at,
        "updated_by": policy.updated_by,
    })
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

        let routes = load_routes(&state.pool, p.id).await;
        result.push(build_policy_json(&p, &group_ids, &routes));
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

    let routes = load_routes(&state.pool, policy.id).await;

    Ok(Json(json!({
        "policy": build_policy_json(&policy, &group_ids, &routes)
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

    let on_detection = req.on_detection.clone().unwrap_or_else(|| {
        if req.redaction_enforced.unwrap_or(false) { "enforced_redact".to_string() } else { "permissive".to_string() }
    });

    let policy = sqlx::query_as::<_, Policy>(
        r#"INSERT INTO policies
           (org_id, name, description, redaction_enforced, on_detection, upstream_url, upstream_api_key,
            bind_port, enable_ocr, disable_atr_auto_update, allow_custom_allowlists,
            bearer_token, detection_overrides, custom_regex, allowlists, target_mode, target_regex,
            priority, version, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
           RETURNING *"#,
    )
    .bind(user.org_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(req.redaction_enforced.unwrap_or(false))
    .bind(&on_detection)
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
    .bind(req.priority.unwrap_or(100))
    .bind(1_i32)
    .bind(updated_by)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Failed to create policy: {}", e)})),
        )
    })?;

    // Save upstream routes if provided, otherwise create catch-all from legacy fields
    let routes = if let Some(routes) = &req.upstream_routes {
        save_routes(&state.pool, policy.id, routes).await;
        load_routes(&state.pool, policy.id).await
    } else if req.upstream_url.is_some() {
        let legacy_route = UpstreamRoute {
            id: None,
            policy_id: None,
            match_pattern: "*".to_string(),
            url: req.upstream_url.clone().unwrap_or_default(),
            api_key: req.upstream_api_key.clone(),
            api_key_source: None,
            priority: 0,
        };
        save_routes(&state.pool, policy.id, &[legacy_route]).await;
        load_routes(&state.pool, policy.id).await
    } else {
        vec![]
    };

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
        "policy": build_policy_json(&policy, &group_ids_result, &routes)
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
           on_detection = COALESCE($6, on_detection),
           upstream_url = COALESCE($7, upstream_url),
           upstream_api_key = CASE WHEN $8::text IS NOT NULL AND $8::text = '' THEN NULL WHEN $8 IS NOT NULL THEN $8 ELSE upstream_api_key END,
           bind_port = COALESCE($9, bind_port),
           enable_ocr = COALESCE($10, enable_ocr),
           disable_atr_auto_update = COALESCE($11, disable_atr_auto_update),
           allow_custom_allowlists = COALESCE($12, allow_custom_allowlists),
           bearer_token = CASE WHEN $13::text IS NOT NULL AND $13::text = '' THEN NULL WHEN $13 IS NOT NULL THEN $13 ELSE bearer_token END,
           detection_overrides = COALESCE($14, detection_overrides),
           custom_regex = COALESCE($15, custom_regex),
           allowlists = COALESCE($16, allowlists),
           target_mode = COALESCE($17, target_mode),
           target_regex = COALESCE($18, target_regex),
           priority = COALESCE($20, priority),
           version = version + 1,
           updated_at = NOW(),
           updated_by = $19
           WHERE id = $1 AND org_id = $2
           RETURNING *"#,
    )
    .bind(id)
    .bind(user.org_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(req.redaction_enforced)
    .bind(&req.on_detection)
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
    .bind(req.priority)
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

    if let Some(routes) = &req.upstream_routes {
        save_routes(&state.pool, policy.id, routes).await;
    } else if req.upstream_url.is_some() {
        let legacy_route = UpstreamRoute {
            id: None,
            policy_id: None,
            match_pattern: "*".to_string(),
            url: req.upstream_url.clone().unwrap_or_default(),
            api_key: req.upstream_api_key.clone(),
            api_key_source: None,
            priority: 0,
        };
        save_routes(&state.pool, policy.id, &[legacy_route]).await;
    }

    let routes = load_routes(&state.pool, policy.id).await;

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
        "policy": build_policy_json(&policy, &group_ids_result, &routes)
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


