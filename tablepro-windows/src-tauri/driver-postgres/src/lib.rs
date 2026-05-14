//! PostgreSQL driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `tokio-postgres`.
//! Shares the host's Tokio runtime via `tokio::runtime::Handle` (no nested
//! runtime — see `plans/reports/spike-postgres-rlib.md`).

mod ops_query;
mod ops_schema;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tokio_postgres::{Client, Config};

use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

/// PostgreSQL driver instance.
///
/// Holds the connection config and a lazily-established `Client` behind a
/// `tokio::sync::Mutex` (held across awaits during connect/query/etc.).
pub struct PostgresDriver {
    rt: tokio::runtime::Handle,
    config: ConnectionConfig,
    client: Mutex<Option<Client>>,
}

impl PostgresDriver {
    /// Build a driver bound to the host runtime. The connection is opened
    /// lazily by `connect()`.
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        Self {
            rt: rt_handle,
            config,
            client: Mutex::new(None),
        }
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

        let client = if ssl_mode == "disable" {
            let (client, conn) = pg_cfg
                .connect(tokio_postgres::NoTls)
                .await
                .map_err(|e| DriverError::Connection(e.to_string()))?;
            rt.spawn(async move {
                let _ = conn.await;
            });
            client
        } else {
            let mut builder = native_tls::TlsConnector::builder();
            if ssl_mode == "prefer" || ssl_mode == "require" {
                builder.danger_accept_invalid_certs(true);
                builder.danger_accept_invalid_hostnames(true);
            }
            let tls = builder
                .build()
                .map_err(|e| DriverError::Connection(format!("TLS build error: {e}")))?;
            let connector = postgres_native_tls::MakeTlsConnector::new(tls);
            let (client, conn) = pg_cfg
                .connect(connector)
                .await
                .map_err(|e| DriverError::Connection(e.to_string()))?;
            rt.spawn(async move {
                let _ = conn.await;
            });
            client
        };

        *self.client.lock().await = Some(client);
        Ok(())
    }

    fn disconnect(&self) {
        // Best-effort: drop client without holding async lock.
        // try_lock should succeed since no concurrent caller holds it across await.
        if let Ok(mut guard) = self.client.try_lock() {
            *guard = None;
        }
    }

    async fn ping(&self) -> Result<(), DriverError> {
        with_client!(self, c => c.simple_query("SELECT 1")
            .await
            .map(|_| ())
            .map_err(|e| DriverError::Query(e.to_string())))
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

    fn cancel_query(&self) -> Result<(), DriverError> {
        // tokio-postgres exposes `Client::cancel_token()` but it requires
        // re-connecting with the cancel token; not wired in this phase.
        Err(DriverError::Unsupported(
            "Cancel not supported in this version".to_string(),
        ))
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
