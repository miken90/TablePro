use async_trait::async_trait;

use crate::error::DriverError;
use crate::types::{ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo};

/// Abstraction over any database backend, implemented by each compiled-in
/// driver crate (`driver-postgres`, `driver-mysql`, ...).
///
/// All async methods run on the host's Tokio runtime — drivers MUST NOT spin
/// up their own runtime. Methods on `&self` allow shared use behind an `Arc`.
#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    /// Open the physical connection using the config supplied at creation time.
    async fn connect(&self) -> Result<(), DriverError>;

    /// Close the physical connection. Best-effort — must not panic.
    fn disconnect(&self);

    /// Verify the connection is alive (lightweight round-trip).
    async fn ping(&self) -> Result<(), DriverError>;

    /// Execute any SQL and return the result set.
    async fn execute(&self, query: &str) -> Result<QueryResult, DriverError>;

    /// List all tables/views in the current database.
    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, DriverError>;

    /// Column metadata for a table, optionally scoped to a schema.
    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, DriverError>;

    /// Index descriptors for a table.
    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, DriverError>;

    /// Foreign-key constraints for a table.
    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, DriverError>;

    /// All databases available on the server.
    async fn fetch_databases(&self) -> Result<Vec<String>, DriverError>;

    /// DDL statement that recreates the given table.
    async fn fetch_ddl(&self, table: &str, schema: Option<&str>) -> Result<String, DriverError>;

    /// Request cancellation of any in-flight query on this driver instance.
    ///
    /// Async because most engines cancel out-of-band: PostgreSQL opens a
    /// second socket to send a cancel request, MySQL issues `KILL QUERY` on a
    /// second connection. Implementations MUST NOT return `Ok(())` unless a
    /// cancellation was really dispatched; engines that cannot cancel return
    /// `DriverError::Unsupported` and advertise
    /// `supportsQueryCancellation: false` in their capability sidecar.
    async fn cancel_query(&self) -> Result<(), DriverError>;

    /// Whether this engine uses named schemas (e.g. PostgreSQL public/private).
    fn supports_schemas(&self) -> bool;

    /// Whether this engine supports multi-statement transactions.
    fn supports_transactions(&self) -> bool;

    /// Stable identifier matching the engine's `db_type` in `ConnectionConfig`.
    fn database_type_id(&self) -> &str;
}
