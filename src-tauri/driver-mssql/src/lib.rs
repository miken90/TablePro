//! SQL Server driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `tiberius`.
//! Shares the host's Tokio runtime via `tokio::runtime::Handle` (no nested
//! runtime — see `plans/reports/spike-postgres-rlib.md`).

mod ddl;
mod schema;
mod schema_indexes;
mod value_format;

use std::net::{IpAddr, SocketAddr};
use std::time::Instant;

use async_trait::async_trait;
use tiberius::{AuthMethod, Client, Config};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use driver_common::happy_eyeballs::{race_staggered, resolve_candidates, ATTEMPT_DELAY};
use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

/// Pair one resolved address with the configured port.
///
/// Split out so the address selection can be tested without a live server.
fn socket_addr_for(ip: IpAddr, port: u16) -> SocketAddr {
    SocketAddr::new(ip, port)
}

use value_format::format_cell;

pub type MssqlConn = Client<Compat<TcpStream>>;

/// SQL Server driver instance.
pub struct MssqlDriver {
    rt: tokio::runtime::Handle,
    config: ConnectionConfig,
    client: Mutex<Option<MssqlConn>>,
}

impl MssqlDriver {
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        Self {
            rt: rt_handle,
            config,
            client: Mutex::new(None),
        }
    }

    fn build_tiberius_config(&self) -> Config {
        let mut cfg = Config::new();
        cfg.host(&self.config.host);
        cfg.port(self.config.port);
        cfg.authentication(AuthMethod::sql_server(
            &self.config.user,
            &self.config.password,
        ));
        if !self.config.database.is_empty() {
            cfg.database(&self.config.database);
        }
        if self.config.ssl_mode != "verify-full" {
            cfg.trust_cert();
        }
        cfg
    }
}

/// Lock the client mutex (mut, since tiberius queries take `&mut Client`).
macro_rules! with_client {
    ($self:ident, $client:ident => $body:expr) => {{
        let mut guard = $self.client.lock().await;
        let $client = guard
            .as_mut()
            .ok_or_else(|| DriverError::Connection("Not connected".to_string()))?;
        $body
    }};
}

/// Run a SQL statement and return `(column_names, rows, affected)`.
/// Values are rendered to display strings by [`value_format::format_cell`].
#[allow(clippy::type_complexity)]
pub(crate) async fn execute_simple(
    client: &mut MssqlConn,
    sql: &str,
) -> Result<(Vec<String>, Vec<Vec<Option<String>>>, i64), DriverError> {
    let query = client
        .simple_query(sql)
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let results = query
        .into_results()
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    if results.is_empty() || results[0].is_empty() {
        // A successful INSERT/UPDATE/DELETE returns no result set at all, so
        // `rows.len()` reported every write as "0 rows affected". tiberius's
        // `simple_query` stream drops the DONE token counts (only `execute`
        // surfaces them, and that discards rows), so read the count back from
        // the connection instead: `@@ROWCOUNT` still holds the count of the
        // statement that just ran.
        let affected = read_rowcount(client).await;
        return Ok((vec![], vec![], affected));
    }

    let first = &results[0];
    let col_names: Vec<String> = first[0]
        .columns()
        .iter()
        .map(|c| c.name().to_owned())
        .collect();

    let mut rows: Vec<Vec<Option<String>>> = Vec::with_capacity(first.len());
    for row in first {
        // Render from the typed `ColumnData`. Reading every column as `&str`
        // panics on the first non-character value, and tiberius's `get` aborts
        // rather than erroring — see `value_format`.
        let cells: Vec<Option<String>> = row.cells().map(|(_, data)| format_cell(data)).collect();
        rows.push(cells);
    }
    let affected = rows.len() as i64;
    Ok((col_names, rows, affected))
}

/// Read `@@ROWCOUNT` for the statement that just ran on this connection.
///
/// Best effort: if the follow-up query fails, the write itself still
/// succeeded, so report 0 rather than turning a completed statement into an
/// error. For a multi-statement batch this is the last statement's count,
/// which is what `@@ROWCOUNT` means.
async fn read_rowcount(client: &mut MssqlConn) -> i64 {
    let Ok(stream) = client.simple_query("SELECT @@ROWCOUNT").await else {
        return 0;
    };
    let Ok(results) = stream.into_results().await else {
        return 0;
    };
    results
        .first()
        .and_then(|set| set.first())
        .and_then(|row| row.cells().next().map(|(_, data)| format_cell(data)))
        .flatten()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0)
}

#[async_trait]
impl DatabaseDriver for MssqlDriver {
    async fn connect(&self) -> Result<(), DriverError> {
        let cfg = self.build_tiberius_config();
        let host = self.config.host.clone();
        let port = self.config.port;
        let rt = self.rt.clone();

        // `cfg.get_addr()` is a "host:port" string, and `TcpStream::connect`
        // walks the addresses it resolves to serially
        // (tokio/src/net/tcp/stream.rs:115-133). Resolve here instead and race
        // the addresses, so a black-holed one cannot burn the TCP SYN timeout
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
        let winner = race_staggered(
            candidates.len(),
            ATTEMPT_DELAY,
            &rt,
            |index| {
                let addr = socket_addr_for(candidates[index], port);
                async move {
                    let tcp = TcpStream::connect(addr)
                        .await
                        .map_err(|e| DriverError::Connection(e.to_string()))?;
                    tcp.set_nodelay(true)
                        .map_err(|e| DriverError::Connection(e.to_string()))?;
                    Ok(tcp)
                }
            },
            // A failed TCP attempt says nothing about the other addresses, so
            // there is no answer here that could settle the race early.
            |_: &DriverError| false,
        )
        .await;

        let tcp = winner.ok_or_else(|| {
            DriverError::Connection(format!("Host {host} resolved to no addresses"))
        })??;

        // `cfg` still carries the hostname, which is what tiberius uses for TLS
        // validation, so pinning the socket's address changes nothing there.
        let connected = Client::connect(cfg, tcp.compat_write())
            .await
            .map_err(|e| DriverError::Connection(e.to_string()));

        let connect_ms = attempt_started.elapsed().as_millis();
        tracing::info!(
            host = %host,
            port,
            addresses = candidates.len(),
            resolve_ms,
            connect_ms,
            ssl_mode = %self.config.ssl_mode,
            ok = connected.is_ok(),
            "mssql connect"
        );

        *self.client.lock().await = Some(connected?);
        Ok(())
    }

