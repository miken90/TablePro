use tokio::runtime::Runtime;
use tokio_postgres::{Client, Config};

/// Internal PostgreSQL driver state — boxed and cast to *mut DriverHandle.
pub struct PostgresDriver {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub ssl_mode: String,
    pub client: Option<Client>,
    pub runtime: Runtime,
}

impl PostgresDriver {
    pub fn new(
        host: String,
        port: u16,
        user: String,
        password: String,
        database: String,
        ssl_mode: String,
    ) -> Result<Box<Self>, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        Ok(Box::new(PostgresDriver {
            host,
            port,
            user,
            password,
            database,
            ssl_mode,
            client: None,
            runtime,
        }))
    }

    /// Build a tokio-postgres `Config` via the builder API.
    ///
    /// Uses typed setters instead of string parsing — avoids quoting issues
    /// and handles empty database (defaults to username per PostgreSQL convention).
    pub fn build_config(&self) -> Config {
        let mut cfg = Config::new();
        cfg.host(&self.host);
        cfg.port(self.port);
        cfg.user(&self.user);
        cfg.password(&self.password);
        if !self.database.is_empty() {
            cfg.dbname(&self.database);
        }
        cfg
    }
}
