//! SQLite driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `rusqlite`.
//! `rusqlite` is synchronous, so each trait method dispatches the work to a
//! blocking thread via `tokio::runtime::Handle::spawn_blocking`. The
//! `Connection` lives behind a `std::sync::Mutex` (sync-only access; never
//! held across `.await`).

mod ops;

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use rusqlite::{Connection, InterruptHandle};

use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

pub struct SqliteDriver {
    rt: tokio::runtime::Handle,
    config: ConnectionConfig,
    conn: Arc<Mutex<Option<Connection>>>,
    interrupt: Arc<Mutex<Option<InterruptHandle>>>,
}

impl SqliteDriver {
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        Self {
            rt: rt_handle,
            config,
            conn: Arc::new(Mutex::new(None)),
            interrupt: Arc::new(Mutex::new(None)),
        }
    }
}

/// Run a sync rusqlite operation on a blocking thread, with the connection
/// guarded by the std mutex. Errors out cleanly if disconnected.
async fn with_conn<F, T>(driver: &SqliteDriver, f: F) -> Result<T, DriverError>
where
    F: FnOnce(&Connection) -> Result<T, DriverError> + Send + 'static,
    T: Send + 'static,
{
    let conn_arc = driver.conn.clone();
    driver
        .rt
        .spawn_blocking(move || -> Result<T, DriverError> {
            let guard = conn_arc
                .lock()
                .map_err(|e| DriverError::Other(format!("Mutex poisoned: {e}")))?;
            let conn = guard
                .as_ref()
                .ok_or_else(|| DriverError::Connection("Not connected".to_string()))?;
            f(conn)
        })
        .await
        .map_err(|e| DriverError::Other(e.to_string()))?
}

#[async_trait]
impl DatabaseDriver for SqliteDriver {
    async fn connect(&self) -> Result<(), DriverError> {
        let path = self.config.database.clone();
        let conn_arc = self.conn.clone();
        let interrupt_arc = self.interrupt.clone();

        self.rt
            .spawn_blocking(move || -> Result<(), DriverError> {
                let conn = Connection::open(&path)
                    .map_err(|e| DriverError::Connection(e.to_string()))?;
                // Best-effort PRAGMAs — ignore errors to mirror legacy behavior.
                let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");
                let _ = conn.execute_batch("PRAGMA busy_timeout=5000;");

                let interrupt = conn.get_interrupt_handle();
                {
                    let mut g = interrupt_arc
                        .lock()
                        .map_err(|e| DriverError::Other(format!("Mutex poisoned: {e}")))?;
                    *g = Some(interrupt);
                }
                {
                    let mut g = conn_arc
                        .lock()
                        .map_err(|e| DriverError::Other(format!("Mutex poisoned: {e}")))?;
                    *g = Some(conn);
                }
                Ok(())
            })
            .await
            .map_err(|e| DriverError::Other(e.to_string()))?
    }

    fn disconnect(&self) {
        if let Ok(mut g) = self.interrupt.lock() {
            *g = None;
        }
        if let Ok(mut g) = self.conn.lock() {
            *g = None;
        }
    }

    async fn ping(&self) -> Result<(), DriverError> {
        with_conn(self, ops::ping).await
    }

    async fn execute(&self, query: &str) -> Result<QueryResult, DriverError> {
        let sql = query.to_string();
        with_conn(self, move |c| ops::execute(c, &sql)).await
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, DriverError> {
        with_conn(self, ops::fetch_tables).await
    }

    async fn fetch_columns(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, DriverError> {
        let t = table.to_string();
        with_conn(self, move |c| ops::fetch_columns(c, &t)).await
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, DriverError> {
        let t = table.to_string();
        with_conn(self, move |c| ops::fetch_indexes(c, &t)).await
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, DriverError> {
        let t = table.to_string();
        with_conn(self, move |c| ops::fetch_foreign_keys(c, &t)).await
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, DriverError> {
        with_conn(self, ops::fetch_databases).await
    }

    async fn fetch_ddl(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<String, DriverError> {
        let t = table.to_string();
        with_conn(self, move |c| ops::fetch_ddl(c, &t)).await
    }

    async fn cancel_query(&self) -> Result<(), DriverError> {
        // `InterruptHandle::interrupt()` is sync and non-blocking, so no
        // blocking-thread dispatch is needed here.
        let guard = self
            .interrupt
            .lock()
            .map_err(|e| DriverError::Other(format!("Mutex poisoned: {e}")))?;
        match guard.as_ref() {
            Some(h) => {
                h.interrupt();
                Ok(())
            }
            None => Err(DriverError::Connection(
                "No active connection to cancel".to_string(),
            )),
        }
    }

    fn supports_schemas(&self) -> bool {
        false
    }

    fn supports_transactions(&self) -> bool {
        true
    }

    fn database_type_id(&self) -> &str {
        "sqlite"
    }
}
