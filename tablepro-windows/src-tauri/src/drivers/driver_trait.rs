//! Host-side `DatabaseDriver` trait.
//!
//! Implemented by [`HostDriverAdapter`](crate::drivers::adapter::HostDriverAdapter)
//! which wraps a `driver_common::DatabaseDriver`. The host trait works with
//! `AppError` and `crate::models` types so the rest of the app stays
//! decoupled from `driver_common`.

use async_trait::async_trait;

use crate::models::{AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo};

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    async fn connect(&self) -> Result<(), AppError>;
    fn disconnect(&self);
    async fn ping(&self) -> Result<(), AppError>;
    async fn execute(&self, query: &str) -> Result<QueryResult, AppError>;
    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, AppError>;
    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, AppError>;
    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, AppError>;
    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, AppError>;
    async fn fetch_databases(&self) -> Result<Vec<String>, AppError>;
    async fn fetch_ddl(&self, table: &str, schema: Option<&str>) -> Result<String, AppError>;
    /// Request cancellation of the in-flight query. Async because engines
    /// cancel out-of-band (PostgreSQL cancel request, MySQL `KILL QUERY`).
    async fn cancel_query(&self) -> Result<(), AppError>;
    fn supports_schemas(&self) -> bool;
    fn supports_transactions(&self) -> bool;
    fn database_type_id(&self) -> &str;
}

/// Metadata describing a compiled-in engine driver.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMetadataInfo {
    pub type_id: String,
    pub display_name: String,
    pub default_port: u16,
    pub capabilities: crate::models::DriverCapabilities,
}
