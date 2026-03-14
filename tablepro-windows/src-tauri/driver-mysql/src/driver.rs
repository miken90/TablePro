/// MySqlDriver struct — holds runtime, pool, and connection config.
use mysql_async::prelude::Queryable;
use mysql_async::{Conn, OptsBuilder, Pool, SslOpts};
use tablepro_plugin_sdk::DriverConfig;
use tokio::runtime::Runtime;

pub struct MySqlDriver {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub ssl_mode: String,
    pub pool: Option<Pool>,
    pub conn: Option<Conn>,
    pub runtime: Runtime,
}

impl MySqlDriver {
    /// Build from C config. Strings are copied from FfiStr immediately.
    pub unsafe fn from_config(config: &DriverConfig) -> Option<Self> {
        let host = config.host.as_str().to_owned();
        let user = config.user.as_str().to_owned();
        let password = config.password.as_str().to_owned();
        let database = config.database.as_str().to_owned();
        let ssl_mode = config.ssl_mode.as_str().to_owned();
        let port = config.port;

        let runtime = Runtime::new().ok()?;
        Some(Self {
            host,
            port,
            user,
            password,
            database,
            ssl_mode,
            pool: None,
            conn: None,
            runtime,
        })
    }

    fn build_opts(&self) -> OptsBuilder {
        let mut builder = OptsBuilder::default()
            .ip_or_hostname(self.host.clone())
            .tcp_port(self.port)
            .user(Some(self.user.clone()))
            .pass(Some(self.password.clone()))
            .db_name(Some(self.database.clone()));

        match self.ssl_mode.as_str() {
            "require" | "verify-ca" | "verify-full" => {
                builder = builder.ssl_opts(SslOpts::default());
            }
            _ => {}
        }

        builder
    }

    pub fn do_connect(&mut self) -> Result<(), String> {
        let opts = self.build_opts();
        let pool = Pool::new(opts);
        let conn = self
            .runtime
            .block_on(pool.get_conn())
            .map_err(|e| e.to_string())?;
        self.pool = Some(pool);
        self.conn = Some(conn);
        Ok(())
    }

    pub fn do_disconnect(&mut self) {
        // Drop conn first, then pool so the pool can be cleanly shut down.
        if let Some(conn) = self.conn.take() {
            let _ = self.runtime.block_on(conn.disconnect());
        }
        if let Some(pool) = self.pool.take() {
            let _ = self.runtime.block_on(pool.disconnect());
        }
    }

    pub fn do_ping(&mut self) -> Result<(), String> {
        let conn = self.conn.as_mut().ok_or("Not connected")?;
        self.runtime
            .block_on(conn.ping())
            .map_err(|e: mysql_async::Error| e.to_string())
    }
}

// ── Handle casting helpers ───────────────────────────────────────────────────

use tablepro_plugin_sdk::DriverHandle;

pub unsafe fn handle_as_driver(handle: *mut DriverHandle) -> &'static mut MySqlDriver {
    &mut *(handle as *mut MySqlDriver)
}
