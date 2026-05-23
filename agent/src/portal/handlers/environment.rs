use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/agents/:uuid/environment", get(get_agent_environment))
        .route("/api/v1/environment/landscape", get(get_llm_landscape))
        .route("/api/v1/environment/suggestions", get(get_environment_suggestions))
}

#[derive(Deserialize)]
pub struct LandscapeQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub search: Option<String>,
}

#[derive(Deserialize)]
pub struct SuggestionsQuery {
    pub search: Option<String>,
}

/// Get the latest environment report for a specific agent
async fn get_agent_environment(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(uuid): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let report = sqlx::query_as::<_, (serde_json::Value,)>(
        r#"SELECT report FROM agent_environment_reports
           WHERE agent_uuid = $1 AND org_id = $2
           ORDER BY detected_at DESC LIMIT 1"#,
    )
    .bind(&uuid)
    .bind(user.org_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match report {
        Some((r,)) => Ok(Json(json!({ "report": r }))),
        None => Ok(Json(json!({ "report": null, "message": "No environment report available yet" }))),
    }
}

/// Get the LLM Landscape - aggregated view of all detected LLMs across the fleet
async fn get_llm_landscape(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Query(query): Query<LandscapeQuery>,
) -> Result<Json<Value>, StatusCode> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(50).min(100);
    let offset = (page - 1) * per_page;
    let search_str = query.search.as_deref().unwrap_or("");

    // Get latest environment report per agent (paginated via subquery for clean DISTINCT ON)
    let reports = sqlx::query_as::<_, (String, String, serde_json::Value)>(
        r#"SELECT latest.agent_uuid, a.hostname, latest.report
           FROM (
               SELECT DISTINCT ON (aer.agent_uuid) aer.agent_uuid, aer.report
               FROM agent_environment_reports aer
               JOIN agents a ON a.uuid = aer.agent_uuid AND a.org_id = aer.org_id
               WHERE aer.org_id = $1
               AND ($4 = '' OR a.hostname ILIKE '%' || $4 || '%')
               ORDER BY aer.agent_uuid, aer.detected_at DESC
               LIMIT $2 OFFSET $3
           ) latest
           JOIN agents a ON a.uuid = latest.agent_uuid AND a.org_id = $1
           ORDER BY a.hostname"#,
    )
    .bind(user.org_id)
    .bind(per_page)
    .bind(offset)
    .bind(search_str)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Gather LLM endpoints across all agents for the landscape view
    let mut llm_types: std::collections::HashMap<String, serde_json::Value> = std::collections::HashMap::new();
    let mut unmanaged_count = 0i64;

    for (agent_uuid, hostname, report) in &reports {
        if let Some(endpoints) = report.get("detected_endpoints").and_then(|e| e.as_array()) {
            for ep in endpoints {
                let st = ep.get("service_type").and_then(|t| t.as_str()).unwrap_or("unknown");
                let entry = llm_types.entry(st.to_string()).or_insert_with(|| {
                    json!({
                        "service_type": st,
                        "name": ep.get("name").and_then(|n| n.as_str()).unwrap_or(st),
                        "agent_count": 0,
                        "models": [],
                        "agents": [],
                    })
                });
                entry["agent_count"] = json!(entry["agent_count"].as_i64().unwrap_or(0) + 1);
                if let Some(models) = ep.get("models").and_then(|m| m.as_array()) {
                    let existing: std::collections::HashSet<String> = entry["models"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default();
                    for m in models {
                        if let Some(name) = m.as_str() {
                            if !existing.contains(name) {
                                entry["models"].as_array_mut().unwrap().push(json!(name));
                            }
                        }
                    }
                }
                let agents_arr = entry["agents"].as_array_mut().unwrap();
                agents_arr.push(json!({
                    "agent_uuid": agent_uuid,
                    "hostname": hostname,
                }));
            }
        }

        // Count agents with no environment report
        let has_endpoints = report.get("detected_endpoints")
            .and_then(|e| e.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        let has_env_vars = report.get("detected_env_vars")
            .and_then(|e| e.as_array())
            .map(|a| a.iter().any(|v| v.get("is_set").and_then(|s| s.as_bool()).unwrap_or(false)))
            .unwrap_or(false);

        if !has_endpoints && !has_env_vars {
            unmanaged_count += 1;
        }
    }

    let total: i64 = if search_str.is_empty() {
        sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM (
                   SELECT DISTINCT agent_uuid FROM agent_environment_reports WHERE org_id = $1
               ) sub"#,
        )
        .bind(user.org_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0)
    } else {
        sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM (
                   SELECT DISTINCT aer.agent_uuid
                   FROM agent_environment_reports aer
                   JOIN agents a ON a.uuid = aer.agent_uuid AND a.org_id = aer.org_id
                   WHERE aer.org_id = $1 AND a.hostname ILIKE '%' || $2 || '%'
               ) sub"#,
        )
        .bind(user.org_id)
        .bind(search_str)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0)
    };

    let llm_types_vec: Vec<serde_json::Value> = llm_types.into_values().collect();

    Ok(Json(json!({
        "landscape": {
            "llm_types": llm_types_vec,
            "unmanaged_agents": unmanaged_count,
            "total_reported": total,
        },
        "reports": reports.iter().map(|(uuid, hostname, report)| {
            json!({
                "agent_uuid": uuid,
                "hostname": hostname,
                "report": report,
            })
        }).collect::<Vec<_>>(),
        "total": total,
        "page": page,
        "per_page": per_page,
    })))
}

