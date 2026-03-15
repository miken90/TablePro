use rusqlite::Connection;
use std::sync::Mutex;
use tokio::runtime::Runtime;

/// Internal SQLite driver state — boxed and cast to *mut DriverHandle.
pub struct SqliteDriver {
    pub database: String,
    pub conn: Mutex<Option<Connection>>,
    /// Interrupt handle for cancel support — safe to use from another thread.
    pub interrupt_handle: Mutex<Option<rusqlite::InterruptHandle>>,
    pub runtime: Runtime,
}

impl SqliteDriver {
    pub fn new(database: String) -> Result<Box<Self>, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        Ok(Box::new(SqliteDriver {
            database,
            conn: Mutex::new(None),
            interrupt_handle: Mutex::new(None),
            runtime,
        }))
    }
}
