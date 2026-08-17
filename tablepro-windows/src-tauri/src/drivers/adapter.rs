//! Adapts a `driver_common::DatabaseDriver` to the host's
//! `crate::drivers::DatabaseDriver` trait, converting types and errors
//! at the boundary.

use async_trait::async_trait;

use driver_common::DatabaseDriver as DcDriver;

use crate::drivers::conv::{
    col_from_dc, driver_err_to_app, fk_from_dc, index_from_dc, query_result_from_dc, table_from_dc,
};
use crate::models::{AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo};
use crate::drivers::DatabaseDriver;

/// Wraps an inner driver_common driver behind the host's trait.
pub struct HostDriverAdapter {
    inner: Box<dyn DcDriver>,
    type_id: String,
}

impl HostDriverAdapter {
    pub fn new(inner: Box<dyn DcDriver>) -> Self {
        let type_id = inner.database_type_id().to_string();
        Self { inner, type_id }
    }
}

#[async_trait]
impl DatabaseDriver for HostDriverAdapter {
    async fn connect(&self) -> Result<(), AppError> {
        self.inner.connect().await.map_err(driver_err_to_app)
    }

    fn disconnect(&self) {
        self.inner.disconnect();
    }

    async fn ping(&self) -> Result<(), AppError> {
        self.inner.ping().await.map_err(driver_err_to_app)
    }

    async fn execute(&self, query: &str) -> Result<QueryResult, AppError> {
        self.inner
            .execute(query)
            .await
            .map(query_result_from_dc)
            .map_err(driver_err_to_app)
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        self.inner
            .fetch_tables()
            .await
            .map(|v| v.into_iter().map(table_from_dc).collect())
            .map_err(driver_err_to_app)
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, AppError> {
        self.inner
            .fetch_columns(table, schema)
            .await
            .map(|v| v.into_iter().map(col_from_dc).collect())
            .map_err(driver_err_to_app)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, AppError> {
        self.inner
            .fetch_indexes(table, schema)
            .await
            .map(|v| v.into_iter().map(index_from_dc).collect())
            .map_err(driver_err_to_app)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, AppError> {
        self.inner
            .fetch_foreign_keys(table, schema)
            .await
            .map(|v| v.into_iter().map(fk_from_dc).collect())
            .map_err(driver_err_to_app)
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, AppError> {
        self.inner.fetch_databases().await.map_err(driver_err_to_app)
    }

    async fn fetch_ddl(&self, table: &str, schema: Option<&str>) -> Result<String, AppError> {
        self.inner
            .fetch_ddl(table, schema)
            .await
            .map_err(driver_err_to_app)
    }

    fn cancel_query(&self) -> Result<(), AppError> {
        self.inner.cancel_query().map_err(driver_err_to_app)
    }

    fn supports_schemas(&self) -> bool {
        self.inner.supports_schemas()
    }

    fn supports_transactions(&self) -> bool {
        self.inner.supports_transactions()
    }

    fn database_type_id(&self) -> &str {
        &self.type_id
    }
}
