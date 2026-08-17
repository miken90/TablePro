//! SQL Server driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `tiberius`.
//! Shares the host's Tokio runtime via `tokio::runtime::Handle` (no nested
//! runtime — see `plans/reports/spike-postgres-rlib.md`).

mod ddl;
mod schema;
mod schema_indexes;
mod value_format;

use async_trait::async_trait;
use tiberius::{AuthMethod, Client, Config};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

use value_format::format_cell;

pub type MssqlConn = Client<Compat<TcpStream>>;

/// SQL Server driver instance.
pub struct MssqlDriver {
    #[allow(dead_code)]
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
        let tcp = TcpStream::connect(cfg.get_addr())
            .await
            .map_err(|e| DriverError::Connection(e.to_string()))?;
        tcp.set_nodelay(true)
            .map_err(|e| DriverError::Connection(e.to_string()))?;
        let client = Client::connect(cfg, tcp.compat_write())
            .await
            .map_err(|e| DriverError::Connection(e.to_string()))?;
        *self.client.lock().await = Some(client);
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
