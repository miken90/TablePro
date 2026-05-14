//! MongoDB driver — statically linked into TablePro Windows.
//!
//! Implements `driver_common::DatabaseDriver` directly using `mongodb` (async).
//! NoSQL → tabular adaptation:
//!   - `fetch_tables`        → list collections in current DB
//!   - `fetch_columns`       → sample up to 100 docs and infer fields/types
//!   - `fetch_indexes`       → `listIndexes` on collection
//!   - `fetch_foreign_keys`  → empty (not supported)
//!   - `fetch_databases`     → server-wide DB list
//!   - `fetch_ddl`           → descriptive comment (no DDL)
//!   - `execute`             → JSON command `{collection,filter,sort,limit}` → find()
//!
//! See `bson_flatten.rs` for value/type rendering rules carried over from the
//! cdylib FFI version.

mod bson_flatten;
mod ops_basic;
mod ops_schema;

use async_trait::async_trait;
use mongodb::Client;
use tokio::sync::Mutex;

use driver_common::{
    ColumnInfo, ConnectionConfig, DatabaseDriver, DriverError, ForeignKeyInfo, IndexInfo,
    QueryResult, TableInfo,
};

/// MongoDB driver instance.
///
/// Holds the connection config and a lazily-established `Client` behind a
/// `tokio::sync::Mutex`.
pub struct MongoDriver {
    rt: tokio::runtime::Handle,
    config: ConnectionConfig,
    client: Mutex<Option<Client>>,
}

impl MongoDriver {
    /// Build a driver bound to the host runtime. Connection opens lazily via `connect()`.
    pub fn new(rt_handle: tokio::runtime::Handle, config: ConnectionConfig) -> Self {
        Self {
            rt: rt_handle,
            config,
            client: Mutex::new(None),
        }
    }

    /// Database name to use; falls back to "admin" if not specified.
    fn db_name(&self) -> &str {
        if self.config.database.is_empty() {
            "admin"
        } else {
            &self.config.database
        }
    }

    /// Build a MongoDB connection URI from `ConnectionConfig`.
    ///
    /// If host already starts with `mongodb://` or `mongodb+srv://`, returned as-is.
    fn build_uri(&self) -> String {
        let host = &self.config.host;
        if host.starts_with("mongodb://") || host.starts_with("mongodb+srv://") {
            return host.clone();
        }

        let mut uri = String::from("mongodb://");
        if !self.config.user.is_empty() {
            uri.push_str(&percent_encode(&self.config.user));
            if !self.config.password.is_empty() {
                uri.push(':');
                uri.push_str(&percent_encode(&self.config.password));
            }
            uri.push('@');
        }
        uri.push_str(host);
        if self.config.port != 0 {
            uri.push(':');
            uri.push_str(&self.config.port.to_string());
        }
        uri.push('/');
        if !self.config.database.is_empty() {
            uri.push_str(&self.config.database);
        }
        uri
    }
}

/// Minimal percent-encoding for URI user/password components.
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

/// Lock the client mutex and return an error if not connected.
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
impl DatabaseDriver for MongoDriver {
    async fn connect(&self) -> Result<(), DriverError> {
        let uri = self.build_uri();
        let client = Client::with_uri_str(&uri)
            .await
            .map_err(|e| DriverError::Connection(format!("MongoDB connection failed: {e}")))?;

        // Verify connectivity via ping.
        let db = client.database(self.db_name());
        db.run_command(mongodb::bson::doc! { "ping": 1 })
            .await
            .map_err(|e| DriverError::Connection(format!("MongoDB ping failed: {e}")))?;

        // Touch rt to avoid dead-code warning — also keeps it ready for any
        // future spawned background tasks (none today; mongodb manages its own).
        let _ = self.rt.id();

        *self.client.lock().await = Some(client);
        Ok(())
    }

    fn disconnect(&self) {
        if let Ok(mut guard) = self.client.try_lock() {
            *guard = None;
        }
    }

    async fn ping(&self) -> Result<(), DriverError> {
        let db_name = self.db_name().to_string();
        with_client!(self, c => c.database(&db_name)
            .run_command(mongodb::bson::doc! { "ping": 1 })
            .await
            .map(|_| ())
            .map_err(|e| DriverError::Query(format!("Ping failed: {e}"))))
    }

    async fn execute(&self, query: &str) -> Result<QueryResult, DriverError> {
        let db_name = self.db_name().to_string();
        with_client!(self, c => ops_basic::execute(c, &db_name, query).await)
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, DriverError> {
        let db_name = self.db_name().to_string();
        with_client!(self, c => ops_basic::fetch_tables(c, &db_name).await)
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, DriverError> {
        let db_name = schema
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| self.db_name().to_string());
        with_client!(self, c => ops_schema::fetch_columns(c, &db_name, table).await)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, DriverError> {
        let db_name = schema
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| self.db_name().to_string());
        with_client!(self, c => ops_schema::fetch_indexes(c, &db_name, table).await)
    }

    async fn fetch_foreign_keys(
        &self,
        _table: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, DriverError> {
        // MongoDB has no foreign keys.
        Ok(vec![])
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, DriverError> {
        with_client!(self, c => ops_schema::fetch_databases(c).await)
    }

    async fn fetch_ddl(&self, table: &str, _schema: Option<&str>) -> Result<String, DriverError> {
        Ok(format!(
            "-- MongoDB collection '{table}'\n-- DDL is not applicable for MongoDB collections."
        ))
    }

    fn cancel_query(&self) -> Result<(), DriverError> {
        Err(DriverError::Unsupported(
            "Cancel not supported for MongoDB".to_string(),
        ))
    }

    fn supports_schemas(&self) -> bool {
        // Mongo "schemas" map to databases — handled at a higher level; the
        // trait `schema` argument is treated as DB override in our impl, but
        // structurally Mongo collections live directly under a DB.
        false
    }

    fn supports_transactions(&self) -> bool {
        // Multi-document transactions exist on replica sets, but we do not
        // wrap them in this driver yet.
        false
    }

    fn database_type_id(&self) -> &str {
        "mongodb"
    }
}
