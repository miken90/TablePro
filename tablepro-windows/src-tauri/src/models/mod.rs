//! Shared data structures for the TablePro database layer.

use serde::{Deserialize, Serialize};

// Database type enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    Mysql,
    Mariadb,
    Postgresql,
    Sqlite,
    Mongodb,
}

impl DatabaseType {
    pub fn default_port(&self) -> u16 {
        match self {
            Self::Mysql | Self::Mariadb => 3306,
            Self::Postgresql => 5432,
            Self::Sqlite => 0,
            Self::Mongodb => 27017,
        }
    }

    /// Quote an identifier (table/column name) for this database type.
    pub fn quote_identifier(&self, name: &str) -> String {
        match self {
            Self::Mysql | Self::Mariadb => format!("`{}`", name.replace('`', "``")),
            Self::Postgresql => format!("\"{}\"", name.replace('"', "\"\"")),
            Self::Sqlite => format!("\"{}\"", name.replace('"', "\"\"")),
            Self::Mongodb => name.to_string(),
        }
    }
}

// Connection status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", content = "message")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

impl ConnectionStatus {
    pub fn is_connected(&self) -> bool {
        matches!(self, Self::Connected)
    }
}

// SSL configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SslConfig {
    pub enabled: bool,
    pub ca_cert_path: Option<String>,
    pub client_cert_path: Option<String>,
    pub client_key_path: Option<String>,
    pub verify_server_cert: bool,
}

// SSH tunnel configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SshConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub private_key_path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SshAuthMethod {
    #[default]
    Password,
    PrivateKey,
}

// Connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub db_type: DatabaseType,
    pub ssl_config: SslConfig,
    pub ssh_config: SshConfig,
    pub is_read_only: bool,
    pub color: Option<String>,
}

// Column type enum (semantic type for display/formatting)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "raw_type")]
pub enum ColumnType {
    Text(Option<String>),
    Integer(Option<String>),
    Decimal(Option<String>),
    Date(Option<String>),
    Timestamp(Option<String>),
    DateTime(Option<String>),
    Boolean(Option<String>),
    Blob(Option<String>),
    Json(Option<String>),
    Enum {
        raw_type: Option<String>,
        values: Option<Vec<String>>,
    },
    Set {
        raw_type: Option<String>,
        values: Option<Vec<String>>,
    },
}

impl ColumnType {
    pub fn display_name(&self) -> &str {
        match self {
            Self::Text(_) => "Text",
            Self::Integer(_) => "Integer",
            Self::Decimal(_) => "Decimal",
            Self::Date(_) => "Date",
            Self::Timestamp(_) => "Timestamp",
            Self::DateTime(_) => "DateTime",
            Self::Boolean(_) => "Boolean",
            Self::Blob(_) => "Binary",
            Self::Json(_) => "JSON",
            Self::Enum { .. } => "Enum",
            Self::Set { .. } => "Set",
        }
    }

    pub fn is_json(&self) -> bool {
        matches!(self, Self::Json(_))
    }

    pub fn is_date(&self) -> bool {
        matches!(self, Self::Date(_) | Self::Timestamp(_) | Self::DateTime(_))
    }
}

// Query result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub column_types: Vec<ColumnType>,
    pub rows: Vec<Vec<Option<String>>>,
    pub rows_affected: i64,
    pub execution_time_ms: f64,
    pub error: Option<String>,
    pub is_truncated: bool,
}

impl Default for QueryResult {
    fn default() -> Self {
        Self {
            columns: Vec::new(),
            column_types: Vec::new(),
            rows: Vec::new(),
            rows_affected: 0,
            execution_time_ms: 0.0,
            error: None,
            is_truncated: false,
        }
    }
}

// Table info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub table_type: TableType,
    pub row_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TableType {
    Table,
    View,
    SystemTable,
}

// Column info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
    pub extra: Option<String>,
    pub charset: Option<String>,
    pub collation: Option<String>,
    pub comment: Option<String>,
}

// Index info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
    pub index_type: String,
}

// Foreign key info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyInfo {
    pub name: String,
    pub column: String,
    pub referenced_table: String,
    pub referenced_column: String,
    pub on_delete: String,
    pub on_update: String,
}

// Table metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableMetadata {
    pub table_name: String,
    pub data_size: Option<i64>,
    pub index_size: Option<i64>,
    pub total_size: Option<i64>,
    pub avg_row_length: Option<i64>,
    pub row_count: Option<i64>,
    pub comment: Option<String>,
    pub engine: Option<String>,
    pub collation: Option<String>,
    pub create_time: Option<String>,
    pub update_time: Option<String>,
}

// Database metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseMetadata {
    pub name: String,
    pub table_count: Option<i32>,
    pub size_bytes: Option<i64>,
    pub is_system_database: bool,
}

// Database error
#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
pub enum DatabaseError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Query failed: {0}")]
    QueryFailed(String),
    #[error("Invalid credentials")]
    InvalidCredentials,
    #[error("File not found: {0}")]
    FileNotFound(String),
    #[error("Not connected")]
    NotConnected,
    #[error("Unsupported operation")]
    UnsupportedOperation,
}

#[cfg(test)]
mod tests {
    use super::*;

    // DatabaseType::default_port

    #[test]
    fn default_port_mysql() {
        assert_eq!(DatabaseType::Mysql.default_port(), 3306);
    }

    #[test]
    fn default_port_mariadb() {
        assert_eq!(DatabaseType::Mariadb.default_port(), 3306);
    }

    #[test]
    fn default_port_postgresql() {
        assert_eq!(DatabaseType::Postgresql.default_port(), 5432);
    }

    #[test]
    fn default_port_sqlite() {
        assert_eq!(DatabaseType::Sqlite.default_port(), 0);
    }

