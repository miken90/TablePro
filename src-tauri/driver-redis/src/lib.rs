//! Redis driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using the async
//! `redis` crate with a `MultiplexedConnection` shared via a Tokio mutex.
//! Shares the host's Tokio runtime (no nested runtime).
//!
//! Redis is a key/value store, so the relational shape is adapted:
//! - `fetch_tables`  → SCAN keys (capped at 200) presented as rows
//! - `fetch_columns` → fixed `Key | Type | TTL | Value` schema
//! - `fetch_indexes` / `fetch_foreign_keys` → empty
//! - `fetch_databases` → INFO keyspace → `db0 (N keys)`, …
//! - `execute()` accepts either a JSON browse command (`{"action":"scan",…}`)
//!   or a Redis CLI text command (`GET foo`, `HGETALL h`, …).

mod command_parser;
mod helpers;
mod ops_basic;
mod ops_collection;
mod ops_hash;
mod ops_key;
mod ops_schema;
mod ops_server;

use std::sync::atomic::{AtomicU16, Ordering};

use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::Client;
use tokio::sync::Mutex;

use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

use command_parser::{parse_command, RedisCommand};

/// Redis driver instance. Single multiplexed connection per driver.
pub struct RedisDriver {
    #[allow(dead_code)]
    rt: tokio::runtime::Handle,
    config: ConnectionConfig,
    client: Mutex<Option<MultiplexedConnection>>,
    /// Currently-selected database index. Tracked separately so browse
    /// commands can switch DB without holding the connection lock.
    current_db: AtomicU16,
}

impl RedisDriver {
    /// Create a new driver bound to the host runtime. Connection is opened
    /// lazily by `connect()`.
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        let initial_db: u16 = config.database.parse().unwrap_or(0);
        Self {
            rt: rt_handle,
            config,
            client: Mutex::new(None),
            current_db: AtomicU16::new(initial_db),
        }
    }

    /// Build the `redis://` or `rediss://` URL from config.
    fn build_url(&self) -> String {
        let use_tls = matches!(
            self.config.ssl_mode.to_lowercase().as_str(),
            "require" | "tls" | "ssl"
        );
        let scheme = if use_tls { "rediss" } else { "redis" };
        let db = self.current_db.load(Ordering::Relaxed);
        let host = &self.config.host;
        let port = self.config.port;
        if self.config.password.is_empty() {
            format!("{scheme}://{host}:{port}/{db}")
        } else {
            let pw = percent_encode(&self.config.password);
            format!("{scheme}://:{pw}@{host}:{port}/{db}")
        }
    }
}

/// Lock the client mutex and return an error if not connected.
/// The macro keeps the guard alive across the body's `.await` points.
macro_rules! with_client {
    ($self:ident, $client:ident => $body:expr) => {{
        let mut guard = $self.client.lock().await;
        let $client = guard
            .as_mut()
            .ok_or_else(|| DriverError::Connection("Not connected".to_string()))?;
        $body
    }};
}

#[async_trait]
impl DatabaseDriver for RedisDriver {
    async fn connect(&self) -> Result<(), DriverError> {
        // `rediss://` URLs go through rustls; without an installed crypto
        // provider the handshake panics instead of returning an error.
        driver_common::ensure_crypto_provider();
        let url = self.build_url();
        let client = Client::open(url.as_str())
            .map_err(|e| DriverError::Connection(format!("Redis client error: {e}")))?;
        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| DriverError::Connection(format!("Redis connection failed: {e}")))?;

        // Verify with PING.
        let pong: String = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .map_err(|e| DriverError::Connection(format!("PING failed: {e}")))?;
        if pong != "PONG" {
            return Err(DriverError::Connection(format!(
                "Unexpected PING response: {pong}"
            )));
        }

