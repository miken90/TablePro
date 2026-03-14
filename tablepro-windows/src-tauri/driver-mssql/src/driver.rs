//! MssqlDriver — owns a Tokio runtime and an optional Tiberius client.

use std::sync::Mutex;

use tiberius::{AuthMethod, Client, Config};
use tokio::net::TcpStream;
use tokio::runtime::Runtime;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use tablepro_plugin_sdk::{DriverConfig, FfiColumnInfo, FfiQueryResult, FfiString};

use crate::ffi::string_to_ffi;

pub type MssqlConn = Client<tokio_util::compat::Compat<TcpStream>>;

pub struct MssqlDriver {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub ssl_mode: String,
    pub runtime: Runtime,
    pub client: Mutex<Option<MssqlConn>>,
}

impl MssqlDriver {
    /// Create a new driver from the FFI config. Returns `Err(msg)` on failure.
    pub fn from_config(config: &DriverConfig) -> Result<Box<Self>, String> {
        let host = unsafe { config.host.as_str() }.to_owned();
        let port = config.port;
        let user = unsafe { config.user.as_str() }.to_owned();
        let password = unsafe { config.password.as_str() }.to_owned();
        let database = unsafe { config.database.as_str() }.to_owned();
        let ssl_mode = unsafe { config.ssl_mode.as_str() }.to_owned();

        let runtime = Runtime::new().map_err(|e| e.to_string())?;

        Ok(Box::new(MssqlDriver {
            host,
            port,
            user,
            password,
            database,
            ssl_mode,
            runtime,
            client: Mutex::new(None),
        }))
    }

    /// Build a Tiberius `Config` from stored fields.
    fn build_config(&self) -> Config {
        let mut cfg = Config::new();
        cfg.host(&self.host);
        cfg.port(self.port);
        cfg.authentication(AuthMethod::sql_server(&self.user, &self.password));
        if !self.database.is_empty() {
            cfg.database(&self.database);
        }
        if self.ssl_mode != "verify-full" {
            cfg.trust_cert();
        }
        cfg
    }

    pub fn connect(&self) -> Result<(), String> {
        let cfg = self.build_config();
        let client = self.runtime.block_on(async {
            let tcp = TcpStream::connect(cfg.get_addr())
                .await
                .map_err(|e| e.to_string())?;
            tcp.set_nodelay(true).map_err(|e| e.to_string())?;
            Client::connect(cfg, tcp.compat_write())
                .await
                .map_err(|e| e.to_string())
        })?;
        *self.client.lock().unwrap() = Some(client);
        Ok(())
    }

    pub fn disconnect(&self) {
        let mut guard = self.client.lock().unwrap();
        *guard = None;
    }

    pub fn ping(&self) -> Result<(), String> {
        self.execute_query("SELECT 1").map(|_| ())
    }

    /// Execute a SQL statement and return `(columns, rows, affected_rows)`.
    #[allow(clippy::type_complexity)]
    pub fn execute_query(
        &self,
        sql: &str,
    ) -> Result<(Vec<String>, Vec<Vec<Option<String>>>, i64), String> {
        let mut guard = self.client.lock().unwrap();
        let client = guard.as_mut().ok_or("Not connected")?;

        let sql_owned = sql.to_owned();
        self.runtime.block_on(async {
            let query = client
                .simple_query(&sql_owned)
                .await
                .map_err(|e| e.to_string())?;

            let results: Vec<_> = query
                .into_results()
                .await
                .map_err(|e| e.to_string())?;

            if results.is_empty() {
                return Ok((vec![], vec![], 0));
            }

            // Use first result set
            let first = &results[0];
            if first.is_empty() {
                return Ok((vec![], vec![], 0));
            }

            // Extract column names from first row metadata
            let col_names: Vec<String> = first[0]
                .columns()
                .iter()
                .map(|c| c.name().to_owned())
                .collect();

            let mut rows: Vec<Vec<Option<String>>> = Vec::new();
            for row in first {
                let mut cells: Vec<Option<String>> = Vec::new();
                for i in 0..col_names.len() {
                    let val: Option<&str> = row.get(i);
                    cells.push(val.map(|s| s.to_owned()));
                }
                rows.push(cells);
            }

            let affected = rows.len() as i64;
            Ok((col_names, rows, affected))
        })
    }
}

/// Build an `FfiQueryResult` from a successful query result.
pub fn build_query_result(
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
    affected_rows: i64,
) -> FfiQueryResult {
    let col_count = columns.len();
    let row_count = rows.len();

    // Allocate column info array
    let mut col_infos: Vec<FfiColumnInfo> = columns
        .into_iter()
        .map(|name| FfiColumnInfo {
            name: string_to_ffi(name),
            type_name: string_to_ffi(String::new()),
            nullable: true,
            is_primary_key: false,
        })
        .collect();

    let col_ptr = col_infos.as_mut_ptr();
    std::mem::forget(col_infos);

    // Flat cell array (row-major)
    let mut cells: Vec<FfiString> = rows
        .into_iter()
        .flat_map(|row| {
            row.into_iter().map(|cell| match cell {
                Some(s) => string_to_ffi(s),
                None => string_to_ffi(String::new()),
            })
        })
        .collect();

    let cell_ptr = cells.as_mut_ptr();
    std::mem::forget(cells);

    FfiQueryResult {
        columns: col_ptr,
        column_count: col_count,
        cells: cell_ptr,
        row_count,
        affected_rows,
        error: FfiString::null(),
    }
}

/// Build an error `FfiQueryResult`.
pub fn err_query_result(msg: impl Into<String>) -> FfiQueryResult {
    FfiQueryResult {
        columns: std::ptr::null_mut(),
        column_count: 0,
        cells: std::ptr::null_mut(),
        row_count: 0,
        affected_rows: 0,
        error: string_to_ffi(msg.into()),
    }
}
