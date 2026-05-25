use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::portal::auth::AuthenticatedUser;
use crate::portal::handlers::AppState;
use crate::portal::models::{ComplianceReport, GenerateReportRequest};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/compliance/reports", get(list_reports))
        .route("/api/v1/compliance/reports/generate", post(generate_report))
        .route("/api/v1/compliance/reports/:id", get(get_report))
        .route("/api/v1/compliance/summary", get(compliance_summary))
}

struct ComplianceMetrics {
    total_detections: i64,
    blocked: i64,
    redacted: i64,
    allowed: i64,
    total_agents: i64,
    online_agents: i64,
    offline_agents: i64,
    active_policies: i64,
}

struct ControlScore {
    name: String,
    status: String,
    score: f64,
    evidence: String,
}

async fn compute_metrics(pool: &sqlx::PgPool, org_id: uuid::Uuid, date_from: &str, date_to: &str) -> ComplianceMetrics {
    let total_detections: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE org_id = $1 AND flagged_at >= $2::timestamptz AND flagged_at < $3::timestamptz",
    )
    .bind(org_id).bind(date_from).bind(date_to)
    .fetch_one(pool).await.unwrap_or(0);

    let blocked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE org_id = $1 AND action_taken = 'BLOCK' AND flagged_at >= $2::timestamptz AND flagged_at < $3::timestamptz",
    )
    .bind(org_id).bind(date_from).bind(date_to)
    .fetch_one(pool).await.unwrap_or(0);

    let redacted: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE org_id = $1 AND action_taken = 'REDACT' AND flagged_at >= $2::timestamptz AND flagged_at < $3::timestamptz",
    )
    .bind(org_id).bind(date_from).bind(date_to)
    .fetch_one(pool).await.unwrap_or(0);

    let allowed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE org_id = $1 AND action_taken = 'ALLOW' AND flagged_at >= $2::timestamptz AND flagged_at < $3::timestamptz",
    )
    .bind(org_id).bind(date_from).bind(date_to)
    .fetch_one(pool).await.unwrap_or(0);

    let total_agents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE org_id = $1")
        .bind(org_id).fetch_one(pool).await.unwrap_or(0);

    let online_agents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE org_id = $1 AND status = 'online'")
        .bind(org_id).fetch_one(pool).await.unwrap_or(0);

    let offline_agents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agents WHERE org_id = $1 AND status = 'offline'")
        .bind(org_id).fetch_one(pool).await.unwrap_or(0);

    let active_policies: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM policies WHERE org_id = $1")
        .bind(org_id).fetch_one(pool).await.unwrap_or(0);

    ComplianceMetrics {
        total_detections, blocked, redacted, allowed,
        total_agents, online_agents, offline_agents, active_policies,
    }
}

fn compute_eu_ai_act(metrics: &ComplianceMetrics) -> (Vec<ControlScore>, f64) {
    let controls = vec![
        ControlScore {
            name: "Risk Management".into(),
            status: if metrics.total_detections > 0 { "compliant" } else { "in-progress" }.into(),
            score: if metrics.total_detections > 0 { 1.0 } else { 0.3 },
            evidence: format!("{} detections processed", metrics.total_detections),
        },
        ControlScore {
            name: "Transparency".into(),
            status: if metrics.redacted > 0 || metrics.allowed > 0 { "compliant" } else if metrics.total_detections > 0 { "in-progress" } else { "not-started" }.into(),
            score: if metrics.total_detections > 0 { (metrics.redacted as f64 + metrics.allowed as f64) / metrics.total_detections as f64 } else { 0.0 },
            evidence: format!("{} redacted, {} allowed", metrics.redacted, metrics.allowed),
        },
        ControlScore {
            name: "Human Oversight".into(),
            status: if metrics.allowed > 0 { "compliant" } else if metrics.blocked > 0 { "in-progress" } else { "not-started" }.into(),
            score: if metrics.total_detections > 0 { (metrics.allowed as f64 + metrics.blocked as f64) / metrics.total_detections as f64 } else { 0.0 },
            evidence: format!("{} HITL decisions made", metrics.allowed + metrics.blocked),
        },
        ControlScore {
            name: "Documentation".into(),
            status: if metrics.active_policies > 0 { "compliant" } else { "not-started" }.into(),
            score: if metrics.active_policies > 0 { 1.0 } else { 0.0 },
            evidence: format!("{} active policies", metrics.active_policies),
        },
    ];

    let overall = controls.iter().map(|c| c.score).sum::<f64>() / controls.len() as f64;
    (controls, overall)
}

