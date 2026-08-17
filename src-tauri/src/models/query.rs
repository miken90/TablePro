use serde::{Deserialize, Serialize};

/// Metadata for a single result-set column.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

/// Full result set returned from query execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    /// Each row is a vec of optional string-serialised values.
    pub rows: Vec<Vec<Option<String>>>,
    pub affected_rows: i64,
    pub execution_time_ms: f64,
    /// True when the result was truncated to fit within IPC payload limits.
    #[serde(default)]
    pub truncated: bool,
    /// Original row count before truncation (only set when `truncated` is true).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_row_count: Option<usize>,
}

impl QueryResult {
    pub fn empty() -> Self {
        Self {
            columns: vec![],
            rows: vec![],
            affected_rows: 0,
            execution_time_ms: 0.0,
            truncated: false,
            total_row_count: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_result_empty() {
        let r = QueryResult::empty();
        assert!(r.columns.is_empty());
        assert!(r.rows.is_empty());
        assert_eq!(r.affected_rows, 0);
        assert_eq!(r.execution_time_ms, 0.0);
        assert!(!r.truncated);
        assert!(r.total_row_count.is_none());
    }

    #[test]
    fn test_column_info_serde_round_trip() {
        let col = ColumnInfo {
            name: "id".to_string(),
            type_name: "INTEGER".to_string(),
            nullable: false,
            is_primary_key: true,
        };
        let json = serde_json::to_string(&col).unwrap();
        let deserialized: ColumnInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "id");
        assert!(deserialized.is_primary_key);
        assert!(!deserialized.nullable);
    }

    #[test]
    fn test_query_result_serde_round_trip() {
        let result = QueryResult {
            columns: vec![ColumnInfo {
                name: "name".to_string(),
                type_name: "TEXT".to_string(),
                nullable: true,
                is_primary_key: false,
            }],
            rows: vec![vec![Some("Alice".to_string())], vec![None]],
            affected_rows: 2,
            execution_time_ms: 12.5,
            truncated: false,
            total_row_count: None,
        };
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: QueryResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.columns.len(), 1);
        assert_eq!(deserialized.rows.len(), 2);
        assert_eq!(deserialized.rows[1][0], None);
        assert!(!deserialized.truncated);
        assert!(deserialized.total_row_count.is_none());
    }

    #[test]
    fn test_query_result_truncated_serde() {
        let result = QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: 0,
            execution_time_ms: 1.0,
            truncated: true,
            total_row_count: Some(100_000),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"truncated\":true"));
        assert!(json.contains("\"totalRowCount\":100000"));
        let deserialized: QueryResult = serde_json::from_str(&json).unwrap();
        assert!(deserialized.truncated);
        assert_eq!(deserialized.total_row_count, Some(100_000));
    }

    #[test]
    fn test_query_result_backwards_compat_no_truncated_field() {
        // Old JSON without truncated/totalRowCount should deserialize with defaults
        let json = r#"{"columns":[],"rows":[],"affectedRows":0,"executionTimeMs":0.0}"#;
        let result: QueryResult = serde_json::from_str(json).unwrap();
        assert!(!result.truncated);
        assert!(result.total_row_count.is_none());
    }
}
