//! MySQL/MariaDB driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `mysql_async`.
//! Shares the host's Tokio runtime via `tokio::runtime::Handle` (no nested
//! runtime — see `plans/reports/spike-postgres-rlib.md`).

mod query;
mod schema_indexes;
mod schema_tables;

use async_trait::async_trait;
use mysql_async::prelude::Queryable;
use mysql_async::{Conn, OptsBuilder, SslOpts};
use tokio::sync::Mutex;

use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

/// MySQL driver instance.
///
/// Holds the connection config and a lazily-established `Conn` behind a
/// `tokio::sync::Mutex`. `mysql_async::Conn` requires `&mut` access for
/// queries, so the `with_conn!` macro locks mutably.
pub struct MysqlDriver {
    #[allow(dead_code)]
    rt: tokio::runtime::Handle,
    pub(crate) config: ConnectionConfig,
    conn: Mutex<Option<Conn>>,
}

impl MysqlDriver {
    /// Build a driver bound to the host runtime. The connection is opened
    /// lazily by `connect()`.
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        Self {
            rt: rt_handle,
            config,
            conn: Mutex::new(None),
        }
    }

    fn build_opts(&self) -> OptsBuilder {
        let mut builder = OptsBuilder::default()
            .ip_or_hostname(self.config.host.clone())
            .tcp_port(self.config.port)
            .user(Some(self.config.user.clone()))
            .pass(Some(self.config.password.clone()))
            .db_name(Some(self.config.database.clone()));

        match self.config.ssl_mode.as_str() {
            "require" | "verify-ca" | "verify-full" => {
                builder = builder.ssl_opts(SslOpts::default());
            }
            _ => {}
        }

        builder
    }
}

/// Lock the conn mutex mutably and return an error if not connected.
/// Macro avoids HRTB headaches with returning a future that borrows the guard.
/// `mysql_async::Conn` requires `&mut` for query operations, hence `as_mut()`.
macro_rules! with_conn {
    ($self:ident, $conn:ident => $body:expr) => {{
        let mut guard = $self.conn.lock().await;
        let $conn = guard
            .as_mut()
            .ok_or_else(|| DriverError::Connection("Not connected".to_string()))?;
        $body
    }};
}

#[async_trait]
impl DatabaseDriver for MysqlDriver {
    async fn connect(&self) -> Result<(), DriverError> {
        let opts = self.build_opts();
        let conn = Conn::new(opts)
            .await
            .map_err(|e| DriverError::Connection(e.to_string()))?;
        *self.conn.lock().await = Some(conn);
        Ok(())
    }

    fn disconnect(&self) {
        // Best-effort: drop conn without holding async lock. mysql_async sends
        // QUIT on drop, so this cleanly closes the connection.
        if let Ok(mut guard) = self.conn.try_lock() {
            *guard = None;
        }
    }

    async fn ping(&self) -> Result<(), DriverError> {
        with_conn!(self, c => c.ping().await.map_err(|e| DriverError::Query(e.to_string())))
    }

    async fn execute(&self, sql: &str) -> Result<QueryResult, DriverError> {
        with_conn!(self, c => query::execute(c, sql).await)
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, DriverError> {
        with_conn!(self, c => schema_tables::fetch_tables(c).await)
    }

    async fn fetch_columns(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, DriverError> {
        with_conn!(self, c => schema_tables::fetch_columns(c, table).await)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, DriverError> {
        with_conn!(self, c => schema_indexes::fetch_indexes(c, table).await)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, DriverError> {
        let database = self.config.database.clone();
        with_conn!(self, c => schema_indexes::fetch_foreign_keys(c, table, &database).await)
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, DriverError> {
        with_conn!(self, c => schema_tables::fetch_databases(c).await)
    }

    async fn fetch_ddl(&self, table: &str, _schema: Option<&str>) -> Result<String, DriverError> {
        with_conn!(self, c => schema_tables::fetch_ddl(c, table).await)
    }

    fn cancel_query(&self) -> Result<(), DriverError> {
        // mysql_async does not expose a server-side KILL QUERY hook on the
        // active connection; rely on connection timeouts. Matches old behavior
        // which returned success without doing anything.
        Err(DriverError::Unsupported(
            "Cancel not supported in this version".to_string(),
        ))
    }

    fn supports_schemas(&self) -> bool {
        false
    }

    fn supports_transactions(&self) -> bool {
        true
    }

    fn database_type_id(&self) -> &str {
        "mysql"
    }
}
