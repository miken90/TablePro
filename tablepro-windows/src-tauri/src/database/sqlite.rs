//! SQLite database driver implementation using rusqlite.

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use rusqlite::types::ValueRef;
use rusqlite::Connection;
use tokio::sync::Mutex;

use crate::database::driver::{DatabaseDriver, DbResult};
use crate::models::{
    ColumnInfo, ColumnType, ConnectionConfig, ConnectionStatus, DatabaseError, DatabaseMetadata,
    DatabaseType, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo, TableMetadata, TableType,
};

pub struct SqliteDriver {
    config: ConnectionConfig,
    status: ConnectionStatus,
    conn: Option<Arc<Mutex<Connection>>>,
}

impl SqliteDriver {
    pub fn new(config: ConnectionConfig) -> Self {
        Self {
            config,
            status: ConnectionStatus::Disconnected,
            conn: None,
        }
    }

    fn conn(&self) -> DbResult<Arc<Mutex<Connection>>> {
        self.conn
            .clone()
            .ok_or(DatabaseError::NotConnected)
    }
}

fn map_column_type(decl_type: Option<&str>) -> ColumnType {
    let raw = match decl_type {
        Some(t) => t,
        None => return ColumnType::Text(None),
    };
    let upper = raw.to_uppercase();
    if upper.contains("INT") {
        ColumnType::Integer(Some(raw.to_string()))
    } else if upper.contains("CHAR") || upper.contains("CLOB") || upper.contains("TEXT") {
        ColumnType::Text(Some(raw.to_string()))
    } else if upper.contains("BLOB") || upper.is_empty() {
        ColumnType::Blob(Some(raw.to_string()))
    } else if upper.contains("REAL") || upper.contains("FLOA") || upper.contains("DOUB") {
        ColumnType::Decimal(Some(raw.to_string()))
    } else if upper.contains("BOOL") {
        ColumnType::Boolean(Some(raw.to_string()))
    } else if upper.contains("JSON") {
        ColumnType::Json(Some(raw.to_string()))
    } else if upper.contains("DATETIME") || upper.contains("TIMESTAMP") {
        ColumnType::Timestamp(Some(raw.to_string()))
    } else if upper.contains("DATE") {
        ColumnType::Date(Some(raw.to_string()))
    } else if upper.contains("TIME") {
        ColumnType::Timestamp(Some(raw.to_string()))
    } else {
        ColumnType::Text(Some(raw.to_string()))
    }
}

