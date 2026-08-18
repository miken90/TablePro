//! MySQL/MariaDB driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `mysql_async`.
//! Shares the host's Tokio runtime via `tokio::runtime::Handle` (no nested
//! runtime — see `plans/reports/spike-postgres-rlib.md`).

mod cancel;
mod query;
mod schema_indexes;
mod schema_tables;

use std::sync::atomic::{AtomicU32, Ordering};

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
    /// Server-side id of the live connection, captured at connect time.
    ///
    /// Kept outside the `conn` mutex because that mutex is held for the whole
    /// duration of an in-flight query — a cancel arriving mid-query could
    /// never read the id from behind it. `0` means "not connected"; MySQL
    /// connection ids start at 1.
    connection_id: AtomicU32,
}

impl MysqlDriver {
    /// Build a driver bound to the host runtime. The connection is opened
    /// lazily by `connect()`.
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        Self {
            rt: rt_handle,
            config,
            conn: Mutex::new(None),
            connection_id: AtomicU32::new(0),
        }
    }

    fn build_opts(&self) -> OptsBuilder {
        let mut builder = OptsBuilder::default()
            .ip_or_hostname(self.config.host.clone())
            .tcp_port(self.config.port)
            .user(Some(self.config.user.clone()))
            .pass(Some(self.config.password.clone()))
            .db_name(Some(self.config.database.clone()));

        if let Some(ssl) = Self::ssl_opts_for(&self.config.ssl_mode) {
            builder = builder.ssl_opts(ssl);
        }

        builder
    }

    /// Map an `ssl_mode` to `mysql_async` TLS options, following MySQL's own
    /// definitions of the modes:
    ///
    /// - `require` — encrypt the connection, do not validate the server
    ///   certificate. Self-hosted servers normally present a private or
    ///   auto-generated certificate; `mysql_async` validates against the
    ///   compiled-in Mozilla root bundle only, so validating here would make
    ///   the mode unusable rather than safer.
    /// - `verify-ca` — validate the certificate chain, ignore the hostname.
    /// - `verify-full` — validate chain and hostname.
    /// - anything else — no TLS.
    fn ssl_opts_for(ssl_mode: &str) -> Option<SslOpts> {
        match ssl_mode {
            "require" => Some(
                SslOpts::default()
                    .with_danger_accept_invalid_certs(true)
                    .with_danger_skip_domain_validation(true),
            ),
            "verify-ca" => Some(SslOpts::default().with_danger_skip_domain_validation(true)),
            "verify-full" => Some(SslOpts::default()),
            _ => None,
        }
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
        // mysql_async speaks TLS through rustls; without an installed crypto
        // provider the handshake panics instead of returning an error.
        driver_common::ensure_crypto_provider();
        let opts = self.build_opts();
        let conn = Conn::new(opts)
            .await
            .map_err(|e| DriverError::Connection(e.to_string()))?;
        self.connection_id.store(conn.id(), Ordering::SeqCst);
        *self.conn.lock().await = Some(conn);
        Ok(())
    }

    fn disconnect(&self) {
        // Best-effort: drop conn without holding async lock. mysql_async sends
        // QUIT on drop, so this cleanly closes the connection.
        if let Ok(mut guard) = self.conn.try_lock() {
            *guard = None;
        }
        self.connection_id.store(0, Ordering::SeqCst);
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

    async fn cancel_query(&self) -> Result<(), DriverError> {
        let connection_id = self.connection_id.load(Ordering::SeqCst);
        if connection_id == 0 {
            return Err(DriverError::Connection("Not connected".to_string()));
        }
        cancel::kill_query(self.build_opts(), connection_id).await
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssl_mode_disable_uses_no_tls() {
        assert!(MysqlDriver::ssl_opts_for("disable").is_none());
        assert!(MysqlDriver::ssl_opts_for("prefer").is_none());
        assert!(MysqlDriver::ssl_opts_for("").is_none());
    }

    #[test]
    fn ssl_mode_require_encrypts_without_validating() {
        let opts = MysqlDriver::ssl_opts_for("require").expect("require must use TLS");
        assert!(opts.accept_invalid_certs());
        assert!(opts.skip_domain_validation());
    }

    #[test]
    fn ssl_mode_verify_ca_validates_the_chain_but_not_the_hostname() {
        let opts = MysqlDriver::ssl_opts_for("verify-ca").expect("verify-ca must use TLS");
        assert!(!opts.accept_invalid_certs());
        assert!(opts.skip_domain_validation());
    }

    #[test]
    fn ssl_mode_verify_full_validates_everything() {
        let opts = MysqlDriver::ssl_opts_for("verify-full").expect("verify-full must use TLS");
        assert!(!opts.accept_invalid_certs());
        assert!(!opts.skip_domain_validation());
    }
}
