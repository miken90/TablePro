use async_trait::async_trait;
use mysql_async::prelude::*;
use mysql_async::{Conn, Opts, OptsBuilder, Pool, Row as MysqlRow, SslOpts};
use std::collections::HashMap;
use std::time::Instant;

use crate::database::driver::{DatabaseDriver, DbResult};
use crate::models::*;

pub struct MySqlDriver {
    config: ConnectionConfig,
    status: ConnectionStatus,
    pool: Option<Pool>,
    server_version_str: Option<String>,
}

impl MySqlDriver {
    pub fn new(config: ConnectionConfig) -> Self {
        Self {
            config,
            status: ConnectionStatus::Disconnected,
            pool: None,
            server_version_str: None,
        }
    }

    fn get_pool(&self) -> DbResult<&Pool> {
        self.pool.as_ref().ok_or(DatabaseError::NotConnected)
    }

    async fn get_conn(&self) -> DbResult<Conn> {
        let pool = self.get_pool()?;
        pool.get_conn()
            .await
            .map_err(|e| DatabaseError::ConnectionFailed(e.to_string()))
    }

    fn is_select_query(query: &str) -> bool {
        let trimmed = query.trim_start().to_uppercase();
        trimmed.starts_with("SELECT")
            || trimmed.starts_with("SHOW")
            || trimmed.starts_with("DESCRIBE")
            || trimmed.starts_with("DESC ")
            || trimmed.starts_with("EXPLAIN")
            || trimmed.starts_with("PRAGMA")
    }

    fn is_mariadb(&self) -> bool {
        self.server_version_str
            .as_ref()
            .map(|v| v.to_lowercase().contains("mariadb"))
            .unwrap_or(false)
    }

    fn map_column_type(col: &mysql_async::Column) -> ColumnType {
        let raw = col.column_type();
        let raw_name = format!("{:?}", raw);

        use mysql_async::consts::ColumnType as CT;
        match raw {
            CT::MYSQL_TYPE_TINY => {
                if col.column_length() == 1 {
                    ColumnType::Boolean(Some(raw_name))
                } else {
                    ColumnType::Integer(Some(raw_name))
                }
            }
            CT::MYSQL_TYPE_SHORT
            | CT::MYSQL_TYPE_LONG
            | CT::MYSQL_TYPE_LONGLONG
            | CT::MYSQL_TYPE_INT24 => ColumnType::Integer(Some(raw_name)),

            CT::MYSQL_TYPE_FLOAT
            | CT::MYSQL_TYPE_DOUBLE
            | CT::MYSQL_TYPE_NEWDECIMAL
            | CT::MYSQL_TYPE_DECIMAL => ColumnType::Decimal(Some(raw_name)),

            CT::MYSQL_TYPE_DATE | CT::MYSQL_TYPE_NEWDATE => ColumnType::Date(Some(raw_name)),
            CT::MYSQL_TYPE_TIMESTAMP | CT::MYSQL_TYPE_TIMESTAMP2 => {
                ColumnType::Timestamp(Some(raw_name))
            }
            CT::MYSQL_TYPE_DATETIME | CT::MYSQL_TYPE_DATETIME2 => {
                ColumnType::DateTime(Some(raw_name))
            }
            CT::MYSQL_TYPE_TIME | CT::MYSQL_TYPE_TIME2 => ColumnType::Timestamp(Some(raw_name)),

            CT::MYSQL_TYPE_JSON => ColumnType::Json(Some(raw_name)),

            CT::MYSQL_TYPE_TINY_BLOB
            | CT::MYSQL_TYPE_MEDIUM_BLOB
            | CT::MYSQL_TYPE_LONG_BLOB
            | CT::MYSQL_TYPE_BLOB => {
                if col.character_set() == 63 {
                    ColumnType::Blob(Some(raw_name))
                } else {
                    ColumnType::Text(Some(raw_name))
                }
            }

            CT::MYSQL_TYPE_ENUM => ColumnType::Enum {
                raw_type: Some(raw_name),
                values: None,
            },
            CT::MYSQL_TYPE_SET => ColumnType::Set {
                raw_type: Some(raw_name),
                values: None,
            },

            _ => ColumnType::Text(Some(raw_name)),
        }
    }
}