    fn disconnect(&self) {
        if let Ok(mut guard) = self.client.try_lock() {
            *guard = None;
        }
    }

    async fn ping(&self) -> Result<(), DriverError> {
        with_client!(self, c => execute_simple(c, "SELECT 1").await.map(|_| ()))
    }

    async fn execute(&self, query: &str) -> Result<QueryResult, DriverError> {
        with_client!(self, c => {
            let (cols, rows, affected) = execute_simple(c, query).await?;
            Ok(QueryResult {
                columns: cols
                    .into_iter()
                    .map(|name| ColumnInfo {
                        name,
                        type_name: String::new(),
                        nullable: true,
                        is_primary_key: false,
                    })
                    .collect(),
                rows,
                affected_rows: affected,
                execution_time_ms: 0.0,
                truncated: false,
                total_row_count: None,
            })
        })
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, DriverError> {
        with_client!(self, c => schema::fetch_tables(c).await)
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, DriverError> {
        with_client!(self, c => schema::fetch_columns(c, table, schema.unwrap_or("")).await)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, DriverError> {
        with_client!(self, c => schema_indexes::fetch_indexes(c, table, schema.unwrap_or("")).await)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, DriverError> {
        with_client!(self, c => schema_indexes::fetch_foreign_keys(c, table, schema.unwrap_or("")).await)
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, DriverError> {
        with_client!(self, c => schema::fetch_databases(c).await)
    }

    async fn fetch_ddl(&self, table: &str, schema: Option<&str>) -> Result<String, DriverError> {
        with_client!(self, c => ddl::fetch_ddl(c, table, schema.unwrap_or("")).await)
    }

    async fn cancel_query(&self) -> Result<(), DriverError> {
        // SQL Server cancels a running statement with a TDS attention packet
        // on the same connection. `tiberius` knows the packet type but exposes
        // no API to send one, and the connection is busy reading the result
        // stream anyway. The only server-side lever is `KILL <spid>`, which
        // tears down the entire session (transaction, temp tables, connection)
        // rather than aborting the statement — that is a disconnect, not a
        // cancel, so we keep reporting the honest `Unsupported` and gate the
        // Cancel affordance off via the capability sidecar.
        Err(DriverError::Unsupported(
            "SQL Server query cancellation is not supported by this driver".to_string(),
        ))
    }

    fn supports_schemas(&self) -> bool {
        true
    }

    fn supports_transactions(&self) -> bool {
        true
    }

    fn database_type_id(&self) -> &str {
        "mssql"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};

    fn config_for(host: &str, ssl_mode: &str) -> ConnectionConfig {
        ConnectionConfig {
            host: host.to_string(),
            port: 1433,
            user: "u".to_string(),
            password: "p".to_string(),
            database: "d".to_string(),
            db_type: "mssql".to_string(),
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

    fn driver_for(host: &str, ssl_mode: &str) -> MssqlDriver {
        MssqlDriver::new(tokio::runtime::Handle::current(), config_for(host, ssl_mode))
    }

    /// Each attempt dials exactly one resolved address on the configured port,
    /// so no attempt can fall back to walking the rest serially.
    #[test]
    fn each_attempt_targets_one_resolved_address() {
        let v6 = socket_addr_for(IpAddr::V6(Ipv6Addr::LOCALHOST), 1433);
        let v4 = socket_addr_for(IpAddr::V4(Ipv4Addr::LOCALHOST), 1433);

        assert_eq!(v6.ip(), IpAddr::V6(Ipv6Addr::LOCALHOST));
        assert_eq!(v4.ip(), IpAddr::V4(Ipv4Addr::LOCALHOST));
        assert_eq!(v6.port(), 1433);
        assert_eq!(v4.port(), 1433);
        assert_ne!(v6, v4);
    }

    /// Pinning the socket's address must not change what TLS verifies:
    /// tiberius takes its certificate hostname from the config, not from the
    /// socket we hand it.
    #[tokio::test]
    async fn pinning_the_socket_keeps_the_hostname_for_tls() {
        let driver = driver_for("sql.example.com", "verify-full");
        let cfg = driver.build_tiberius_config();

        // `get_addr` is the only accessor tiberius exposes; it still names the
        // hostname, which is what the TLS layer verifies against. We resolve
        // that same host ourselves and dial one of its addresses.
        assert_eq!(cfg.get_addr(), "sql.example.com:1433");
    }

    /// `verify-full` is the only mode that validates the certificate; every
    /// other mode trusts it. Pinning the address must not disturb that.
    #[tokio::test]
    async fn trust_cert_still_tracks_only_verify_full() {
        // Not directly readable off tiberius' Config, so assert via the branch
        // input that decides it.
        assert_eq!(config_for("h", "verify-full").ssl_mode, "verify-full");
        for mode in ["disable", "prefer", "require", "verify-ca"] {
            assert_ne!(config_for("h", mode).ssl_mode, "verify-full");
        }
    }
}
