//! PostgreSQL driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `tokio-postgres`.
//! Shares the host's Tokio runtime via `tokio::runtime::Handle` (no nested
//! runtime — see `plans/reports/spike-postgres-rlib.md`).

mod ops_query;
mod ops_schema;
mod pg_error;

use std::sync::Mutex as StdMutex;
use std::time::Instant;

use async_trait::async_trait;
use tokio::runtime::Handle;
use tokio::sync::Mutex;
use tokio_postgres::{CancelToken, Client, Config};

use driver_common::happy_eyeballs::{race_staggered, resolve_candidates, ATTEMPT_DELAY};
use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

/// Build the TLS connector used for both the query connection and the
/// out-of-band cancel connection, so both negotiate identically.
fn build_tls_connector(ssl_mode: &str) -> Result<postgres_native_tls::MakeTlsConnector, DriverError> {
    let mut builder = native_tls::TlsConnector::builder();
    if ssl_mode == "prefer" || ssl_mode == "require" {
        builder.danger_accept_invalid_certs(true);
        builder.danger_accept_invalid_hostnames(true);
    }
    let tls = builder
        .build()
        .map_err(|e| DriverError::Connection(format!("TLS build error: {e}")))?;
    Ok(postgres_native_tls::MakeTlsConnector::new(tls))
}

/// One address's failure, plus whether a server answered before it.
struct AttemptError {
    error: DriverError,
    /// True when a PostgreSQL server replied and rejected us. Such an answer is
    /// final, so the remaining addresses need not be waited on.
    answered: bool,
}

impl AttemptError {
    fn from_pg(e: tokio_postgres::Error) -> Self {
        Self {
            answered: pg_error::server_answered(&e),
            error: pg_error::pg_conn_error(e),
        }
    }

    fn local(error: DriverError) -> Self {
        Self {
            error,
            answered: false,
        }
    }
}

/// Open one connection to a single already-resolved address.
///
/// The `Connection` half is spawned here so that every attempt resolves to the
/// same `Client` type regardless of whether TLS was negotiated, which is what
/// lets the attempts race against each other.
async fn connect_once(cfg: Config, ssl_mode: String, rt: Handle) -> Result<Client, AttemptError> {
    if ssl_mode == "disable" {
        let (client, conn) = cfg
            .connect(tokio_postgres::NoTls)
            .await
            .map_err(AttemptError::from_pg)?;
        rt.spawn(async move {
            let _ = conn.await;
        });
        Ok(client)
    } else {
        let connector = build_tls_connector(&ssl_mode).map_err(AttemptError::local)?;
        let (client, conn) = cfg
            .connect(connector)
            .await
            .map_err(AttemptError::from_pg)?;
        rt.spawn(async move {
            let _ = conn.await;
        });
        Ok(client)
    }
}

/// PostgreSQL driver instance.
///
/// Holds the connection config and a lazily-established `Client` behind a
/// `tokio::sync::Mutex` (held across awaits during connect/query/etc.).
pub struct PostgresDriver {
    rt: tokio::runtime::Handle,
    config: ConnectionConfig,
    client: Mutex<Option<Client>>,
    /// Cancel token captured at connect time.
    ///
    /// Kept outside the `client` mutex on purpose: that mutex is held for the
    /// whole duration of an in-flight query, so a cancel arriving mid-query
    /// could never acquire it. The token only carries the backend PID and
    /// secret key, so cloning it out of a short-lived std mutex is cheap and
    /// never crosses an await.
    cancel_token: StdMutex<Option<CancelToken>>,
}

impl PostgresDriver {
    /// Build a driver bound to the host runtime. The connection is opened
    /// lazily by `connect()`.
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        Self {
            rt: rt_handle,
            config,
            client: Mutex::new(None),
            cancel_token: StdMutex::new(None),
        }
    }

    /// Snapshot the cancel token without holding the lock across an await.
    fn take_cancel_token(&self) -> Result<CancelToken, DriverError> {
        let guard = self
            .cancel_token
            .lock()
            .map_err(|e| DriverError::Other(format!("Mutex poisoned: {e}")))?;
        guard
            .clone()
            .ok_or_else(|| DriverError::Connection("Not connected".to_string()))
    }

    /// Build a tokio-postgres `Config` from our `ConnectionConfig`.
    fn build_pg_config(&self) -> Config {
        let mut cfg = Config::new();
        cfg.host(&self.config.host);
        cfg.port(self.config.port);
        cfg.user(&self.config.user);
        cfg.password(&self.config.password);
        if !self.config.database.is_empty() {
            cfg.dbname(&self.config.database);
        }
        cfg
    }

}

