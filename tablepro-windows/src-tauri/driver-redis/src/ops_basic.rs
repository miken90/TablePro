//! Shared formatting helpers for Redis `Value` rendering.

use redis::Value;

/// Convert a Redis `Value` into a human-readable string for grid display.
pub fn format_value(value: &Value) -> String {
    match value {
        Value::Nil => "(nil)".to_string(),
        Value::Int(i) => i.to_string(),
        Value::BulkString(bytes) => String::from_utf8_lossy(bytes).to_string(),
        Value::SimpleString(s) => s.clone(),
        Value::Okay => "OK".to_string(),
        Value::Array(arr) => arr
            .iter()
            .enumerate()
            .map(|(i, v)| format!("{}) {}", i + 1, format_value(v)))
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Double(f) => f.to_string(),
        Value::Boolean(b) => b.to_string(),
        Value::Map(map) => map
            .iter()
            .enumerate()
            .map(|(i, (k, v))| format!("{}) {} -> {}", i + 1, format_value(k), format_value(v)))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => format!("{value:?}"),
    }
}