#[async_trait]
impl DatabaseDriver for MySqlDriver {
    async fn connect(&mut self, password: Option<&str>) -> DbResult<()> {
        self.status = ConnectionStatus::Connecting;

        let mut opts = OptsBuilder::default()
            .ip_or_hostname(&self.config.host)
            .tcp_port(self.config.port)
            .user(Some(&self.config.username))
            .db_name(if self.config.database.is_empty() {
                None
            } else {
                Some(&self.config.database)
            });

        if let Some(pw) = password {
            opts = opts.pass(Some(pw));
        }

        if self.config.ssl_config.enabled {
            let mut ssl = SslOpts::default();
            if let Some(ref ca) = self.config.ssl_config.ca_cert_path {
                ssl = ssl.with_root_certs(vec![std::path::PathBuf::from(ca).into()]);
            }
            ssl = ssl.with_danger_accept_invalid_certs(!self.config.ssl_config.verify_server_cert);
            opts = opts.ssl_opts(Some(ssl));
        }

        let pool = Pool::new(Opts::from(opts));

        match pool.get_conn().await {
            Ok(mut conn) => {
                let version: Option<String> =
                    conn.query_first("SELECT VERSION()").await.unwrap_or(None);
                self.server_version_str = version;
                self.pool = Some(pool);
                self.status = ConnectionStatus::Connected;
                Ok(())
            }
            Err(e) => {
                self.status = ConnectionStatus::Error(e.to_string());
                Err(DatabaseError::ConnectionFailed(e.to_string()))
            }
        }
    }

    fn disconnect(&mut self) {
        if let Some(pool) = self.pool.take() {
            tokio::spawn(async move {
                let _ = pool.disconnect().await;
            });
        }
        self.server_version_str = None;
        self.status = ConnectionStatus::Disconnected;
    }

    async fn test_connection(&mut self, password: Option<&str>) -> DbResult<bool> {
        self.connect(password).await?;
        let connected = self.status.is_connected();
        self.disconnect();
        Ok(connected)
    }

    fn status(&self) -> &ConnectionStatus {
        &self.status
    }

    fn server_version(&self) -> Option<String> {
        self.server_version_str.clone()
    }

    fn db_type(&self) -> &DatabaseType {
        &self.config.db_type
    }

    async fn execute(&self, query: &str) -> DbResult<QueryResult> {
        let mut conn = self.get_conn().await?;
        let start = Instant::now();

        if Self::is_select_query(query) {
            let rows: Vec<MysqlRow> = conn
                .query(query)
                .await
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

            let elapsed = start.elapsed().as_secs_f64() * 1000.0;

            if rows.is_empty() {
                return Ok(QueryResult {
                    execution_time_ms: elapsed,
                    ..Default::default()
                });
            }

            let columns: Vec<String> = rows[0]
                .columns()
                .iter()
                .map(|c| c.name_str().to_string())
                .collect();

            let column_types: Vec<ColumnType> = rows[0]
                .columns()
                .iter()
                .map(|c| Self::map_column_type(c))
                .collect();

            let result_rows: Vec<Vec<Option<String>>> = rows
                .iter()
                .map(|row| {
                    (0..columns.len())
                        .map(|i| {
                            row.get_opt::<mysql_async::Value, _>(i)
                                .and_then(|v| v.ok())
                                .and_then(|v| match v {
                                    mysql_async::Value::NULL => None,
                                    mysql_async::Value::Bytes(b) => {
                                        Some(String::from_utf8_lossy(&b).to_string())
                                    }
                                    mysql_async::Value::Int(i) => Some(i.to_string()),
                                    mysql_async::Value::UInt(u) => Some(u.to_string()),
                                    mysql_async::Value::Float(f) => Some(f.to_string()),
                                    mysql_async::Value::Double(d) => Some(d.to_string()),
                                    mysql_async::Value::Date(y, m, d, h, mi, s, us) => {
                                        let _ = us;
                                        if h == 0 && mi == 0 && s == 0 {
                                            Some(format!("{:04}-{:02}-{:02}", y, m, d))
                                        } else {
                                            Some(format!(
                                                "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
                                                y, m, d, h, mi, s
                                            ))
                                        }
                                    }
                                    mysql_async::Value::Time(neg, d, h, m, s, us) => {
                                        let _ = us;
                                        let sign = if neg { "-" } else { "" };
                                        if d > 0 {
                                            Some(format!(
                                                "{}{}:{:02}:{:02}",
                                                sign,
                                                d * 24 + h as u32,
                                                m,
                                                s
                                            ))
                                        } else {
                                            Some(format!(
                                                "{}{:02}:{:02}:{:02}",
                                                sign, h, m, s
                                            ))
                                        }
                                    }
                                })
                        })
                        .collect()
                })
                .collect();

            Ok(QueryResult {
                columns,
                column_types,
                rows: result_rows,
                rows_affected: 0,
                execution_time_ms: elapsed,
                error: None,
                is_truncated: false,
            })
        } else {
            conn.query_drop(query)
                .await
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
            let affected = conn.affected_rows();
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;

            Ok(QueryResult {
                rows_affected: affected as i64,
                execution_time_ms: elapsed,
                ..Default::default()
            })
        }
    }