    #[test]
    fn default_port_mongodb() {
        assert_eq!(DatabaseType::Mongodb.default_port(), 27017);
    }

    // DatabaseType::quote_identifier

    #[test]
    fn quote_identifier_mysql_simple() {
        assert_eq!(DatabaseType::Mysql.quote_identifier("users"), "`users`");
    }

    #[test]
    fn quote_identifier_mysql_escapes_backtick() {
        assert_eq!(DatabaseType::Mysql.quote_identifier("col`name"), "`col``name`");
    }

    #[test]
    fn quote_identifier_mariadb_uses_backticks() {
        assert_eq!(DatabaseType::Mariadb.quote_identifier("t"), "`t`");
    }

    #[test]
    fn quote_identifier_postgresql_simple() {
        assert_eq!(DatabaseType::Postgresql.quote_identifier("users"), "\"users\"");
    }

    #[test]
    fn quote_identifier_postgresql_escapes_double_quote() {
        assert_eq!(
            DatabaseType::Postgresql.quote_identifier("col\"name"),
            "\"col\"\"name\""
        );
    }

    #[test]
    fn quote_identifier_sqlite_uses_double_quotes() {
        assert_eq!(DatabaseType::Sqlite.quote_identifier("tbl"), "\"tbl\"");
    }

    #[test]
    fn quote_identifier_mongodb_returns_raw() {
        assert_eq!(DatabaseType::Mongodb.quote_identifier("collection"), "collection");
    }

    // ConnectionStatus::is_connected

    #[test]
    fn is_connected_true_for_connected() {
        assert!(ConnectionStatus::Connected.is_connected());
    }

    #[test]
    fn is_connected_false_for_disconnected() {
        assert!(!ConnectionStatus::Disconnected.is_connected());
    }

    #[test]
    fn is_connected_false_for_connecting() {
        assert!(!ConnectionStatus::Connecting.is_connected());
    }

    #[test]
    fn is_connected_false_for_error() {
        assert!(!ConnectionStatus::Error("timeout".into()).is_connected());
    }

    // ColumnType::display_name

    #[test]
    fn display_name_all_variants() {
        let cases: Vec<(ColumnType, &str)> = vec![
            (ColumnType::Text(None), "Text"),
            (ColumnType::Integer(None), "Integer"),
            (ColumnType::Decimal(None), "Decimal"),
            (ColumnType::Date(None), "Date"),
            (ColumnType::Timestamp(None), "Timestamp"),
            (ColumnType::DateTime(None), "DateTime"),
            (ColumnType::Boolean(None), "Boolean"),
            (ColumnType::Blob(None), "Binary"),
            (ColumnType::Json(None), "JSON"),
            (ColumnType::Enum { raw_type: None, values: None }, "Enum"),
            (ColumnType::Set { raw_type: None, values: None }, "Set"),
        ];
        for (col_type, expected) in cases {
            assert_eq!(col_type.display_name(), expected, "failed for {:?}", col_type);
        }
    }

    // ColumnType::is_json

    #[test]
    fn is_json_true_for_json() {
        assert!(ColumnType::Json(Some("json".into())).is_json());
    }

    #[test]
    fn is_json_false_for_text() {
        assert!(!ColumnType::Text(None).is_json());
    }

    // ColumnType::is_date

    #[test]
    fn is_date_true_for_date_variants() {
        assert!(ColumnType::Date(None).is_date());
        assert!(ColumnType::Timestamp(None).is_date());
        assert!(ColumnType::DateTime(None).is_date());
    }

    #[test]
    fn is_date_false_for_non_date() {
        assert!(!ColumnType::Text(None).is_date());
        assert!(!ColumnType::Integer(None).is_date());
    }

    // QueryResult::default

    #[test]
    fn query_result_default() {
        let qr = QueryResult::default();
        assert!(qr.columns.is_empty());
        assert!(qr.column_types.is_empty());
        assert!(qr.rows.is_empty());
        assert_eq!(qr.rows_affected, 0);
        assert_eq!(qr.execution_time_ms, 0.0);
        assert!(qr.error.is_none());
        assert!(!qr.is_truncated);
    }

    // Serde round-trip: DatabaseType

    #[test]
    fn serde_database_type_roundtrip() {
        let variants = vec![
            (DatabaseType::Mysql, "\"mysql\""),
            (DatabaseType::Mariadb, "\"mariadb\""),
            (DatabaseType::Postgresql, "\"postgresql\""),
            (DatabaseType::Sqlite, "\"sqlite\""),
            (DatabaseType::Mongodb, "\"mongodb\""),
        ];
        for (variant, expected_json) in variants {
            let json = serde_json::to_string(&variant).unwrap();
            assert_eq!(json, expected_json, "serialize {:?}", variant);
            let deserialized: DatabaseType = serde_json::from_str(&json).unwrap();
            assert_eq!(deserialized, variant, "deserialize {}", json);
        }
    }

    // Serde round-trip: ConnectionStatus (tagged enum)

    #[test]
    fn serde_connection_status_connected() {
        let status = ConnectionStatus::Connected;
        let json = serde_json::to_string(&status).unwrap();
        let deserialized: ConnectionStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, status);
    }

    #[test]
    fn serde_connection_status_error_with_message() {
        let status = ConnectionStatus::Error("db down".into());
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"status\":\"Error\""));
        assert!(json.contains("\"message\":\"db down\""));
        let deserialized: ConnectionStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, status);
    }

    #[test]
    fn serde_connection_status_disconnected() {
        let status = ConnectionStatus::Disconnected;
        let json = serde_json::to_string(&status).unwrap();
        let deserialized: ConnectionStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, status);
    }
}
