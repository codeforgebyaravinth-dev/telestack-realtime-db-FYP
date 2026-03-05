use wasm_bindgen::prelude::*;
use xxhash_rust::xxh32::xxh32;
use serde_json::Value;

// ==========================================
// 1. BLOOM FILTER
// ==========================================
#[wasm_bindgen]
pub struct BloomFilter {
    bits: Vec<u8>,
    size: usize,
    hash_count: usize,
}

#[wasm_bindgen]
impl BloomFilter {
    #[wasm_bindgen(constructor)]
    pub fn new(expected_items: usize, false_positive_rate: f64) -> BloomFilter {
        let size = (-(expected_items as f64 * false_positive_rate.ln()) / (f64::ln(2.0).powi(2))).ceil() as usize;
        let hash_count = ((size as f64 / expected_items as f64) * f64::ln(2.0)).ceil() as usize;
        let byte_size = (size as f64 / 8.0).ceil() as usize;
        
        BloomFilter {
            bits: vec![0; byte_size],
            size,
            hash_count,
        }
    }

    fn hash(&self, key: &str, seed: u32) -> usize {
        let hash_val = xxh32(key.as_bytes(), seed);
        (hash_val as usize) % self.size
    }

    #[wasm_bindgen]
    pub fn add(&mut self, key: &str) {
        for i in 0..self.hash_count {
            let index = self.hash(key, i as u32);
            let byte_index = index / 8;
            let bit_index = index % 8;
            self.bits[byte_index] |= 1 << bit_index;
        }
    }

    #[wasm_bindgen]
    pub fn get_bits(&self) -> Vec<u8> {
        self.bits.clone()
    }

    #[wasm_bindgen]
    pub fn from_state(bits: Vec<u8>, size: usize, hash_count: usize) -> BloomFilter {
        BloomFilter {
            bits,
            size,
            hash_count,
        }
    }

    #[wasm_bindgen]
    pub fn get_size(&self) -> usize {
        self.size
    }

    #[wasm_bindgen]
    pub fn get_hash_count(&self) -> usize {
        self.hash_count
    }

    #[wasm_bindgen]
    pub fn has(&self, key: &str) -> bool {
        for i in 0..self.hash_count {
            let index = self.hash(key, i as u32);
            let byte_index = index / 8;
            let bit_index = index % 8;
            if (self.bits[byte_index] & (1 << bit_index)) == 0 {
                return false; 
            }
        }
        true
    }
}

// ==========================================
// 2. CRDT MERGER (JSON Deep Merge)
// ==========================================
#[wasm_bindgen]
pub struct CrdtEngine;

#[wasm_bindgen]
impl CrdtEngine {
    /// Merges two JSON strings. The `incoming` JSON takes precedence over `existing`
    /// but only at the precise leaf node level.
    #[wasm_bindgen]
    pub fn merge_json(existing: &str, incoming: &str) -> String {
        let mut base_val: Value = serde_json::from_str(existing).unwrap_or(Value::Object(serde_json::Map::new()));
        let new_val: Value = serde_json::from_str(incoming).unwrap_or(Value::Object(serde_json::Map::new()));

        CrdtEngine::deep_merge(&mut base_val, new_val);
        base_val.to_string()
    }

    fn deep_merge(a: &mut Value, b: Value) {
        match (a, b) {
            (Value::Object(ref mut a_map), Value::Object(b_map)) => {
                for (k, v) in b_map {
                    // ACSC Semantic Enhancement: If it's a numeric increment, we sum them
                    // Convention: keys starting with "++" are treated as relative increments
                    if k.starts_with("++") && v.is_number() {
                        let actual_key = &k[2..];
                        let increment = v.as_f64().unwrap_or(0.0);
                        let entry = a_map.entry(actual_key.to_string()).or_insert(Value::from(0.0));
                        if let Some(current_val) = entry.as_f64() {
                            *entry = Value::from(current_val + increment);
                        } else {
                            *entry = Value::from(increment);
                        }
                    } else {
                        CrdtEngine::deep_merge(a_map.entry(k).or_insert(Value::Null), v);
                    }
                }
            }
            (a_ref, b_val) => {
                *a_ref = b_val;
            }
        }
    }
}

