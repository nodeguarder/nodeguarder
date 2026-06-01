use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;

#[derive(Serialize)]
pub struct MetricsResponse {
    pub metrics: Vec<MetricRow>,
    pub total: i64,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MetricRow {
    pub id: i64,
    pub agent_uuid: String,
    pub timestamp_ms: i64,
    pub model_requested: String,
    pub model_used: String,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub total_latency_ms: i64,
    pub detection_latency_ms: i64,
    pub upstream_latency_ms: i64,
    pub was_cached: bool,
    pub was_blocked: bool,
    pub was_redacted: bool,
    pub upstream_status: i32,
}

#[derive(Deserialize)]
pub struct MetricsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub since: Option<i64>,
}

#[derive(Serialize)]
pub struct MetricsSummary {
    pub total_requests: i64,
    pub cached_requests: i64,
    pub blocked_requests: i64,
    pub redacted_requests: i64,
    pub avg_total_latency_ms: f64,
    pub avg_detection_latency_ms: f64,
    pub avg_upstream_latency_ms: f64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub estimated_cost_usd: f64,
    pub unique_agents: i64,
    pub unique_models: i64,
}

#[derive(Serialize)]
pub struct PerModelRow {
    pub model: String,
    pub request_count: i64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub avg_latency_ms: f64,
    pub cached_count: i64,
    pub estimated_cost_usd: f64,
}

#[derive(Serialize)]
pub struct DailyRow {
    pub date: String,
    pub request_count: i64,
    pub cached_count: i64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub estimated_cost_usd: f64,
}

#[derive(Serialize)]
pub struct PerAgentRow {
    pub agent_uuid: String,
    pub request_count: i64,
    pub total_tokens: i64,
    pub avg_latency_ms: f64,
    pub cached_count: i64,
}

async fn get_agent_metrics(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(uuid): Path<String>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<MetricsResponse>, (StatusCode, String)> {
    let limit = query.limit.unwrap_or(100).min(1000);
    let offset = query.offset.unwrap_or(0);

    let metrics = sqlx::query_as::<_, MetricRow>(
        r#"SELECT id, agent_uuid::text, timestamp_ms, model_requested, model_used,
                  prompt_tokens, completion_tokens, total_tokens,
                  total_latency_ms, detection_latency_ms, upstream_latency_ms,
                  was_cached, was_blocked, was_redacted, upstream_status
           FROM agent_request_metrics
           WHERE agent_uuid = $1 AND org_id = $2
           ORDER BY timestamp_ms DESC
           LIMIT $3 OFFSET $4"#,
    )
    .bind(&uuid)
    .bind(user.org_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM agent_request_metrics WHERE agent_uuid = $1 AND org_id = $2",
    )
    .bind(&uuid)
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(MetricsResponse { metrics, total: total.0 }))
}