fn value_ref_to_string(val: ValueRef<'_>) -> Option<String> {
    match val {
        ValueRef::Null => None,
        ValueRef::Integer(i) => Some(i.to_string()),
        ValueRef::Real(f) => Some(f.to_string()),
        ValueRef::Text(t) => Some(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(b) => Some(format!("[{} bytes]", b.len())),
    }
}

fn is_select_like(query: &str) -> bool {
    let trimmed = query.trim_start().to_uppercase();
    trimmed.starts_with("SELECT")
        || trimmed.starts_with("PRAGMA")
        || trimmed.starts_with("EXPLAIN")
        || trimmed.starts_with("WITH")
}

#[async_trait]
impl DatabaseDriver for SqliteDriver {
    async fn connect(&mut self, _password: Option<&str>) -> DbResult<()> {
        let path = self.config.database.clone();
        self.status = ConnectionStatus::Connecting;

        let conn = tokio::task::spawn_blocking(move || {
            Connection::open(&path).map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))
        })
        .await
        .map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))??;

        // Set pragmas
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))?;

        self.conn = Some(Arc::new(Mutex::new(conn)));
        self.status = ConnectionStatus::Connected;
        Ok(())
    }

    fn disconnect(&mut self) {
        self.conn = None;
        self.status = ConnectionStatus::Disconnected;
    }

    async fn test_connection(&mut self, password: Option<&str>) -> DbResult<bool> {
        self.connect(password).await?;
        self.disconnect();
        Ok(true)
    }

    fn status(&self) -> &ConnectionStatus {
        &self.status
    }

    fn server_version(&self) -> Option<String> {
        Some(rusqlite::version().to_string())
    }

    fn db_type(&self) -> &DatabaseType {
        &self.config.db_type
    }

    async fn execute(&self, query: &str) -> DbResult<QueryResult> {
        let conn = self.conn()?;
        let query = query.to_string();
        let is_select = is_select_like(&query);

        tokio::task::spawn_blocking(move || {
            let start = Instant::now();
            let conn = conn.blocking_lock();

            if is_select {
                let mut stmt = conn
                    .prepare(&query)
                    .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

                let columns: Vec<String> = stmt
                    .column_names()
                    .iter()
                    .map(|s| s.to_string())
                    .collect();

                let column_types: Vec<ColumnType> = stmt
                    .columns()
                    .iter()
                    .map(|c| map_column_type(c.decl_type()))
                    .collect();

                let col_count = columns.len();
                let mut rows: Vec<Vec<Option<String>>> = Vec::new();

                let mut result_rows = stmt
                    .query([])
                    .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

                while let Some(row) = result_rows
                    .next()
                    .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
                {
                    let mut row_data = Vec::with_capacity(col_count);
                    for i in 0..col_count {
                        let val = row
                            .get_ref(i)
                            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
                        row_data.push(value_ref_to_string(val));
                    }
                    rows.push(row_data);
                }

                Ok(QueryResult {
                    columns,
                    column_types,
                    rows_affected: rows.len() as i64,
                    rows,
                    execution_time_ms: start.elapsed().as_secs_f64() * 1000.0,
                    error: None,
                    is_truncated: false,
                })
            } else {
                let affected = conn
                    .execute(&query, [])
                    .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

                Ok(QueryResult {
                    rows_affected: affected as i64,
                    execution_time_ms: start.elapsed().as_secs_f64() * 1000.0,
                    ..Default::default()
                })
            }
        })
        .await
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
    }

    async fn fetch_row_count(&self, query: &str) -> DbResult<i64> {
        let wrapped = format!("SELECT COUNT(*) FROM ({query})");
        let result = self.execute(&wrapped).await?;
        let count = result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_ref())
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        Ok(count)
    }

    async fn fetch_rows(&self, query: &str, offset: i64, limit: i64) -> DbResult<QueryResult> {
        let paginated = format!("{query} LIMIT {limit} OFFSET {offset}");
        self.execute(&paginated).await
    }

    async fn fetch_tables(&self) -> DbResult<Vec<TableInfo>> {
        let conn = self.conn()?;

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let mut stmt = conn
                .prepare(
                    "SELECT name, type FROM sqlite_master \
                     WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' \
                     ORDER BY name",
                )
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            let tables = stmt
                .query_map([], |row| {
                    let name: String = row.get(0)?;
                    let kind: String = row.get(1)?;
                    Ok(TableInfo {
                        name,
                        table_type: if kind == "view" {
                            TableType::View
                        } else {
                            TableType::Table
                        },
                        row_count: None,
                    })
                })
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            Ok(tables)
        })
        .await
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
    }

    async fn fetch_columns(&self, table: &str) -> DbResult<Vec<ColumnInfo>> {
        let conn = self.conn()?;
        let table = table.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let mut stmt = conn
                .prepare(&format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")))
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            let columns = stmt
                .query_map([], |row| {
                    let name: String = row.get(1)?;
                    let data_type: String = row.get(2)?;
                    let notnull: i32 = row.get(3)?;
                    let dflt_value: Option<String> = row.get(4)?;
                    let pk: i32 = row.get(5)?;

                    Ok(ColumnInfo {
                        name,
                        data_type,
                        is_nullable: notnull == 0,
                        is_primary_key: pk > 0,
                        default_value: dflt_value,
                        extra: None,
                        charset: None,
                        collation: None,
                        comment: None,
                    })
                })
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            Ok(columns)
        })
        .await
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
    }

    async fn fetch_indexes(&self, table: &str) -> DbResult<Vec<IndexInfo>> {
        let conn = self.conn()?;
        let table = table.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let escaped = table.replace('"', "\"\"");

            let mut list_stmt = conn
                .prepare(&format!("PRAGMA index_list(\"{}\")", escaped))
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            let index_list: Vec<(String, bool)> = list_stmt
                .query_map([], |row| {
                    let name: String = row.get(1)?;
                    let unique: i32 = row.get(2)?;
                    Ok((name, unique == 1))
                })
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            let mut indexes = Vec::new();
            for (idx_name, is_unique) in &index_list {
                let escaped_idx = idx_name.replace('"', "\"\"");
                let mut info_stmt = conn
                    .prepare(&format!("PRAGMA index_info(\"{}\")", escaped_idx))
                    .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

                let columns: Vec<String> = info_stmt
                    .query_map([], |row| {
                        let col_name: String = row.get(2)?;
                        Ok(col_name)
                    })
                    .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

                let is_primary = idx_name.starts_with("sqlite_autoindex_");
                indexes.push(IndexInfo {
                    name: idx_name.clone(),
                    columns,
                    is_unique: *is_unique,
                    is_primary,
                    index_type: "BTREE".to_string(),
                });
            }

            Ok(indexes)
        })
        .await
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
    }

    async fn fetch_foreign_keys(&self, table: &str) -> DbResult<Vec<ForeignKeyInfo>> {
        let conn = self.conn()?;
        let table = table.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            let escaped = table.replace('"', "\"\"");
            let mut stmt = conn
                .prepare(&format!("PRAGMA foreign_key_list(\"{}\")", escaped))
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            let mut fks = Vec::new();
            let mut rows = stmt
                .query([])
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            while let Some(row) = rows
                .next()
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
            {
                let id: i32 = row.get(0).map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
                let ref_table: String = row.get(2).map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
                let from: String = row.get(3).map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
                let to: String = row.get(4).map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
                let on_update: String = row.get(5).map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
                let on_delete: String = row.get(6).map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

                fks.push(ForeignKeyInfo {
                    name: format!("fk_{}_{}", table, id),
                    column: from,
                    referenced_table: ref_table,
                    referenced_column: to,
                    on_delete,
                    on_update,
                });
            }

            Ok(fks)
        })
        .await
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
    }

    async fn fetch_table_ddl(&self, table: &str) -> DbResult<String> {
        let result = self
            .execute(&format!(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='{}'",
                table.replace('\'', "''")
            ))
            .await?;

        result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.clone())
            .ok_or_else(|| DatabaseError::QueryFailed(format!("Table '{}' not found", table)))
    }

    async fn fetch_databases(&self) -> DbResult<Vec<String>> {
        Ok(vec![self.config.database.clone()])
    }

    async fn fetch_table_metadata(&self, table: &str) -> DbResult<TableMetadata> {
        let count_result = self
            .execute(&format!(
                "SELECT COUNT(*) FROM \"{}\"",
                table.replace('"', "\"\"")
            ))
            .await?;

        let row_count = count_result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_ref())
            .and_then(|s| s.parse::<i64>().ok());

        Ok(TableMetadata {
            table_name: table.to_string(),
            data_size: None,
            index_size: None,
            total_size: None,
            avg_row_length: None,
            row_count,
            comment: None,
            engine: Some("SQLite".to_string()),
            collation: None,
            create_time: None,
            update_time: None,
        })
    }

    async fn fetch_database_metadata(&self, _database: &str) -> DbResult<DatabaseMetadata> {
        let table_count_result = self
            .execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'",
            )
            .await?;

        let table_count = table_count_result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_ref())
            .and_then(|s| s.parse::<i32>().ok());

        let size_bytes = Path::new(&self.config.database)
            .metadata()
            .ok()
            .map(|m| m.len() as i64);

        Ok(DatabaseMetadata {
            name: self.config.database.clone(),
            table_count,
            size_bytes,
            is_system_database: false,
        })
    }

    async fn fetch_view_definition(&self, view: &str) -> DbResult<String> {
        let result = self
            .execute(&format!(
                "SELECT sql FROM sqlite_master WHERE type='view' AND name='{}'",
                view.replace('\'', "''")
            ))
            .await?;

        result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.clone())
            .ok_or_else(|| DatabaseError::QueryFailed(format!("View '{}' not found", view)))
    }

    async fn create_database(
        &self,
        _name: &str,
        _charset: &str,
        _collation: Option<&str>,
    ) -> DbResult<()> {
        Ok(())
    }

    async fn fetch_approximate_row_count(&self, table: &str) -> DbResult<Option<i64>> {
        let result = self
            .execute(&format!(
                "SELECT COUNT(*) FROM \"{}\"",
                table.replace('"', "\"\"")
            ))
            .await?;

        let count = result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_ref())
            .and_then(|s| s.parse::<i64>().ok());

        Ok(count)
    }

    async fn begin_transaction(&self) -> DbResult<()> {
        self.execute("BEGIN").await?;
        Ok(())
    }

    async fn commit_transaction(&self) -> DbResult<()> {
        self.execute("COMMIT").await?;
        Ok(())
    }

    async fn rollback_transaction(&self) -> DbResult<()> {
        self.execute("ROLLBACK").await?;
        Ok(())
    }

    async fn apply_query_timeout(&self, seconds: u32) -> DbResult<()> {
        let conn = self.conn()?;

        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            conn.busy_timeout(Duration::from_secs(seconds as u64))
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))
        })
        .await
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?
    }
}