// ==========================================
// 3. ACT ENGINE (ADAPTIVE CONTENTION TOPOLOGY)
// ==========================================
#[wasm_bindgen]
pub struct ActEngine;

#[wasm_bindgen]
impl ActEngine {
    /// Computes contention score: C = αv + βq + γσ
    #[wasm_bindgen]
    pub fn calculate_score(velocity: f64, queue_depth: u32, variance: f64) -> f64 {
        0.5 * velocity + 0.3 * (queue_depth as f64) + 0.2 * variance
    }

    #[wasm_bindgen]
    pub fn classify(score: f64) -> String {
        if score < 20.0 { "COLD".to_string() }
        else if score < 50.0 { "WARM".to_string() }
        else if score < 100.0 { "HOT".to_string() }
        else { "CRITICAL".to_string() }
    }
}

// ==========================================
// 3.1 ACSC ENGINE (ADAPTIVE CONFLICT-FREE STATE COMPRESSION)
// ==========================================
#[wasm_bindgen]
pub struct AcscEngine;

#[wasm_bindgen]
impl AcscEngine {
    /// Compresses a batch of JSON operations into a single semantic state.
    /// ACSC reduces O(N) ops into O(1) state representation.
    #[wasm_bindgen]
    pub fn compress_batch(json_batch: &str) -> String {
        let ops: Value = serde_json::from_str(json_batch).unwrap_or(Value::Array(vec![]));
        let mut final_state = Value::Object(serde_json::Map::new());

        if let Value::Array(op_list) = ops {
            for op in op_list {
                CrdtEngine::deep_merge(&mut final_state, op);
            }
        }

        final_state.to_string()
    }
}

// ==========================================
// 4. SECURITY RULE AST EVALUATOR
// ==========================================
#[wasm_bindgen]
pub struct SecurityEvaluator;

#[wasm_bindgen]
impl SecurityEvaluator {
    /// Safely evaluates a rule string against a context JSON. No `eval()`.
    /// e.g. rule: "auth.role == 'admin'", context: {"auth":{"role":"admin"}}
    #[wasm_bindgen]
    pub fn evaluate(rule: &str, context_json: &str) -> bool {
        let rule = rule.trim();
        if rule == "true" { return true; }
        if rule == "false" { return false; }
        
        let context: Value = serde_json::from_str(context_json).unwrap_or(Value::Null);

        // Standardize operators for the barebones parser
        let rule_normalized = rule.replace("===", "==").replace("!==", "!=");

        // 1. "auth != null" check
        if rule_normalized == "auth != null" {
            return !context.get("auth").unwrap_or(&Value::Null).is_null();
        }

        // 2. Equality / Inequality
        if rule_normalized.contains("==") || rule_normalized.contains("!=") {
            let is_equality = rule_normalized.contains("==");
            let op = if is_equality { "==" } else { "!=" };
            
            let parts: Vec<&str> = rule_normalized.split(op).collect();
            if parts.len() == 2 {
                let left_path = parts[0].trim();
                let right_val = parts[1].trim().trim_matches('\'').trim_matches('"');
                
                let mut current = &context;
                // Traverse e.g. "auth.role"
                for segment in left_path.split('.') {
                    if let Some(val) = current.get(segment) {
                        current = val;
                    } else {
                        // If path doesn't exist, it's null-ish
                        current = &Value::Null;
                        break;
                    }
                }
                
                let matches = if let Some(s) = current.as_str() {
                    s == right_val
                } else if current.is_null() && (right_val == "null" || right_val.is_empty()) {
                    true
                } else {
                    current.to_string() == right_val
                };

                return if is_equality { matches } else { !matches };
            }
        }

        // Default Deny
        false
    }
    
    /// Advanced Research: Depth-aware permission checking
    #[wasm_bindgen]
    pub fn can_access_at_depth(rule: &str, context_json: &str, current_depth: u32, max_depth: u32) -> bool {
        if current_depth > max_depth { return false; }
        SecurityEvaluator::evaluate(rule, context_json)
    }
}

