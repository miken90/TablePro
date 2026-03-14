use async_trait::async_trait;

use crate::models::{AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo};

/// Abstraction over any database backend, implemented by PluginDriverAdapter.
///
/// All methods are async to allow non-blocking I/O on the Tokio runtime.
/// The trait is object-safe via `async_trait`.
#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    /// Open the physical connection using the config supplied at creation time.
    async fn connect(&self) -> Result<(), AppError>;

    /// Close the physical connection. Best-effort — must not panic.
    fn disconnect(&self);

    /// Verify the connection is alive (lightweight round-trip).
    async fn ping(&self) -> Result<(), AppError>;

    /// Execute any SQL and return the result set.
    async fn execute(&self, query: &str) -> Result<QueryResult, AppError>;

    /// List all tables/views in the current database.
    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, AppError>;

    /// Column metadata for a table, optionally scoped to a schema.
    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, AppError>;

    /// Index descriptors for a table.
    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, AppError>;

    /// Foreign-key constraints for a table.
    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, AppError>;

    /// All databases available on the server.
    async fn fetch_databases(&self) -> Result<Vec<String>, AppError>;

    /// DDL statement that recreates the given table.
    async fn fetch_ddl(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<String, AppError>;

    /// Request cancellation of any in-flight query on this driver instance.
    fn cancel_query(&self) -> Result<(), AppError>;

    /// Whether this engine uses named schemas (e.g. PostgreSQL public/private).
    fn supports_schemas(&self) -> bool;

    /// Whether this engine supports multi-statement transactions.
    fn supports_transactions(&self) -> bool;

    /// Stable identifier matching the plugin's reported `type_id`.
    fn database_type_id(&self) -> &str;
}