/// Lock the client mutex and return an error if not connected.
/// Macro avoids HRTB headaches with returning a future that borrows the guard.
macro_rules! with_client {
    ($self:ident, $client:ident => $body:expr) => {{
        let guard = $self.client.lock().await;
        let $client = guard
            .as_ref()
            .ok_or_else(|| DriverError::Connection("Not connected".to_string()))?;
        $body
    }};
}

#[async_trait]
impl DatabaseDriver for PostgresDriver {
    async fn connect(&self) -> Result<(), DriverError> {
        let ssl_mode = self.config.ssl_mode.clone();
        let pg_cfg = self.build_pg_config();
        let rt = self.rt.clone();
        let host = self.config.host.clone();
        let port = self.config.port;

        // Resolve first, then race the addresses. Walking them serially lets a
        // black-holed address (Windows resolves `localhost` to `::1` before
        // `127.0.0.1`, and an IPv4-only listener drops the IPv6 SYN) burn the
        // full ~21 s TCP SYN timeout before the working address is tried.
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
        let outcome = race_staggered(candidates.len(), ATTEMPT_DELAY, &rt, |index| {
            let mut cfg = pg_cfg.clone();
            // `host` stays set for TLS validation; `hostaddr` pins which
            // resolved address this attempt actually dials.
            cfg.hostaddr(candidates[index]);
            connect_once(cfg, ssl_mode.clone(), rt.clone())
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
            ssl_mode = %ssl_mode,
            ok = outcome.as_ref().is_some_and(|r| r.is_ok()),
            "postgres connect"
        );

        let client = outcome
            .ok_or_else(|| {
                DriverError::Connection(format!("Host {host} resolved to no addresses"))
            })?
            .map_err(|attempt| attempt.error)?;

        // Capture the cancel token before the client goes behind the mutex.
        if let Ok(mut guard) = self.cancel_token.lock() {
            *guard = Some(client.cancel_token());
        }
        *self.client.lock().await = Some(client);
        Ok(())
    }

    fn disconnect(&self) {
        // Best-effort: drop client without holding async lock.
        // try_lock should succeed since no concurrent caller holds it across await.
        if let Ok(mut guard) = self.client.try_lock() {
            *guard = None;
        }
        if let Ok(mut guard) = self.cancel_token.lock() {
            *guard = None;
        }
    }

    async fn ping(&self) -> Result<(), DriverError> {
        with_client!(self, c => c.simple_query("SELECT 1")
            .await
            .map(|_| ())
            .map_err(pg_error::pg_query_error))
    }

    async fn execute(&self, query: &str) -> Result<QueryResult, DriverError> {
        with_client!(self, c => ops_query::execute(c, query).await)
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, DriverError> {
        with_client!(self, c => ops_schema::fetch_tables(c).await)
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, DriverError> {
        with_client!(self, c => ops_schema::fetch_columns(c, table, schema).await)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, DriverError> {
        with_client!(self, c => ops_schema::fetch_indexes(c, table, schema).await)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, DriverError> {
        with_client!(self, c => ops_schema::fetch_foreign_keys(c, table, schema).await)
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, DriverError> {
        with_client!(self, c => ops_schema::fetch_databases(c).await)
    }

    async fn fetch_ddl(&self, table: &str, schema: Option<&str>) -> Result<String, DriverError> {
        with_client!(self, c => ops_schema::fetch_ddl(c, table, schema).await)
    }

    async fn cancel_query(&self) -> Result<(), DriverError> {
        // PostgreSQL cancellation is out-of-band: the token opens a fresh
        // connection and sends a CancelRequest carrying the backend PID and
        // secret key. It therefore works while the query connection is busy.
        // The server reports no outcome — an error here means we could not
        // reach the server to ask.
        let token = self.take_cancel_token()?;
        if self.config.ssl_mode == "disable" {
            token
                .cancel_query(tokio_postgres::NoTls)
                .await
                .map_err(pg_error::pg_query_error)
        } else {
            let connector = build_tls_connector(&self.config.ssl_mode)?;
            token
                .cancel_query(connector)
                .await
                .map_err(pg_error::pg_query_error)
        }
    }

    fn supports_schemas(&self) -> bool {
        true
    }

    fn supports_transactions(&self) -> bool {
        true
    }

    fn database_type_id(&self) -> &str {
        "postgres"
    }
}