    async fn fetch_row_count(&self, query: &str) -> DbResult<i64> {
        let count_query = format!("SELECT COUNT(*) AS cnt FROM ({}) AS t", query);
        let result = self.execute(&count_query).await?;
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
        let paginated = format!("{} LIMIT {} OFFSET {}", query, limit, offset);
        self.execute(&paginated).await
    }

    async fn fetch_tables(&self) -> DbResult<Vec<TableInfo>> {
        let result = self.execute("SHOW FULL TABLES").await?;
        let tables = result
            .rows
            .iter()
            .filter_map(|row| {
                let name = row.first()?.as_ref()?.clone();
                let type_str = row.get(1)?.as_ref()?;
                let table_type = match type_str.to_uppercase().as_str() {
                    "VIEW" => TableType::View,
                    "SYSTEM VIEW" => TableType::SystemTable,
                    _ => TableType::Table,
                };
                Some(TableInfo {
                    name,
                    table_type,
                    row_count: None,
                })
            })
            .collect();
        Ok(tables)
    }

    async fn fetch_columns(&self, table: &str) -> DbResult<Vec<ColumnInfo>> {
        let query = format!("SHOW FULL COLUMNS FROM `{}`", table.replace('`', "``"));
        let result = self.execute(&query).await?;
        let columns = result
            .rows
            .iter()
            .filter_map(|row| {
                let name = row.first()?.as_ref()?.clone();
                let data_type = row.get(1)?.as_ref()?.clone();
                let collation = row.get(2)?.as_ref().cloned();
                let is_nullable = row
                    .get(3)?
                    .as_ref()
                    .map(|s| s == "YES")
                    .unwrap_or(true);
                let key = row.get(4)?.as_ref().cloned().unwrap_or_default();
                let default_value = row.get(5)?.as_ref().cloned();
                let extra = row.get(6)?.as_ref().cloned();
                let comment = row.get(8)?.as_ref().cloned();

                Some(ColumnInfo {
                    name,
                    data_type,
                    is_nullable,
                    is_primary_key: key == "PRI",
                    default_value,
                    extra,
                    charset: None,
                    collation,
                    comment,
                })
            })
            .collect();
        Ok(columns)
    }

    async fn fetch_indexes(&self, table: &str) -> DbResult<Vec<IndexInfo>> {
        let query = format!("SHOW INDEX FROM `{}`", table.replace('`', "``"));
        let result = self.execute(&query).await?;

        let mut index_map: HashMap<String, IndexInfo> = HashMap::new();

        for row in &result.rows {
            let name = row
                .get(2)
                .and_then(|v| v.as_ref())
                .cloned()
                .unwrap_or_default();
            let non_unique = row
                .get(1)
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse::<i32>().ok())
                .unwrap_or(1);
            let column = row
                .get(4)
                .and_then(|v| v.as_ref())
                .cloned()
                .unwrap_or_default();
            let idx_type = row
                .get(10)
                .and_then(|v| v.as_ref())
                .cloned()
                .unwrap_or_else(|| "BTREE".to_string());

            let entry = index_map.entry(name.clone()).or_insert_with(|| IndexInfo {
                name: name.clone(),
                columns: Vec::new(),
                is_unique: non_unique == 0,
                is_primary: name == "PRIMARY",
                index_type: idx_type,
            });
            entry.columns.push(column);
        }