// ==========================================
// 5. AENS & ADAPTIVE TTL ENGINE
// ==========================================
#[wasm_bindgen]
pub struct AensEngine;

#[wasm_bindgen]
impl AensEngine {
    /// Enhanced AENS Algorithm: Adaptive Threshold Calculation
    /// Incorporates Queue Depth for logarithmic dampening (v2.0)
    #[wasm_bindgen]
    pub fn calculate_threshold(velocity: f64, predictability: f64, queue_depth: u32, base_window: f64) -> f64 {
        let queue_factor = ((queue_depth as f64) + 2.0).ln();
        let threshold = (base_window / velocity.max(1.0)) * (1.0 + predictability.clamp(0.0, 1.0)) * queue_factor;
        threshold.clamp(50.0, 2000.0) // 2000ms is the hard Latency Bound (Lmax)
    }

    /// Research Metric: Stability Index (0.0 - 1.0)
    /// Higher = System is in "Steady State" coalescing.
    /// Lower = System is in "Burst Mode" or "Jittery".
    #[wasm_bindgen]
    pub fn calculate_stability_index(velocity: f64, current_threshold: f64) -> f64 {
        if velocity == 0.0 { return 1.0; }
        let ratio = current_threshold / 500.0; // Normalized against base
        (1.0 / (1.0 + (ratio - 1.0).abs())).clamp(0.0, 1.0)
    }

    /// Predictive Adaptive TTL logic moved to WASM for consistency
    #[wasm_bindgen]
    pub fn calculate_adaptive_ttl(access_count: u32) -> u32 {
        if access_count > 1000 { return 3600; } // Super Hot: 1 hour
        if access_count > 100 { return 600; }   // Warm: 10 minutes
        if access_count > 10 { return 60; }     // Lukewarm: 1 minute
        30                                     // Cold: 30 seconds
    }
}

// ==========================================
// 6. PVC (PREDICTIVE VECTOR CLOCKS)
// ==========================================
#[wasm_bindgen]
pub struct PvcEngine;

#[wasm_bindgen]
impl PvcEngine {
    /// Detects if a new operation's data paths conflict with existing buffered operations.
    /// PVC works by comparing the key-set (path signature) of the new JSON against the buffer.
    /// Returns true if a potential collision (path overlap) is detected.
    #[wasm_bindgen]
    pub fn has_path_conflict(buffer_json: &str, new_patch_json: &str) -> bool {
        let buffer_val: Value = serde_json::from_str(buffer_json).unwrap_or(Value::Null);
        let patch_val: Value = serde_json::from_str(new_patch_json).unwrap_or(Value::Null);

        PvcEngine::check_overlap(&buffer_val, &patch_val)
    }

    fn check_overlap(a: &Value, b: &Value) -> bool {
        match (a, b) {
            (Value::Object(a_map), Value::Object(b_map)) => {
                for (k, v_b) in b_map {
                    if let Some(v_a) = a_map.get(k) {
                        // Key suffix match found: check if it's a nested conflict or a leaf collision
                        if v_a.is_object() && v_b.is_object() {
                            if PvcEngine::check_overlap(v_a, v_b) {
                                return true;
                            }
                        } else {
                            // Leaf level collision detected on same key!
                            return true;
                        }
                    }
                }
                false
            }
            // If either is not an object but they've reached this comparison, 
            // it means the path merged at this level.
            _ => true, 
        }
    }

    /// Generates a unique path signature (Vector Clock Hash) for the given JSON.
    #[wasm_bindgen]
    pub fn get_path_signature(json_content: &str) -> u32 {
        let val: Value = serde_json::from_str(json_content).unwrap_or(Value::Null);
        let keys = PvcEngine::collect_keys(&val, "");
        xxh32(keys.as_bytes(), 42)
    }

    fn collect_keys(val: &Value, prefix: &str) -> String {
        let mut result = String::new();
        if let Value::Object(map) = val {
            for (k, v) in map {
                let full_key = if prefix.is_empty() { k.clone() } else { format!("{}.{}", prefix, k) };
                result.push_str(&full_key);
                result.push_str("|");
                result.push_str(&PvcEngine::collect_keys(v, &full_key));
            }
        }
        result
    }
}