/// Get aggregated configuration suggestions across the fleet
async fn get_environment_suggestions(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Query(query): Query<SuggestionsQuery>,
) -> Result<Json<Value>, StatusCode> {
    let search_str = query.search.as_deref().unwrap_or("");

    let reports = sqlx::query_as::<_, (String, String, serde_json::Value)>(
        r#"SELECT DISTINCT ON (aer.agent_uuid)
               aer.agent_uuid,
               a.hostname,
               aer.report
           FROM agent_environment_reports aer
           JOIN agents a ON a.uuid = aer.agent_uuid AND a.org_id = aer.org_id
           WHERE aer.org_id = $1
           AND ($2 = '' OR a.hostname ILIKE '%' || $2 || '%')
           ORDER BY aer.agent_uuid, aer.detected_at DESC"#,
    )
    .bind(user.org_id)
    .bind(search_str)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Aggregate suggestions across all agents
    let mut suggestion_map: std::collections::HashMap<String, serde_json::Value> = std::collections::HashMap::new();

    for (agent_uuid, hostname, report) in &reports {
        if let Some(suggestions) = report.get("config_suggestions").and_then(|s| s.as_array()) {
            for suggestion in suggestions {
                let category = suggestion.get("category").and_then(|c| c.as_str()).unwrap_or("other");
                let desc = suggestion.get("description").and_then(|d| d.as_str()).unwrap_or("");
                let value = suggestion.get("suggested_value").and_then(|v| v.as_str()).unwrap_or("");

                let key = format!("{}::{}", category, value);
                let entry = suggestion_map.entry(key).or_insert_with(|| {
                    json!({
                        "category": category,
                        "description": desc,
                        "suggested_value": value,
                        "priority": suggestion.get("priority").and_then(|p| p.as_str()).unwrap_or("low"),
                        "affected_agent_count": 0,
                        "agents": [],
                    })
                });
                entry["affected_agent_count"] = json!(entry["affected_agent_count"].as_i64().unwrap_or(0) + 1);
                entry["agents"].as_array_mut().unwrap().push(json!({
                    "agent_uuid": agent_uuid,
                    "hostname": hostname,
                }));
            }
        }
    }

    let mut suggestions_vec: Vec<serde_json::Value> = suggestion_map.into_values().collect();
    suggestions_vec.sort_by(|a, b| {
        let pa = a["affected_agent_count"].as_i64().unwrap_or(0);
        let pb = b["affected_agent_count"].as_i64().unwrap_or(0);
        pb.cmp(&pa)
    });

    Ok(Json(json!({
        "suggestions": suggestions_vec,
        "total": suggestions_vec.len(),
    })))
}
