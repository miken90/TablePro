//! PostgreSQL database driver implementation using tokio-postgres.

use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tokio_postgres::{Client, NoTls, SimpleQueryMessage};

use crate::database::driver::{DatabaseDriver, DbResult};
use crate::models::{
    ColumnInfo, ColumnType, ConnectionConfig, ConnectionStatus, DatabaseError, DatabaseMetadata,
    DatabaseType, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo, TableMetadata, TableType,
};

pub struct PostgresDriver {
    config: ConnectionConfig,
    status: ConnectionStatus,
    client: Option<Arc<Mutex<Client>>>,
    server_version: Option<String>,
    current_schema: String,
}

impl PostgresDriver {
    pub fn new(config: ConnectionConfig) -> Self {
        Self {
            config,
            status: ConnectionStatus::Disconnected,
            client: None,
            server_version: None,
            current_schema: "public".to_string(),
        }
    }

    fn client(&self) -> DbResult<Arc<Mutex<Client>>> {
        self.client.clone().ok_or(DatabaseError::NotConnected)
    }

    fn build_connection_string(&self, password: Option<&str>) -> String {
        let mut params = format!(
            "host={} port={} user={} dbname={}",
            self.config.host, self.config.port, self.config.username, self.config.database
        );
        if let Some(pw) = password {
            params.push_str(&format!(" password={}", pw));
        }
        params
    }

