use redis::{Client, Connection};

/// Internal Redis driver state — boxed and cast to `*mut DriverHandle`.
pub struct RedisDriver {
    pub connection_url: String,
    pub current_db: u16,
    pub connection: Option<Connection>,
}

impl RedisDriver {
    pub fn new(
        host: String,
        port: u16,
        _user: String,
        password: String,
        database: String,
        ssl_mode: String,
    ) -> Result<Box<Self>, String> {
        let db_index: u16 = database.parse().unwrap_or(0);
        let use_tls = matches!(ssl_mode.to_lowercase().as_str(), "require" | "tls" | "ssl");
        let scheme = if use_tls { "rediss" } else { "redis" };

        let url = if password.is_empty() {
            format!("{}://{}:{}/{}", scheme, host, port, db_index)
        } else {
            format!("{}://:{}@{}:{}/{}", scheme, percent_encode(&password), host, port, db_index)
        };

        Ok(Box::new(RedisDriver {
            connection_url: url,
            current_db: db_index,
            connection: None,
        }))
    }

    /// Get a mutable reference to the active connection.
    pub fn conn(&mut self) -> Result<&mut Connection, String> {
        self.connection
            .as_mut()
            .ok_or_else(|| "Not connected".to_string())
    }

    /// Open a connection to Redis and verify with PING.
    pub fn connect(&mut self) -> Result<(), String> {
        let client =
            Client::open(self.connection_url.as_str()).map_err(|e| format!("Redis client error: {e}"))?;
        let conn = client
            .get_connection()
            .map_err(|e| format!("Redis connection failed: {e}"))?;
        self.connection = Some(conn);

        // Verify with PING
        let pong: String =
            redis::cmd("PING").query(self.conn()?).map_err(|e| format!("PING failed: {e}"))?;
        if pong != "PONG" {
            return Err(format!("Unexpected PING response: {pong}"));
        }
        Ok(())
    }

    /// Switch to a different database index via SELECT.
    pub fn select_db(&mut self, db: u16) -> Result<(), String> {
        redis::cmd("SELECT")
            .arg(db)
            .query::<()>(self.conn()?)
            .map_err(|e| format!("SELECT failed: {e}"))?;
        self.current_db = db;
        Ok(())
    }
}

/// Minimal percent-encoding for password in URI.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{b:02X}"));
            }
        }
    }
    out
}