        *self.client.lock().await = Some(conn);
        Ok(())
    }

    fn disconnect(&self) {
        if let Ok(mut guard) = self.client.try_lock() {
            *guard = None;
        }
    }

    async fn ping(&self) -> Result<(), DriverError> {
        with_client!(self, c => {
            let pong: String = redis::cmd("PING")
                .query_async(c)
                .await
                .map_err(|e| DriverError::Connection(format!("PING failed: {e}")))?;
            if pong == "PONG" {
                Ok(())
            } else {
                Err(DriverError::Connection(format!("Unexpected PING response: {pong}")))
            }
        })
    }

    async fn execute(&self, query: &str) -> Result<QueryResult, DriverError> {
        let input = query.trim();
        if input.is_empty() {
            return Err(DriverError::Query("Empty command".to_string()));
        }

        // JSON browse command — sidebar/grid integration.
        if input.starts_with('{') {
            let json: serde_json::Value = serde_json::from_str(input)
                .map_err(|e| DriverError::Query(format!("Invalid JSON: {e}")))?;
            let action = json
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            return match action {
                "scan" => {
                    let pattern = json
                        .get("pattern")
                        .and_then(|v| v.as_str())
                        .unwrap_or("*")
                        .to_string();
                    let count: usize = json
                        .get("count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(200) as usize;
                    let requested_db: u16 = json
                        .get("db")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(self.current_db.load(Ordering::Relaxed) as u64)
                        as u16;

                    if requested_db != self.current_db.load(Ordering::Relaxed) {
                        with_client!(self, c => {
                            redis::cmd("SELECT")
                                .arg(requested_db)
                                .query_async::<()>(c)
                                .await
                                .map_err(|e| DriverError::Query(format!("SELECT failed: {e}")))?;
                        });
                        self.current_db.store(requested_db, Ordering::Relaxed);
                    }

                    with_client!(self, c => ops_key::scan_keys(c, &pattern, count).await)
                }
                other => Err(DriverError::Query(format!(
                    "Unknown browse action: {other}"
                ))),
            };
        }

        // Redis CLI text command.
        let command = parse_command(input)
            .map_err(|e| DriverError::Query(format!("Parse error: {e}")))?;
        self.dispatch_command(&command).await
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, DriverError> {
        let db_label = format!("db{}", self.current_db.load(Ordering::Relaxed));
        with_client!(self, c => ops_schema::fetch_tables(c, &db_label).await)
    }

    async fn fetch_columns(
        &self,
        _table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, DriverError> {
        Ok(ops_schema::fixed_key_columns())
    }

    async fn fetch_indexes(
        &self,
        _table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, DriverError> {
        Ok(Vec::new())
    }

    async fn fetch_foreign_keys(
        &self,
        _table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, DriverError> {
        Ok(Vec::new())
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, DriverError> {
        with_client!(self, c => ops_schema::fetch_databases(c).await)
    }

    async fn fetch_ddl(
        &self,
        table: &str,
        _schema: Option<&str>,
    ) -> Result<String, DriverError> {
        Ok(format!(
            "-- Redis key '{table}'\n-- DDL is not applicable for Redis keys."
        ))
    }

    async fn cancel_query(&self) -> Result<(), DriverError> {
        // Redis executes each command atomically on a single thread; there is
        // no "in-flight statement" to abort. The only interruptible case is a
        // blocking command (`CLIENT UNBLOCK`), which this driver never issues —
        // the command panel and key browser only run SCAN/read commands. So we
        // keep the honest `Unsupported` and gate the Cancel affordance off via
        // the capability sidecar.
        Err(DriverError::Unsupported(
            "Redis commands are atomic and cannot be cancelled".to_string(),
        ))
    }

    fn supports_schemas(&self) -> bool {
        false
    }

    fn supports_transactions(&self) -> bool {
        false
    }

    fn database_type_id(&self) -> &str {
        "redis"
    }
}

impl RedisDriver {
    async fn dispatch_command(
        &self,
        command: &RedisCommand,
    ) -> Result<QueryResult, DriverError> {
        // SELECT mutates `current_db`; handle outside the lock so we can
        // update the atomic after the call succeeds.
        if command.name == "SELECT" {
            if command.args.is_empty() {
                return Err(DriverError::Query("Usage: SELECT db_index".to_string()));
            }
            let db: u16 = command.args[0]
                .parse()
                .map_err(|_| DriverError::Query("Database index must be a number".to_string()))?;
            with_client!(self, c => {
                redis::cmd("SELECT")
                    .arg(db)
                    .query_async::<()>(c)
                    .await
                    .map_err(|e| DriverError::Query(format!("SELECT failed: {e}")))?;
            });
            self.current_db.store(db, Ordering::Relaxed);
            return Ok(helpers::message_result("OK"));
        }

        with_client!(self, c => {
            match command.name.as_str() {
                // Key
                "GET" => ops_key::cmd_get(c, &command.args).await,
                "SET" => ops_key::cmd_set(c, &command.args).await,
                "DEL" => ops_key::cmd_del(c, &command.args).await,
                "EXISTS" => ops_key::cmd_exists(c, &command.args).await,
                "TYPE" => ops_key::cmd_type(c, &command.args).await,
                "TTL" => ops_key::cmd_ttl(c, &command.args).await,
                "PTTL" => ops_key::cmd_pttl(c, &command.args).await,
                "EXPIRE" => ops_key::cmd_expire(c, &command.args).await,
                "PERSIST" => ops_key::cmd_persist(c, &command.args).await,
                "RENAME" => ops_key::cmd_rename(c, &command.args).await,
                "KEYS" => ops_key::cmd_keys(c, &command.args).await,
                "SCAN" => ops_key::cmd_scan(c, &command.args).await,

                // Hash
                "HGET" => ops_hash::cmd_hget(c, &command.args).await,
                "HSET" => ops_hash::cmd_hset(c, &command.args).await,
                "HGETALL" => ops_hash::cmd_hgetall(c, &command.args).await,
                "HDEL" => ops_hash::cmd_hdel(c, &command.args).await,

                // List
                "LRANGE" => ops_collection::cmd_lrange(c, &command.args).await,
                "LPUSH" => ops_collection::cmd_lpush(c, &command.args).await,
                "RPUSH" => ops_collection::cmd_rpush(c, &command.args).await,
                "LLEN" => ops_collection::cmd_llen(c, &command.args).await,

                // Set
                "SMEMBERS" => ops_collection::cmd_smembers(c, &command.args).await,
                "SADD" => ops_collection::cmd_sadd(c, &command.args).await,
                "SREM" => ops_collection::cmd_srem(c, &command.args).await,
                "SCARD" => ops_collection::cmd_scard(c, &command.args).await,

                // Sorted set
                "ZRANGE" => ops_collection::cmd_zrange(c, &command.args).await,
                "ZADD" => ops_collection::cmd_zadd(c, &command.args).await,
                "ZREM" => ops_collection::cmd_zrem(c, &command.args).await,
                "ZCARD" => ops_collection::cmd_zcard(c, &command.args).await,

                // Stream
                "XRANGE" => ops_collection::cmd_xrange(c, &command.args).await,
                "XLEN" => ops_collection::cmd_xlen(c, &command.args).await,

                // Server
                "PING" => ops_server::cmd_ping(c).await,
                "INFO" => ops_server::cmd_info(c, &command.args).await,
                "DBSIZE" => ops_server::cmd_dbsize(c).await,
                "CONFIG" => ops_server::cmd_config(c, &command.args).await,
                "FLUSHDB" => ops_server::cmd_flushdb(c).await,

                other => Err(DriverError::Query(format!("Unsupported command: {other}"))),
            }
        })
    }
}

/// Minimal percent-encoding for password embedded in URI.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
