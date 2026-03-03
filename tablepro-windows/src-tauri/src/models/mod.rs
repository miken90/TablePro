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