fn compute_soc_2(metrics: &ComplianceMetrics) -> (Vec<ControlScore>, f64) {
    let coverage_rate = if metrics.total_agents > 0 {
        metrics.online_agents as f64 / metrics.total_agents as f64
    } else {
        0.0
    };

    let detection_rate = if metrics.total_detections > 0 {
        (metrics.blocked + metrics.redacted) as f64 / metrics.total_detections as f64
    } else {
        0.0
    };

    let controls = vec![
        ControlScore {
            name: "Security".into(),
            status: if metrics.blocked > 0 { "compliant" } else if metrics.total_detections > 0 { "in-progress" } else { "not-started" }.into(),
            score: if metrics.total_detections > 0 { metrics.blocked as f64 / metrics.total_detections as f64 } else { 0.0 },
            evidence: format!("{} threats blocked", metrics.blocked),
        },
        ControlScore {
            name: "Availability".into(),
            status: if coverage_rate >= 0.8 { "compliant" } else if coverage_rate >= 0.5 { "in-progress" } else { "not-started" }.into(),
            score: coverage_rate,
            evidence: format!("{} of {} agents online", metrics.online_agents, metrics.total_agents),
        },
        ControlScore {
            name: "Confidentiality".into(),
            status: if metrics.redacted > 0 { "compliant" } else if metrics.total_detections > 0 { "in-progress" } else { "not-started" }.into(),
            score: if metrics.total_detections > 0 { metrics.redacted as f64 / metrics.total_detections as f64 } else { 0.0 },
            evidence: format!("{} redactions applied", metrics.redacted),
        },
        ControlScore {
            name: "Privacy".into(),
            status: if detection_rate > 0.5 { "compliant" } else if metrics.total_detections > 0 { "in-progress" } else { "not-started" }.into(),
            score: detection_rate,
            evidence: format!("{}% detection rate", (detection_rate * 100.0) as i64),
        },
    ];

    let overall = controls.iter().map(|c| c.score).sum::<f64>() / controls.len() as f64;
    (controls, overall)
}

fn compute_custom(metrics: &ComplianceMetrics) -> (Vec<ControlScore>, f64) {
    let coverage_rate = if metrics.total_agents > 0 {
        metrics.online_agents as f64 / metrics.total_agents as f64
    } else {
        1.0
    };

    let controls = vec![
        ControlScore {
            name: "Detection Coverage".into(),
            status: if metrics.total_detections > 0 { "compliant" } else { "in-progress" }.into(),
            score: if metrics.total_detections > 0 { 1.0 } else { 0.3 },
            evidence: format!("{} total detections", metrics.total_detections),
        },
        ControlScore {
            name: "Response Rate".into(),
            status: if metrics.blocked + metrics.redacted > 0 { "compliant" } else { "not-started" }.into(),
            score: if metrics.total_detections > 0 { (metrics.blocked + metrics.redacted) as f64 / metrics.total_detections as f64 } else { 0.0 },
            evidence: format!("{} blocked + {} redacted", metrics.blocked, metrics.redacted),
        },
        ControlScore {
            name: "Agent Coverage".into(),
            status: if coverage_rate >= 0.8 { "compliant" } else if coverage_rate >= 0.5 { "in-progress" } else { "not-started" }.into(),
            score: coverage_rate,
            evidence: format!("{} of {} agents online", metrics.online_agents, metrics.total_agents),
        },
    ];

    let overall = controls.iter().map(|c| c.score).sum::<f64>() / controls.len() as f64;
    (controls, overall)
}

