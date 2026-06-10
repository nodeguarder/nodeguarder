use std::sync::{Arc, Mutex};
use std::collections::VecDeque;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestMetric {
    pub timestamp_ms: i64,
    pub session_id: String,
    pub model_requested: String,
    pub model_used: String,
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub total_latency_ms: u64,
    pub detection_latency_ms: u64,
    pub upstream_latency_ms: u64,

    pub was_blocked: bool,
    pub was_redacted: bool,
    pub upstream_status: u16,
}

pub struct MetricsCollector {
    buffer: Arc<Mutex<VecDeque<RequestMetric>>>,
    max_metrics: usize,
}

impl MetricsCollector {
    pub fn new(max_metrics: usize) -> Self {
        Self {
            buffer: Arc::new(Mutex::new(VecDeque::with_capacity(max_metrics))),
            max_metrics,
        }
    }

    pub fn push(&self, metric: RequestMetric) {
        let mut buf = self.buffer.lock().unwrap();
        if buf.len() >= self.max_metrics {
            buf.pop_front();
        }
        buf.push_back(metric);
    }

    pub fn drain(&self) -> Vec<RequestMetric> {
        let mut buf = self.buffer.lock().unwrap();
        buf.drain(..).collect()
    }

    pub fn len(&self) -> usize {
        self.buffer.lock().unwrap().len()
    }

    pub fn shared(&self) -> Arc<Mutex<VecDeque<RequestMetric>>> {
        self.buffer.clone()
    }
}

#[allow(dead_code)]
pub fn estimate_cost(model: &str, prompt_tokens: u64, completion_tokens: u64) -> f64 {
    let model = model.to_lowercase();
    let (input_price, output_price) = if model.contains("gpt-4") && model.contains("turbo") {
        (0.01, 0.03)
    } else if model.contains("gpt-4") {
        (0.03, 0.06)
    } else if model.contains("gpt-3.5") || model.contains("gpt-35") {
        (0.0015, 0.002)
    } else if (model.contains("claude-3") || model.contains("claude-4")) && model.contains("opus") {
        (0.015, 0.075)
    } else if (model.contains("claude-3") || model.contains("claude-4")) && model.contains("sonnet") {
        (0.003, 0.015)
    } else if (model.contains("claude-3") || model.contains("claude-4")) && model.contains("haiku") {
        (0.00025, 0.00125)
    } else if model.contains("claude") {
        (0.008, 0.024)
    } else if model.contains("gemini") && model.contains("pro") {
        (0.001, 0.002)
    } else if model.contains("gemini") {
        (0.0005, 0.0015)
    } else if model.contains("mistral") && model.contains("large") {
        (0.004, 0.012)
    } else if model.contains("mistral") {
        (0.001, 0.003)
    } else if model.contains("llama") || model.contains("codellama") || model.contains("deepseek") {
        (0.0005, 0.0005)
    } else {
        (0.002, 0.002)
    };
    (prompt_tokens as f64 / 1000.0 * input_price) + (completion_tokens as f64 / 1000.0 * output_price)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_collector_push() {
        let collector = MetricsCollector::new(10);
        assert_eq!(collector.len(), 0);
        collector.push(RequestMetric {
            timestamp_ms: 0,
            session_id: "test".to_string(),
            model_requested: "gpt-4".to_string(),
            model_used: "gpt-4".to_string(),
            prompt_tokens: Some(10),
            completion_tokens: Some(20),
            total_tokens: Some(30),
            total_latency_ms: 100,
            detection_latency_ms: 5,
            upstream_latency_ms: 95,

            was_blocked: false,
            was_redacted: false,
            upstream_status: 200,
        });
        assert_eq!(collector.len(), 1);
    }

    #[test]
    fn test_metrics_collector_drain() {
        let collector = MetricsCollector::new(10);
        collector.push(RequestMetric {
            timestamp_ms: 1,
            session_id: "s1".to_string(),
            model_requested: "gpt-4".to_string(),
            model_used: "gpt-4".to_string(),
            prompt_tokens: Some(10),
            completion_tokens: Some(20),
            total_tokens: Some(30),
            total_latency_ms: 100,
            detection_latency_ms: 5,
            upstream_latency_ms: 95,

            was_blocked: false,
            was_redacted: false,
            upstream_status: 200,
        });
        collector.push(RequestMetric {
            timestamp_ms: 2,
            session_id: "s2".to_string(),
            model_requested: "gpt-3.5".to_string(),
            model_used: "gpt-3.5".to_string(),
            prompt_tokens: Some(5),
            completion_tokens: Some(10),
            total_tokens: Some(15),
            total_latency_ms: 50,
            detection_latency_ms: 2,
            upstream_latency_ms: 48,

            was_blocked: false,
            was_redacted: false,
            upstream_status: 200,
        });
        let drained = collector.drain();
        assert_eq!(drained.len(), 2);
        assert_eq!(collector.len(), 0);
    }

    #[test]
    fn test_metrics_collector_max_capacity() {
        let collector = MetricsCollector::new(2);
        for i in 0..5 {
            collector.push(RequestMetric {
                timestamp_ms: i,
                session_id: format!("s{}", i),
                model_requested: "gpt-4".to_string(),
                model_used: "gpt-4".to_string(),
                prompt_tokens: Some(10),
                completion_tokens: Some(20),
                total_tokens: Some(30),
                total_latency_ms: 100,
                detection_latency_ms: 5,
                upstream_latency_ms: 95,
    
                was_blocked: false,
                was_redacted: false,
                upstream_status: 200,
            });
        }
        assert_eq!(collector.len(), 2);
        let drained = collector.drain();
        assert_eq!(drained[0].timestamp_ms, 3);
    }

    #[test]
    fn test_estimate_cost_gpt4() {
        let cost = estimate_cost("gpt-4", 1000, 500);
        assert!((cost - 0.06).abs() < 0.001);
    }

    #[test]
    fn test_estimate_cost_gpt35() {
        let cost = estimate_cost("gpt-3.5-turbo", 1000, 500);
        assert!((cost - 0.0025).abs() < 0.001);
    }

    #[test]
    fn test_estimate_cost_claude() {
        let cost = estimate_cost("claude-3-sonnet", 1000, 500);
        assert!((cost - 0.0105).abs() < 0.001);
    }

    #[test]
    fn test_estimate_cost_local_model() {
        let cost = estimate_cost("llama3", 1000, 500);
        assert!((cost - 0.00075).abs() < 0.001);
    }

    #[test]
    fn test_estimate_cost_unknown() {
        let cost = estimate_cost("custom-model-x", 1000, 500);
        assert!((cost - 0.003).abs() < 0.001);
    }
}
