//! The core DatabaseDriver trait that all database backends implement.

use std::collections::HashMap;

use async_trait::async_trait;

use crate::models::{
    ColumnInfo, ConnectionStatus, DatabaseError, DatabaseMetadata, DatabaseType, ForeignKeyInfo,
    IndexInfo, QueryResult, TableInfo, TableMetadata,
};

pub type DbResult<T> = Result<T, DatabaseError>;

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    // Connection
    async fn connect(&mut self, password: Option<&str>) -> DbResult<()>;
    fn disconnect(&mut self);
    async fn test_connection(&mut self, password: Option<&str>) -> DbResult<bool>;
    fn status(&self) -> &ConnectionStatus;
    fn server_version(&self) -> Option<String> {
        None
    }
    fn db_type(&self) -> &DatabaseType;

    // Query execution
    async fn execute(&self, query: &str) -> DbResult<QueryResult>;
    async fn fetch_row_count(&self, query: &str) -> DbResult<i64>;
    async fn fetch_rows(&self, query: &str, offset: i64, limit: i64) -> DbResult<QueryResult>;

    // Schema operations
    async fn fetch_tables(&self) -> DbResult<Vec<TableInfo>>;
    async fn fetch_columns(&self, table: &str) -> DbResult<Vec<ColumnInfo>>;
    async fn fetch_all_columns(&self) -> DbResult<HashMap<String, Vec<ColumnInfo>>> {
        let tables = self.fetch_tables().await?;
        let mut result = HashMap::new();
        for table in &tables {
            if let Ok(columns) = self.fetch_columns(&table.name).await {
                result.insert(table.name.clone(), columns);
            }
        }
        Ok(result)
    }
    async fn fetch_indexes(&self, table: &str) -> DbResult<Vec<IndexInfo>>;
    async fn fetch_foreign_keys(&self, table: &str) -> DbResult<Vec<ForeignKeyInfo>>;
    async fn fetch_table_ddl(&self, table: &str) -> DbResult<String>;
    async fn fetch_databases(&self) -> DbResult<Vec<String>>;
    async fn fetch_schemas(&self) -> DbResult<Vec<String>> {
        Ok(Vec::new())
    }
    async fn fetch_table_metadata(&self, table: &str) -> DbResult<TableMetadata>;
    async fn fetch_database_metadata(&self, database: &str) -> DbResult<DatabaseMetadata>;
    async fn fetch_view_definition(&self, view: &str) -> DbResult<String>;
    async fn create_database(
        &self,
        name: &str,
        charset: &str,
        collation: Option<&str>,
    ) -> DbResult<()>;
    async fn fetch_approximate_row_count(&self, table: &str) -> DbResult<Option<i64>> {
        let _ = table;
        Ok(None)
    }

    // Transaction
    async fn begin_transaction(&self) -> DbResult<()>;
    async fn commit_transaction(&self) -> DbResult<()>;
    async fn rollback_transaction(&self) -> DbResult<()>;

    // Cancellation
    fn cancel_query(&self) -> DbResult<()> {
        Ok(())
    }
    async fn apply_query_timeout(&self, seconds: u32) -> DbResult<()>;
}
