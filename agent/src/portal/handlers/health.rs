use axum::{http::StatusCode, routing::get, Json, Router};
use serde_json::{json, Value};
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Instant;

use crate::portal::handlers::AppState;

fn start_time() -> &'static Instant {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(|| Instant::now())
}

fn format_uptime(secs: u64) -> String {
    let d = secs / 86400;
    let h = (secs % 86400) / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if d > 0 {
        format!("{d}d {h}h {m}m {s}s")
    } else if h > 0 {
        format!("{h}h {m}m {s}s")
    } else if m > 0 {
        format!("{m}m {s}s")
    } else {
        format!("{s}s")
    }
}

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/health", get(health_check))
        .route("/healthz", get(health_check))
        .route("/readyz", get(readiness_check))
}

async fn health_check(
    state: axum::extract::State<Arc<AppState>>,
) -> Json<Value> {
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.pool)
        .await
        .is_ok();

    Json(json!({
        "status": if db_ok { "healthy" } else { "degraded" },
        "uptime": format_uptime(start_time().elapsed().as_secs()),
        "database": db_ok,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn readiness_check(
    state: axum::extract::State<Arc<AppState>>,
) -> Result<Json<Value>, StatusCode> {
    sqlx::query("SELECT 1")
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(Json(json!({
        "status": "ready",
    })))
}