async fn get_metrics_summary(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<MetricsSummary>, (StatusCode, String)> {
    let row = sqlx::query_as::<_, (i64, i64, i64, i64, f64, f64, f64, i64, i64, i64, i64)>(
        r#"SELECT
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE was_cached)::bigint,
            COUNT(*) FILTER (WHERE was_blocked)::bigint,
            COUNT(*) FILTER (WHERE was_redacted)::bigint,
            COALESCE(AVG(total_latency_ms), 0),
            COALESCE(AVG(detection_latency_ms), 0),
            COALESCE(AVG(upstream_latency_ms), 0),
            COALESCE(SUM(prompt_tokens), 0)::bigint,
            COALESCE(SUM(completion_tokens), 0)::bigint,
            COUNT(DISTINCT agent_uuid)::bigint,
            COUNT(DISTINCT model_used)::bigint
           FROM agent_request_metrics
           WHERE org_id = $1
           AND timestamp_ms > (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000)::bigint"#,
    )
    .bind(user.org_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let estimated = crate::metrics::estimate_cost(
        "gpt-4",
        row.7 as u64,
        row.8 as u64,
    );

    Ok(Json(MetricsSummary {
        total_requests: row.0,
        cached_requests: row.1,
        blocked_requests: row.2,
        redacted_requests: row.3,
        avg_total_latency_ms: row.4,
        avg_detection_latency_ms: row.5,
        avg_upstream_latency_ms: row.6,
        total_prompt_tokens: row.7,
        total_completion_tokens: row.8,
        estimated_cost_usd: estimated,
        unique_agents: row.9,
        unique_models: row.10,
    }))
}

async fn get_metrics_per_model(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<PerModelRow>>, (StatusCode, String)> {
    let rows = sqlx::query_as::<_, (String, i64, i64, i64, f64, i64)>(
        r#"SELECT
            model_used,
            COUNT(*)::bigint,
            COALESCE(SUM(prompt_tokens), 0)::bigint,
            COALESCE(SUM(completion_tokens), 0)::bigint,
            COALESCE(AVG(total_latency_ms), 0),
            COUNT(*) FILTER (WHERE was_cached)::bigint
           FROM agent_request_metrics
           WHERE org_id = $1
           AND timestamp_ms > (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000)::bigint
           GROUP BY model_used
           ORDER BY COUNT(*) DESC"#,
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let result: Vec<PerModelRow> = rows
        .into_iter()
        .map(|(model, count, pt, ct, avg_lat, cached)| {
            let cost = crate::metrics::estimate_cost(&model, pt as u64, ct as u64);
            PerModelRow {
                model,
                request_count: count,
                total_prompt_tokens: pt,
                total_completion_tokens: ct,
                avg_latency_ms: avg_lat,
                cached_count: cached,
                estimated_cost_usd: cost,
            }
        })
        .collect();

    Ok(Json(result))
}

async fn get_metrics_daily(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<DailyRow>>, (StatusCode, String)> {
    let rows = sqlx::query_as::<_, (String, i64, i64, i64, i64)>(
        r#"SELECT
            to_char(to_timestamp(timestamp_ms / 1000)::date, 'YYYY-MM-DD'),
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE was_cached)::bigint,
            COALESCE(SUM(prompt_tokens), 0)::bigint,
            COALESCE(SUM(completion_tokens), 0)::bigint
           FROM agent_request_metrics
           WHERE org_id = $1
           AND timestamp_ms > (EXTRACT(EPOCH FROM NOW()) * 1000 - 2592000000)::bigint
           GROUP BY to_char(to_timestamp(timestamp_ms / 1000)::date, 'YYYY-MM-DD')
           ORDER BY 1"#,
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let result: Vec<DailyRow> = rows
        .into_iter()
        .map(|(date, count, cached, pt, ct)| {
            let cost = crate::metrics::estimate_cost("gpt-4", pt as u64, ct as u64);
            DailyRow {
                date,
                request_count: count,
                cached_count: cached,
                total_prompt_tokens: pt,
                total_completion_tokens: ct,
                estimated_cost_usd: cost,
            }
        })
        .collect();

    Ok(Json(result))
}

async fn get_metrics_per_agent(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<PerAgentRow>>, (StatusCode, String)> {
    let rows = sqlx::query_as::<_, (String, i64, i64, f64, i64)>(
        r#"SELECT
            agent_uuid::text,
            COUNT(*)::bigint,
            COALESCE(SUM(total_tokens), 0)::bigint,
            COALESCE(AVG(total_latency_ms), 0),
            COUNT(*) FILTER (WHERE was_cached)::bigint
           FROM agent_request_metrics
           WHERE org_id = $1
           AND timestamp_ms > (EXTRACT(EPOCH FROM NOW()) * 1000 - 86400000)::bigint
           GROUP BY agent_uuid
           ORDER BY COUNT(*) DESC"#,
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let result: Vec<PerAgentRow> = rows
        .into_iter()
        .map(|(uuid, count, tokens, avg_lat, cached)| PerAgentRow {
            agent_uuid: uuid,
            request_count: count,
            total_tokens: tokens,
            avg_latency_ms: avg_lat,
            cached_count: cached,
        })
        .collect();

    Ok(Json(result))
}

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/agents/:uuid/metrics", get(get_agent_metrics))
        .route(
            "/api/v1/organization/metrics/summary",
            get(get_metrics_summary),
        )
        .route(
            "/api/v1/organization/metrics/per-model",
            get(get_metrics_per_model),
        )
        .route(
            "/api/v1/organization/metrics/daily",
            get(get_metrics_daily),
        )
        .route(
            "/api/v1/organization/metrics/per-agent",
            get(get_metrics_per_agent),
        )
}
