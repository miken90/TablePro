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
use std::time::Instant;

use async_trait::async_trait;
use mysql_async::prelude::Queryable;
use mysql_async::{Conn, OptsBuilder, SslOpts};
use tokio::sync::Mutex;

use driver_common::happy_eyeballs::{race_staggered, resolve_candidates, ATTEMPT_DELAY};
use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

/// One address's failure, plus whether a server answered before it.
struct AttemptError {
    error: DriverError,
    /// True when the MySQL server replied and rejected us. Such an answer is
    /// final, so the remaining addresses need not be waited on.
    answered: bool,
}

impl AttemptError {
    fn from_mysql(e: mysql_async::Error) -> Self {
        Self {
            // `Error::Server` is the server's own error packet: it proves this
            // address reached a real MySQL server.
            answered: matches!(e, mysql_async::Error::Server(_)),
            error: DriverError::Connection(e.to_string()),
        }
    }
}

/// MySQL driver instance.
///
/// Holds the connection config and a lazily-established `Conn` behind a
/// `tokio::sync::Mutex`. `mysql_async::Conn` requires `&mut` access for
/// queries, so the `with_conn!` macro locks mutably.
pub struct MysqlDriver {
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

        let host = self.config.host.clone();
        let port = self.config.port;
        let rt = self.rt.clone();
        let base = self.build_opts();

        // Resolve first, then race the addresses. `mysql_async` hands the
        // hostname to `TcpStream::connect`, which walks the resolved addresses
        // serially, so a black-holed address costs the full TCP SYN timeout
        // before a working one is tried.
        let resolve_started = Instant::now();
        let candidates = resolve_candidates(&host, port)
            .await
            .map_err(|e| DriverError::Connection(format!("Could not resolve host {host}: {e}")))?;
        let resolve_ms = resolve_started.elapsed().as_millis();

        if candidates.is_empty() {
            return Err(DriverError::Connection(format!(
                "Host {host} resolved to no addresses"
            )));
        }

        let attempt_started = Instant::now();
        let outcome = race_staggered(
            candidates.len(),
            ATTEMPT_DELAY,
            &rt,
            |index| {
                // `resolved_ips` pins which address this attempt dials.
                // `ip_or_hostname` is left alone, and that is what supplies the
                // TLS hostname, so the verification posture is unchanged.
                let opts = base.clone().resolved_ips(Some(vec![candidates[index]]));
                async move { Conn::new(opts).await.map_err(AttemptError::from_mysql) }
            },
            |attempt| attempt.answered,
        )
        .await;

        let connect_ms = attempt_started.elapsed().as_millis();
        tracing::info!(
            host = %host,
            port,
            addresses = candidates.len(),
            resolve_ms,
            connect_ms,
            ssl_mode = %self.config.ssl_mode,
            ok = outcome.as_ref().is_some_and(|r| r.is_ok()),
            "mysql connect"
        );

        let conn = outcome
            .ok_or_else(|| {
                DriverError::Connection(format!("Host {host} resolved to no addresses"))
            })?
            .map_err(|attempt| attempt.error)?;

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
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    fn config_for(host: &str, ssl_mode: &str) -> ConnectionConfig {
        ConnectionConfig {
            host: host.to_string(),
            port: 3306,
            user: "u".to_string(),
            password: "p".to_string(),
            database: "d".to_string(),
            db_type: "mysql".to_string(),
            ssl_mode: ssl_mode.to_string(),
            startup_commands: None,
            ssh_enabled: false,
            ssh_host: String::new(),
            ssh_port: 22,
            ssh_user: String::new(),
            ssh_auth_method: "password".to_string(),
            ssh_password: String::new(),
            ssh_key_path: String::new(),
            ssh_key_passphrase: String::new(),
        }
    }

    fn driver_for(host: &str, ssl_mode: &str) -> MysqlDriver {
        MysqlDriver::new(tokio::runtime::Handle::current(), config_for(host, ssl_mode))
    }

    /// Pinning the address must not change what the TLS layer verifies:
    /// `mysql_async` takes its TLS hostname from `ip_or_hostname`, not from
    /// `resolved_ips` (`mysql_async/src/conn/mod.rs:554-557`).
    #[tokio::test]
    async fn pinning_an_address_keeps_the_hostname_for_tls() {
        let driver = driver_for("db.example.com", "verify-full");
        let pinned = driver
            .build_opts()
            .resolved_ips(Some(vec![IpAddr::V4(Ipv4Addr::new(10, 0, 0, 7))]));
        let opts: mysql_async::Opts = pinned.into();

        assert_eq!(opts.ip_or_hostname(), "db.example.com");
        assert_eq!(
            opts.resolved_ips(),
            &Some(vec![IpAddr::V4(Ipv4Addr::new(10, 0, 0, 7))])
        );
        let ssl = opts.ssl_opts().expect("verify-full must use TLS");
        assert!(!ssl.accept_invalid_certs());
        assert!(!ssl.skip_domain_validation());
    }

    /// One attempt per address, each pinned to exactly one address, so no
    /// attempt can fall back to serially walking the rest.
    #[tokio::test]
    async fn each_attempt_is_pinned_to_a_single_address() {
        let driver = driver_for("localhost", "disable");
        let candidates = [
            IpAddr::V6(Ipv6Addr::LOCALHOST),
            IpAddr::V4(Ipv4Addr::LOCALHOST),
        ];

        for candidate in candidates {
            let opts: mysql_async::Opts = driver
                .build_opts()
                .resolved_ips(Some(vec![candidate]))
                .into();
            assert_eq!(opts.resolved_ips(), &Some(vec![candidate]));
            assert_eq!(opts.ip_or_hostname(), "localhost");
        }
    }

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