        Ok(index_map.into_values().collect())
    }

    async fn fetch_foreign_keys(&self, table: &str) -> DbResult<Vec<ForeignKeyInfo>> {
        let query = format!(
            "SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, \
             kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE, rc.UPDATE_RULE \
             FROM information_schema.KEY_COLUMN_USAGE kcu \
             JOIN information_schema.REFERENTIAL_CONSTRAINTS rc \
               ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME \
               AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA \
             WHERE kcu.TABLE_SCHEMA = DATABASE() \
               AND kcu.TABLE_NAME = '{}' \
               AND kcu.REFERENCED_TABLE_NAME IS NOT NULL",
            table.replace('\'', "''")
        );
        let result = self.execute(&query).await?;
        let fks = result
            .rows
            .iter()
            .filter_map(|row| {
                Some(ForeignKeyInfo {
                    name: row.first()?.as_ref()?.clone(),
                    column: row.get(1)?.as_ref()?.clone(),
                    referenced_table: row.get(2)?.as_ref()?.clone(),
                    referenced_column: row.get(3)?.as_ref()?.clone(),
                    on_delete: row.get(4)?.as_ref()?.clone(),
                    on_update: row.get(5)?.as_ref()?.clone(),
                })
            })
            .collect();
        Ok(fks)
    }

    async fn fetch_table_ddl(&self, table: &str) -> DbResult<String> {
        let query = format!("SHOW CREATE TABLE `{}`", table.replace('`', "``"));
        let result = self.execute(&query).await?;
        result
            .rows
            .first()
            .and_then(|r| r.get(1))
            .and_then(|v| v.clone())
            .ok_or(DatabaseError::QueryFailed("No DDL returned".into()))
    }

    async fn fetch_databases(&self) -> DbResult<Vec<String>> {
        let result = self.execute("SHOW DATABASES").await?;
        let dbs = result
            .rows
            .iter()
            .filter_map(|r| r.first()?.as_ref().cloned())
            .collect();
        Ok(dbs)
    }

    async fn fetch_table_metadata(&self, table: &str) -> DbResult<TableMetadata> {
        let query = format!(
            "SELECT TABLE_NAME, DATA_LENGTH, INDEX_LENGTH, \
             DATA_LENGTH + INDEX_LENGTH AS TOTAL_SIZE, AVG_ROW_LENGTH, TABLE_ROWS, \
             TABLE_COMMENT, ENGINE, TABLE_COLLATION, CREATE_TIME, UPDATE_TIME \
             FROM information_schema.TABLES \
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}'",
            table.replace('\'', "''")
        );
        let result = self.execute(&query).await?;
        let row = result
            .rows
            .first()
            .ok_or(DatabaseError::QueryFailed("Table not found".into()))?;

        Ok(TableMetadata {
            table_name: row.first().and_then(|v| v.clone()).unwrap_or_default(),
            data_size: row
                .get(1)
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse().ok()),
            index_size: row
                .get(2)
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse().ok()),
            total_size: row
                .get(3)
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse().ok()),
            avg_row_length: row
                .get(4)
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse().ok()),
            row_count: row
                .get(5)
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse().ok()),
            comment: row.get(6).and_then(|v| v.clone()),
            engine: row.get(7).and_then(|v| v.clone()),
            collation: row.get(8).and_then(|v| v.clone()),
            create_time: row.get(9).and_then(|v| v.clone()),
            update_time: row.get(10).and_then(|v| v.clone()),
        })
    }

    async fn fetch_database_metadata(&self, database: &str) -> DbResult<DatabaseMetadata> {
        let system_dbs = ["mysql", "information_schema", "performance_schema", "sys"];
        let query = format!(
            "SELECT COUNT(*), SUM(DATA_LENGTH + INDEX_LENGTH) \
             FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{}'",
            database.replace('\'', "''")
        );
        let result = self.execute(&query).await?;
        let row = result
            .rows
            .first()
            .ok_or(DatabaseError::QueryFailed("Database not found".into()))?;

        Ok(DatabaseMetadata {
            name: database.to_string(),
            table_count: row
                .first()
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse().ok()),
            size_bytes: row
                .get(1)
                .and_then(|v| v.as_ref())
                .and_then(|s| s.parse().ok()),
            is_system_database: system_dbs.contains(&database.to_lowercase().as_str()),
        })
    }

    async fn fetch_view_definition(&self, view: &str) -> DbResult<String> {
        let query = format!("SHOW CREATE VIEW `{}`", view.replace('`', "``"));
        let result = self.execute(&query).await?;
        result
            .rows
            .first()
            .and_then(|r| r.get(1))
            .and_then(|v| v.clone())
            .ok_or(DatabaseError::QueryFailed(
                "No view definition returned".into(),
            ))
    }

    async fn create_database(
        &self,
        name: &str,
        charset: &str,
        collation: Option<&str>,
    ) -> DbResult<()> {
        let mut sql = format!(
            "CREATE DATABASE `{}` CHARACTER SET {}",
            name.replace('`', "``"),
            charset
        );
        if let Some(coll) = collation {
            sql.push_str(&format!(" COLLATE {}", coll));
        }
        self.execute(&sql).await?;
        Ok(())
    }

    async fn fetch_approximate_row_count(&self, table: &str) -> DbResult<Option<i64>> {
        let query = format!(
            "SELECT TABLE_ROWS FROM information_schema.TABLES \
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}'",
            table.replace('\'', "''")
        );
        let result = self.execute(&query).await?;
        Ok(result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_ref())
            .and_then(|s| s.parse().ok()))
    }

    async fn begin_transaction(&self) -> DbResult<()> {
        self.execute("START TRANSACTION").await?;
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

    fn cancel_query(&self) -> DbResult<()> {
        Ok(())
    }

    async fn apply_query_timeout(&self, seconds: u32) -> DbResult<()> {
        if seconds == 0 {
            return Ok(());
        }
        let query = if self.is_mariadb() {
            format!("SET SESSION max_statement_time = {}", seconds)
        } else {
            format!(
                "SET SESSION max_execution_time = {}",
                seconds as u64 * 1000
            )
        };
        self.execute(&query).await?;
        Ok(())
    }
}