fn compute_status(score: f64) -> String {
    if score >= 0.9 {
        "compliant".into()
    } else if score >= 0.5 {
        "in-progress".into()
    } else {
        "not-started".into()
    }
}

async fn list_reports(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let reports = sqlx::query_as::<_, ComplianceReport>(
        r#"SELECT DISTINCT ON (framework) id, org_id, framework, status, score, report_data, generated_at, generated_by
           FROM compliance_reports
           WHERE org_id = $1
           ORDER BY framework, generated_at DESC"#,
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "reports": reports })))
}

async fn generate_report(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Json(req): Json<GenerateReportRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !matches!(req.framework.as_str(), "eu-ai-act" | "soc-2" | "custom") {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid framework. Must be 'eu-ai-act', 'soc-2', or 'custom'"}))));
    }

    let now = chrono::Utc::now();
    let date_to = req.date_to.unwrap_or_else(|| now.format("%Y-%m-%d").to_string());
    let date_from = req.date_from.unwrap_or_else(|| {
        (now - chrono::Duration::days(30)).format("%Y-%m-%d").to_string()
    });

    let metrics = compute_metrics(&state.pool, user.org_id, &date_from, &date_to).await;

    let (controls, overall) = match req.framework.as_str() {
        "eu-ai-act" => compute_eu_ai_act(&metrics),
        "soc-2" => compute_soc_2(&metrics),
        _ => compute_custom(&metrics),
    };

    let status = compute_status(overall);
    let controls_json: Vec<Value> = controls.iter().map(|c| json!({
        "name": c.name,
        "status": c.status,
        "score": c.score,
        "evidence": c.evidence,
    })).collect();

    let report_data = json!({
        "controls": controls_json,
        "metrics": {
            "total_detections": metrics.total_detections,
            "blocked": metrics.blocked,
            "redacted": metrics.redacted,
            "allowed": metrics.allowed,
        },
        "coverage": {
            "total_agents": metrics.total_agents,
            "online_agents": metrics.online_agents,
            "offline_agents": metrics.offline_agents,
            "active_policies": metrics.active_policies,
        },
        "date_range": {
            "from": date_from,
            "to": date_to,
        },
    });

    let report = sqlx::query_as::<_, ComplianceReport>(
        r#"INSERT INTO compliance_reports (org_id, framework, status, score, report_data, generated_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, org_id, framework, status, score, report_data, generated_at, generated_by"#,
    )
    .bind(user.org_id)
    .bind(&req.framework)
    .bind(&status)
    .bind(overall)
    .bind(&report_data)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert compliance report: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to generate report"})))
    })?;

    Ok(Json(json!({ "report": report })))
}

async fn get_report(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Value>, StatusCode> {
    let report = sqlx::query_as::<_, ComplianceReport>(
        "SELECT id, org_id, framework, status, score, report_data, generated_at, generated_by FROM compliance_reports WHERE id = $1 AND org_id = $2",
    )
    .bind(id)
    .bind(user.org_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(json!({ "report": report })))
}

async fn compliance_summary(
    State(state): State<Arc<AppState>>,
    user: AuthenticatedUser,
) -> Result<Json<Value>, StatusCode> {
    let rows = sqlx::query_as::<_, (String, i64)>(
        r#"SELECT status, COUNT(*) as count FROM compliance_reports WHERE org_id = $1 GROUP BY status"#,
    )
    .bind(user.org_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut compliant = 0i64;
    let mut in_progress = 0i64;
    let mut not_started = 0i64;
    for (status, count) in &rows {
        match status.as_str() {
            "compliant" => compliant = *count,
            "in-progress" => in_progress = *count,
            _ => not_started = *count,
        }
    }

    Ok(Json(json!({
        "total_reports": compliant + in_progress + not_started,
        "compliant": compliant,
        "in_progress": in_progress,
        "not_started": not_started,
    })))
}