    /// Execute a simple query and return all rows as `Vec<Vec<Option<String>>>` plus column names.
    async fn simple_query_rows(
        &self,
        query: &str,
    ) -> DbResult<(Vec<String>, Vec<Vec<Option<String>>>)> {
        let client = self.client()?;
        let client = client.lock().await;
        let messages = client
            .simple_query(query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let mut columns: Vec<String> = Vec::new();
        let mut rows: Vec<Vec<Option<String>>> = Vec::new();
        let mut columns_set = false;

        for msg in &messages {
            if let SimpleQueryMessage::Row(row) = msg {
                if !columns_set {
                    columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                    columns_set = true;
                }
                let mut values: Vec<Option<String>> = Vec::new();
                for i in 0..row.columns().len() {
                    values.push(row.get(i).map(|s| s.to_string()));
                }
                rows.push(values);
            }
        }

        Ok((columns, rows))
    }

    /// Execute a simple query and return the first value of the first row.
    async fn simple_query_scalar(&self, query: &str) -> DbResult<Option<String>> {
        let (_, rows) = self.simple_query_rows(query).await?;
        Ok(rows
            .into_iter()
            .next()
            .and_then(|row| row.into_iter().next())
            .flatten())
    }

    /// Map a PostgreSQL type name to our ColumnType.
    fn map_column_type(pg_type: &str) -> ColumnType {
        let raw = Some(pg_type.to_string());
        match pg_type.to_lowercase().as_str() {
            "int2" | "smallint" | "int4" | "integer" | "int" | "int8" | "bigint" | "serial"
            | "bigserial" | "smallserial" | "oid" => ColumnType::Integer(raw),
            "float4" | "real" | "float8" | "double precision" | "numeric" | "decimal" | "money" => {
                ColumnType::Decimal(raw)
            }
            "bool" | "boolean" => ColumnType::Boolean(raw),
            "date" => ColumnType::Date(raw),
            "timestamp" | "timestamp without time zone" => ColumnType::Timestamp(raw),
            "timestamptz" | "timestamp with time zone" => ColumnType::Timestamp(raw),
            "time" | "time without time zone" | "timetz" | "time with time zone" => {
                ColumnType::Text(raw)
            }
            "json" | "jsonb" => ColumnType::Json(raw),
            "bytea" => ColumnType::Blob(raw),
            _ => ColumnType::Text(raw),
        }
    }

    /// Map column types from simple_query column metadata.
    fn map_column_types_from_names(type_names: &[String]) -> Vec<ColumnType> {
        type_names
            .iter()
            .map(|name| Self::map_column_type(name))
            .collect()
    }

    /// Get the affected row count from simple_query messages.
    fn extract_command_tag_count(messages: &[SimpleQueryMessage]) -> i64 {
        for msg in messages {
            if let SimpleQueryMessage::CommandComplete(count) = msg {
                return *count as i64;
            }
        }
        0
    }
}

#[async_trait]
impl DatabaseDriver for PostgresDriver {
    async fn connect(&mut self, password: Option<&str>) -> DbResult<()> {
        self.status = ConnectionStatus::Connecting;

        let conn_str = self.build_connection_string(password);

        let client;
        if self.config.ssl_config.enabled {
            let mut builder = native_tls::TlsConnector::builder();
            if !self.config.ssl_config.verify_server_cert {
                builder.danger_accept_invalid_certs(true);
            }
            let connector = builder
                .build()
                .map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))?;
            let tls = postgres_native_tls::MakeTlsConnector::new(connector);
            let (c, connection) = tokio_postgres::connect(&conn_str, tls)
                .await
                .map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))?;
            client = c;
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    tracing::error!("PostgreSQL connection error: {}", e);
                }
            });
        } else {
            let (c, connection) = tokio_postgres::connect(&conn_str, NoTls)
                .await
                .map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))?;
            client = c;
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    tracing::error!("PostgreSQL connection error: {}", e);
                }
            });
        }

        self.client = Some(Arc::new(Mutex::new(client)));

        // Fetch server version.
        if let Ok(Some(ver)) = self.simple_query_scalar("SELECT version()").await {
            self.server_version = Some(ver);
        }

        // Fetch current schema.
        if let Ok(Some(schema)) = self.simple_query_scalar("SELECT current_schema()").await {
            self.current_schema = schema;
        }

        self.status = ConnectionStatus::Connected;
        Ok(())
    }

    fn disconnect(&mut self) {
        self.client = None;
        self.status = ConnectionStatus::Disconnected;
        self.server_version = None;
    }

    async fn test_connection(&mut self, password: Option<&str>) -> DbResult<bool> {
        let result = self.connect(password).await;
        self.disconnect();
        Ok(result.is_ok())
    }

    fn status(&self) -> &ConnectionStatus {
        &self.status
    }

    fn server_version(&self) -> Option<String> {
        self.server_version.clone()
    }

    fn db_type(&self) -> &DatabaseType {
        &self.config.db_type
    }

    async fn execute(&self, query: &str) -> DbResult<QueryResult> {
        let start = Instant::now();
        let client = self.client()?;
        let client = client.lock().await;

        let messages = client
            .simple_query(query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let elapsed = start.elapsed().as_secs_f64() * 1000.0;

        let mut columns: Vec<String> = Vec::new();
        let mut rows: Vec<Vec<Option<String>>> = Vec::new();
        let mut rows_affected: i64 = 0;
        let mut columns_set = false;

        for msg in &messages {
            match msg {
                SimpleQueryMessage::Row(row) => {
                    if !columns_set {
                        columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                        columns_set = true;
                    }
                    let mut values: Vec<Option<String>> = Vec::new();
                    for i in 0..row.columns().len() {
                        values.push(row.get(i).map(|s| s.to_string()));
                    }
                    rows.push(values);
                }
                SimpleQueryMessage::CommandComplete(count) => {
                    rows_affected = *count as i64;
                }
                _ => {}
            }
        }

        // Build column types from column names (type info unavailable from simple_query).
        let column_types = if columns_set {
            // Try to infer types by querying pg_catalog for table columns.
            // For simple_query we don't have OID info, so default to Text.
            vec![ColumnType::Text(None); columns.len()]
        } else {
            Vec::new()
        };

        Ok(QueryResult {
            columns,
            column_types,
            rows,
            rows_affected,
            execution_time_ms: elapsed,
            error: None,
            is_truncated: false,
        })
    }

    async fn fetch_row_count(&self, query: &str) -> DbResult<i64> {
        let count_query = format!("SELECT COUNT(*) FROM ({}) AS _count_query", query);
        let val = self.simple_query_scalar(&count_query).await?;
        Ok(val.and_then(|v| v.parse::<i64>().ok()).unwrap_or(0))
    }

    async fn fetch_rows(&self, query: &str, offset: i64, limit: i64) -> DbResult<QueryResult> {
        let paginated = format!("{} LIMIT {} OFFSET {}", query, limit, offset);
        self.execute(&paginated).await
    }

    async fn fetch_tables(&self) -> DbResult<Vec<TableInfo>> {
        let query = format!(
            "SELECT table_name, table_type \
             FROM information_schema.tables \
             WHERE table_schema = '{}' \
             ORDER BY table_name",
            self.current_schema
        );
        let (_, rows) = self.simple_query_rows(&query).await?;

        let tables = rows
            .into_iter()
            .map(|row| {
                let name = row.first().and_then(|v| v.clone()).unwrap_or_default();
                let raw_type = row.get(1).and_then(|v| v.clone()).unwrap_or_default();
                let table_type = match raw_type.as_str() {
                    "VIEW" => TableType::View,
                    "BASE TABLE" => TableType::Table,
                    _ => TableType::Table,
                };
                TableInfo {
                    name,
                    table_type,
                    row_count: None,
                }
            })
            .collect();

        Ok(tables)
    }

    async fn fetch_columns(&self, table: &str) -> DbResult<Vec<ColumnInfo>> {
        let query = format!(
            "SELECT c.column_name, c.udt_name, c.is_nullable, c.column_default, \
                    c.character_set_name, c.collation_name, \
                    CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'YES' ELSE 'NO' END AS is_pk, \
                    col_description(cls.oid, c.ordinal_position::int) AS column_comment \
             FROM information_schema.columns c \
             LEFT JOIN information_schema.key_column_usage kcu \
                 ON kcu.table_schema = c.table_schema \
                 AND kcu.table_name = c.table_name \
                 AND kcu.column_name = c.column_name \
             LEFT JOIN information_schema.table_constraints tc \
                 ON tc.constraint_name = kcu.constraint_name \
                 AND tc.table_schema = kcu.table_schema \
                 AND tc.constraint_type = 'PRIMARY KEY' \
             LEFT JOIN pg_catalog.pg_class cls \
                 ON cls.relname = c.table_name \
                 AND cls.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = c.table_schema) \
             WHERE c.table_schema = '{}' AND c.table_name = '{}' \
             ORDER BY c.ordinal_position",
            self.current_schema, table
        );
        let (_, rows) = self.simple_query_rows(&query).await?;

        let columns = rows
            .into_iter()
            .map(|row| {
                let name = row.first().and_then(|v| v.clone()).unwrap_or_default();
                let data_type = row.get(1).and_then(|v| v.clone()).unwrap_or_default();
                let is_nullable = row
                    .get(2)
                    .and_then(|v| v.as_deref().map(|s| s == "YES"))
                    .unwrap_or(true);
                let default_value = row.get(3).and_then(|v| v.clone());
                let charset = row.get(4).and_then(|v| v.clone());
                let collation = row.get(5).and_then(|v| v.clone());
                let is_primary_key = row
                    .get(6)
                    .and_then(|v| v.as_deref().map(|s| s == "YES"))
                    .unwrap_or(false);
                let comment = row.get(7).and_then(|v| v.clone());

                ColumnInfo {
                    name,
                    data_type,
                    is_nullable,
                    is_primary_key,
                    default_value,
                    extra: None,
                    charset,
                    collation,
                    comment,
                }
            })
            .collect();

        Ok(columns)
    }

    async fn fetch_indexes(&self, table: &str) -> DbResult<Vec<IndexInfo>> {
        let query = format!(
            "SELECT i.relname AS index_name, \
                    array_to_string(ARRAY(SELECT pg_get_indexdef(i.oid, k + 1, true) \
                        FROM generate_subscripts(ix.indkey, 1) AS k ORDER BY k), ',') AS columns, \
                    ix.indisunique AS is_unique, \
                    ix.indisprimary AS is_primary, \
                    am.amname AS index_type \
             FROM pg_class t \
             JOIN pg_index ix ON t.oid = ix.indrelid \
             JOIN pg_class i ON i.oid = ix.indexrelid \
             JOIN pg_am am ON i.relam = am.oid \
             JOIN pg_namespace n ON n.oid = t.relnamespace \
             WHERE t.relname = '{}' AND n.nspname = '{}' \
             ORDER BY i.relname",
            table, self.current_schema
        );
        let (_, rows) = self.simple_query_rows(&query).await?;

        let indexes = rows
            .into_iter()
            .map(|row| {
                let name = row.first().and_then(|v| v.clone()).unwrap_or_default();
                let columns_str = row.get(1).and_then(|v| v.clone()).unwrap_or_default();
                let columns: Vec<String> = columns_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect();
                let is_unique = row
                    .get(2)
                    .and_then(|v| v.as_deref().map(|s| s == "t"))
                    .unwrap_or(false);
                let is_primary = row
                    .get(3)
                    .and_then(|v| v.as_deref().map(|s| s == "t"))
                    .unwrap_or(false);
                let index_type = row
                    .get(4)
                    .and_then(|v| v.clone())
                    .unwrap_or_else(|| "btree".to_string());

                IndexInfo {
                    name,
                    columns,
                    is_unique,
                    is_primary,
                    index_type,
                }
            })
            .collect();

        Ok(indexes)
    }

    async fn fetch_foreign_keys(&self, table: &str) -> DbResult<Vec<ForeignKeyInfo>> {
        let query = format!(
            "SELECT tc.constraint_name, kcu.column_name, \
                    ccu.table_name AS referenced_table, \
                    ccu.column_name AS referenced_column, \
                    rc.delete_rule, rc.update_rule \
             FROM information_schema.table_constraints tc \
             JOIN information_schema.key_column_usage kcu \
                 ON tc.constraint_name = kcu.constraint_name \
                 AND tc.table_schema = kcu.table_schema \
             JOIN information_schema.constraint_column_usage ccu \
                 ON ccu.constraint_name = tc.constraint_name \
                 AND ccu.table_schema = tc.table_schema \
             JOIN information_schema.referential_constraints rc \
                 ON rc.constraint_name = tc.constraint_name \
                 AND rc.constraint_schema = tc.table_schema \
             WHERE tc.constraint_type = 'FOREIGN KEY' \
                 AND tc.table_schema = '{}' \
                 AND tc.table_name = '{}' \
             ORDER BY tc.constraint_name",
            self.current_schema, table
        );
        let (_, rows) = self.simple_query_rows(&query).await?;

        let fks = rows
            .into_iter()
            .map(|row| {
                let name = row.first().and_then(|v| v.clone()).unwrap_or_default();
                let column = row.get(1).and_then(|v| v.clone()).unwrap_or_default();
                let referenced_table = row.get(2).and_then(|v| v.clone()).unwrap_or_default();
                let referenced_column = row.get(3).and_then(|v| v.clone()).unwrap_or_default();
                let on_delete = row
                    .get(4)
                    .and_then(|v| v.clone())
                    .unwrap_or_else(|| "NO ACTION".to_string());
                let on_update = row
                    .get(5)
                    .and_then(|v| v.clone())
                    .unwrap_or_else(|| "NO ACTION".to_string());

                ForeignKeyInfo {
                    name,
                    column,
                    referenced_table,
                    referenced_column,
                    on_delete,
                    on_update,
                }
            })
            .collect();

        Ok(fks)
    }

    async fn fetch_table_ddl(&self, table: &str) -> DbResult<String> {
        let query = format!(
            "SELECT column_name, udt_name, is_nullable, column_default, \
                    character_maximum_length, numeric_precision, numeric_scale \
             FROM information_schema.columns \
             WHERE table_schema = '{}' AND table_name = '{}' \
             ORDER BY ordinal_position",
            self.current_schema, table
        );
        let (_, rows) = self.simple_query_rows(&query).await?;

        let mut col_defs: Vec<String> = Vec::new();
        for row in &rows {
            let name = row.first().and_then(|v| v.clone()).unwrap_or_default();
            let udt_name = row.get(1).and_then(|v| v.clone()).unwrap_or_default();
            let is_nullable = row
                .get(2)
                .and_then(|v| v.as_deref().map(|s| s == "YES"))
                .unwrap_or(true);
            let default = row.get(3).and_then(|v| v.clone());
            let max_len = row.get(4).and_then(|v| v.clone());
            let num_prec = row.get(5).and_then(|v| v.clone());
            let num_scale = row.get(6).and_then(|v| v.clone());

            let mut type_str = udt_name.clone();
            if let Some(len) = &max_len {
                type_str = format!("{}({})", udt_name, len);
            } else if let (Some(prec), Some(scale)) = (&num_prec, &num_scale) {
                if udt_name == "numeric" {
                    type_str = format!("numeric({},{})", prec, scale);
                }
            }

            let mut def = format!("    \"{}\" {}", name, type_str);
            if !is_nullable {
                def.push_str(" NOT NULL");
            }
            if let Some(d) = &default {
                def.push_str(&format!(" DEFAULT {}", d));
            }
            col_defs.push(def);
        }

        // Fetch primary key constraint.
        let pk_query = format!(
            "SELECT kcu.column_name \
             FROM information_schema.table_constraints tc \
             JOIN information_schema.key_column_usage kcu \
                 ON tc.constraint_name = kcu.constraint_name \
                 AND tc.table_schema = kcu.table_schema \
             WHERE tc.constraint_type = 'PRIMARY KEY' \
                 AND tc.table_schema = '{}' \
                 AND tc.table_name = '{}' \
             ORDER BY kcu.ordinal_position",
            self.current_schema, table
        );
        let (_, pk_rows) = self.simple_query_rows(&pk_query).await?;
        let pk_cols: Vec<String> = pk_rows
            .into_iter()
            .filter_map(|row| row.first().and_then(|v| v.clone()))
            .map(|c| format!("\"{}\"", c))
            .collect();

        if !pk_cols.is_empty() {
            col_defs.push(format!("    PRIMARY KEY ({})", pk_cols.join(", ")));
        }

        let ddl = format!("CREATE TABLE \"{}\" (\n{}\n);", table, col_defs.join(",\n"));

        Ok(ddl)
    }

    async fn fetch_databases(&self) -> DbResult<Vec<String>> {
        let query = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname";
        let (_, rows) = self.simple_query_rows(query).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.first().and_then(|v| v.clone()))
            .collect())
    }

    async fn fetch_schemas(&self) -> DbResult<Vec<String>> {
        let query = "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name";
        let (_, rows) = self.simple_query_rows(query).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.first().and_then(|v| v.clone()))
            .collect())
    }

    async fn fetch_table_metadata(&self, table: &str) -> DbResult<TableMetadata> {
        let query = format!(
            "SELECT pg_total_relation_size(c.oid) AS total_size, \
                    pg_relation_size(c.oid) AS data_size, \
                    pg_indexes_size(c.oid) AS index_size, \
                    c.reltuples::bigint AS approx_rows, \
                    obj_description(c.oid) AS comment \
             FROM pg_class c \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE c.relname = '{}' AND n.nspname = '{}'",
            table, self.current_schema
        );
        let (_, rows) = self.simple_query_rows(&query).await?;

        if let Some(row) = rows.first() {
            Ok(TableMetadata {
                table_name: table.to_string(),
                total_size: row.first().and_then(|v| v.as_ref()?.parse::<i64>().ok()),
                data_size: row.get(1).and_then(|v| v.as_ref()?.parse::<i64>().ok()),
                index_size: row.get(2).and_then(|v| v.as_ref()?.parse::<i64>().ok()),
                avg_row_length: None,
                row_count: row.get(3).and_then(|v| v.as_ref()?.parse::<i64>().ok()),
                comment: row.get(4).and_then(|v| v.clone()),
                engine: Some("PostgreSQL".to_string()),
                collation: None,
                create_time: None,
                update_time: None,
            })
        } else {
            Ok(TableMetadata {
                table_name: table.to_string(),
                data_size: None,
                index_size: None,
                total_size: None,
                avg_row_length: None,
                row_count: None,
                comment: None,
                engine: Some("PostgreSQL".to_string()),
                collation: None,
                create_time: None,
                update_time: None,
            })
        }
    }

    async fn fetch_database_metadata(&self, database: &str) -> DbResult<DatabaseMetadata> {
        let query = format!("SELECT pg_database_size('{}') AS size_bytes", database);
        let size = self
            .simple_query_scalar(&query)
            .await?
            .and_then(|v| v.parse::<i64>().ok());

        let table_count_query = format!(
            "SELECT COUNT(*)::int FROM information_schema.tables \
             WHERE table_catalog = '{}' AND table_schema NOT IN ('pg_catalog', 'information_schema')",
            database
        );
        let table_count = self
            .simple_query_scalar(&table_count_query)
            .await?
            .and_then(|v| v.parse::<i32>().ok());

        let system_dbs = ["template0", "template1", "postgres"];

        Ok(DatabaseMetadata {
            name: database.to_string(),
            table_count,
            size_bytes: size,
            is_system_database: system_dbs.contains(&database),
        })
    }

    async fn fetch_view_definition(&self, view: &str) -> DbResult<String> {
        let query = format!(
            "SELECT pg_get_viewdef('\"{}\".\"{}'\"::regclass, true)",
            self.current_schema, view
        );
        self.simple_query_scalar(&query)
            .await?
            .ok_or_else(|| DatabaseError::QueryFailed(format!("View '{}' not found", view)))
    }

    async fn create_database(
        &self,
        name: &str,
        charset: &str,
        collation: Option<&str>,
    ) -> DbResult<()> {
        let mut query = format!("CREATE DATABASE \"{}\" ENCODING '{}'", name, charset);
        if let Some(coll) = collation {
            query.push_str(&format!(" LC_COLLATE '{}'", coll));
        }
        let client = self.client()?;
        let client = client.lock().await;
        client
            .simple_query(&query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn fetch_approximate_row_count(&self, table: &str) -> DbResult<Option<i64>> {
        let query = format!(
            "SELECT reltuples::bigint FROM pg_class \
             WHERE relname = '{}' \
             AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '{}')",
            table, self.current_schema
        );
        let val = self.simple_query_scalar(&query).await?;
        Ok(val.and_then(|v| v.parse::<i64>().ok()))
    }

    async fn begin_transaction(&self) -> DbResult<()> {
        let client = self.client()?;
        let client = client.lock().await;
        client
            .simple_query("BEGIN")
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn commit_transaction(&self) -> DbResult<()> {
        let client = self.client()?;
        let client = client.lock().await;
        client
            .simple_query("COMMIT")
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn rollback_transaction(&self) -> DbResult<()> {
        let client = self.client()?;
        let client = client.lock().await;
        client
            .simple_query("ROLLBACK")
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn apply_query_timeout(&self, seconds: u32) -> DbResult<()> {
        let ms = seconds as u64 * 1000;
        let query = format!("SET statement_timeout = '{}'", ms);
        let client = self.client()?;
        let client = client.lock().await;
        client
            .simple_query(&query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
        Ok(())
    }
}
