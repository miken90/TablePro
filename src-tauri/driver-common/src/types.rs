use serde::{Deserialize, Serialize};

// ── Connection ──────────────────────────────────────────────────────────────

fn default_ssh_port() -> u16 {
    22
}

fn default_ssh_auth_method() -> String {
    "password".to_string()
}

/// Connection configuration shared by all drivers.
///
/// Mirrors the host's `models::ConnectionConfig` so drivers can be invoked
/// without depending on the main crate.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub db_type: String,
    pub ssl_mode: String,
    #[serde(default)]
    pub startup_commands: Option<String>,

    // SSH tunnel — optional, defaults preserved for backward compat.
    #[serde(default)]
    pub ssh_enabled: bool,
    #[serde(default)]
    pub ssh_host: String,
    #[serde(default = "default_ssh_port")]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_user: String,
    #[serde(default = "default_ssh_auth_method")]
    pub ssh_auth_method: String,
    #[serde(default)]
    pub ssh_password: String,
    #[serde(default)]
    pub ssh_key_path: String,
    #[serde(default)]
    pub ssh_key_passphrase: String,
}

// ── Query results ───────────────────────────────────────────────────────────

/// Metadata for a single result-set column.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

/// A typed cell value returned by a driver.
///
/// Drivers should prefer typed variants when the source column type is known;
/// `String` is the fallback for textual rendering and unknown types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum RowValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    String(String),
    Bytes(Vec<u8>),
}

/// Full result set returned from query execution.
///
/// Rows are stored as `Vec<Option<String>>` for IPC compatibility with the
/// existing frontend; richer typed values are tracked separately by drivers
/// that need them (later phases may introduce a typed variant).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<Option<String>>>,
    pub affected_rows: i64,
    pub execution_time_ms: f64,
    #[serde(default)]
    pub truncated: bool,
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

/// A single positional or named parameter for a parameterised query.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryParameter {
    /// Optional name for named-parameter dialects (`@p`, `:p`, `$p`).
    /// `None` indicates positional binding.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub value: RowValue,
}

// ── Schema ──────────────────────────────────────────────────────────────────

/// Basic table/view descriptor from information_schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub schema: Option<String>,
    pub table_type: String,
    pub row_count_estimate: Option<i64>,
}

/// Index descriptor for a table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub index_type: String,
}

/// Foreign-key constraint descriptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub name: String,
    pub column: String,
    pub referenced_table: String,
    pub referenced_column: String,
}

/// Aggregate description of a table: columns, indexes, foreign keys.
///
/// Convenience bundle so callers can request all structural metadata in one
/// driver call when the backend can fetch it cheaply.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableDescription {
    pub table: TableInfo,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
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
        assert!(!r.truncated);
    }

    #[test]
    fn test_row_value_serde() {
        let v = RowValue::Int(42);
        let json = serde_json::to_string(&v).unwrap();
        let back: RowValue = serde_json::from_str(&json).unwrap();
        assert_eq!(v, back);
    }

    #[test]
    fn test_query_parameter_positional() {
        let p = QueryParameter {
            name: None,
            value: RowValue::String("hello".to_string()),
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(!json.contains("\"name\""));
        let back: QueryParameter = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn test_table_description_serde() {
        let td = TableDescription {
            table: TableInfo {
                name: "users".to_string(),
                schema: Some("public".to_string()),
                table_type: "TABLE".to_string(),
                row_count_estimate: Some(10),
            },
            columns: vec![],
            indexes: vec![],
            foreign_keys: vec![],
        };
        let json = serde_json::to_string(&td).unwrap();
        let back: TableDescription = serde_json::from_str(&json).unwrap();
        assert_eq!(back.table.name, "users");
    }

    #[test]
    fn test_connection_config_ssh_defaults() {
        let json = r#"{"host":"h","port":1,"user":"u","password":"","database":"d","dbType":"postgres","sslMode":"prefer"}"#;
        let cfg: ConnectionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.ssh_port, 22);
        assert_eq!(cfg.ssh_auth_method, "password");
        assert!(!cfg.ssh_enabled);
    }
}
