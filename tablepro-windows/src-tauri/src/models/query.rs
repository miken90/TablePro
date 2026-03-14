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
}

impl QueryResult {
    pub fn empty() -> Self {
        Self {
            columns: vec![],
            rows: vec![],
            affected_rows: 0,
            execution_time_ms: 0.0,
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
        };
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: QueryResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.columns.len(), 1);
        assert_eq!(deserialized.rows.len(), 2);
        assert_eq!(deserialized.rows[1][0], None);
    }
}
