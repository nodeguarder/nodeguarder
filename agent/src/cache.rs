use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};
use serde_json::Value;

struct CacheEntry {
    response: Value,
    created_at: Instant,
}

pub struct ResponseCache {
    store: HashMap<u64, CacheEntry>,
    ttl: Duration,
    max_entries: usize,
}

impl ResponseCache {
    pub fn new(ttl_secs: u64, max_entries: usize) -> Self {
        Self {
            store: HashMap::with_capacity(max_entries),
            ttl: Duration::from_secs(ttl_secs),
            max_entries,
        }
    }

    fn cache_key(model: &str, payload: &Value) -> u64 {
        let messages = payload.get("messages").map(|m| m.to_string()).unwrap_or_default();
        let temperature = payload.get("temperature").map(|t| t.to_string()).unwrap_or_default();
        let top_p = payload.get("top_p").map(|t| t.to_string()).unwrap_or_default();
        let max_tokens = payload.get("max_tokens").map(|t| t.to_string()).unwrap_or_default();
        let stop = payload.get("stop").map(|s| s.to_string()).unwrap_or_default();
        let n = payload.get("n").map(|v| v.to_string()).unwrap_or_default();
        let frequency_penalty = payload.get("frequency_penalty").map(|v| v.to_string()).unwrap_or_default();
        let presence_penalty = payload.get("presence_penalty").map(|v| v.to_string()).unwrap_or_default();

        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        model.hash(&mut hasher);
        messages.hash(&mut hasher);
        temperature.hash(&mut hasher);
        top_p.hash(&mut hasher);
        max_tokens.hash(&mut hasher);
        stop.hash(&mut hasher);
        n.hash(&mut hasher);
        frequency_penalty.hash(&mut hasher);
        presence_penalty.hash(&mut hasher);
        hasher.finish()
    }

    pub fn get(&mut self, model: &str, payload: &Value) -> Option<Value> {
        let key = Self::cache_key(model, payload);
        if let Some(entry) = self.store.get(&key) {
            if entry.created_at.elapsed() < self.ttl {
                return Some(entry.response.clone());
            }
        }
        None
    }

    pub fn set(&mut self, model: &str, payload: &Value, response: Value) {
        if response.get("choices").and_then(|c| c.as_array()).map_or(true, |c| c.is_empty()) {
            return;
        }
        let key = Self::cache_key(model, payload);
        if self.store.len() >= self.max_entries {
            let oldest_key = self.store.iter()
                .min_by_key(|(_, e)| e.created_at)
                .map(|(k, _)| *k);
            if let Some(k) = oldest_key {
                self.store.remove(&k);
            }
        }
        self.store.insert(key, CacheEntry {
            response,
            created_at: Instant::now(),
        });
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.store.len()
    }

    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.store.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_cache_set_get() {
        let mut cache = ResponseCache::new(60, 10);
        let payload = json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}],
            "temperature": 0.7
        });
        let response = json!({
            "choices": [{"message": {"content": "Hi there!"}}]
        });
        cache.set("gpt-4", &payload, response.clone());
        let cached = cache.get("gpt-4", &payload);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap()["choices"][0]["message"]["content"], "Hi there!");
    }

    #[test]
    fn test_cache_miss_different_model() {
        let mut cache = ResponseCache::new(60, 10);
        let payload = json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}]
        });
        let response = json!({"choices": [{"message": {"content": "Hi!"}}]});
        cache.set("gpt-4", &payload, response);
        assert!(cache.get("gpt-3.5", &payload).is_none());
    }

    #[test]
    fn test_cache_miss_different_messages() {
        let mut cache = ResponseCache::new(60, 10);
        let payload1 = json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}]
        });
        let payload2 = json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "world"}]
        });
        cache.set("gpt-4", &payload1, json!({"choices": [{"message": {"content": "Hi!"}}]}));
        assert!(cache.get("gpt-4", &payload2).is_none());
    }

    #[test]
    fn test_cache_ttl_expired() {
        let mut cache = ResponseCache::new(0, 10);
        let payload = json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}]
        });
        cache.set("gpt-4", &payload, json!({"choices": [{"message": {"content": "Hi!"}}]}));
        std::thread::sleep(Duration::from_millis(10));
        assert!(cache.get("gpt-4", &payload).is_none());
    }

    #[test]
    fn test_cache_max_entries() {
        let mut cache = ResponseCache::new(60, 2);
        for i in 0..3 {
            let payload = json!({
                "model": "gpt-4",
                "messages": [{"role": "user", "content": format!("msg{}", i)}]
            });
            cache.set("gpt-4", &payload, json!({"choices": [{"message": {"content": format!("resp{}", i)}}]}));
        }
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn test_cache_empty_response_not_stored() {
        let mut cache = ResponseCache::new(60, 10);
        let payload = json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}]
        });
        cache.set("gpt-4", &payload, json!({"choices": []}));
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn test_cache_clear() {
        let mut cache = ResponseCache::new(60, 10);
        let payload = json!({
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}]
        });
        cache.set("gpt-4", &payload, json!({"choices": [{"message": {"content": "Hi!"}}]}));
        assert_eq!(cache.len(), 1);
        cache.clear();
        assert_eq!(cache.len(), 0);
    }
}
