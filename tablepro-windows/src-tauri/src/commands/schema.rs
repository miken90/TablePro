use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, TableInfo};
use crate::services::ConnectionManager;

/// Return all tables/views in the connected database.
#[tauri::command]
pub async fn fetch_tables(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<TableInfo>, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_tables");
    driver.fetch_tables().await
}

/// Return column metadata for a specific table.
#[tauri::command]
pub async fn fetch_columns(
    session_id: String,
    table: String,
    schema: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<ColumnInfo>, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_columns {schema:?}.{table}");
    driver.fetch_columns(&table, schema.as_deref()).await
}

/// Return indexes for a table.
#[tauri::command]
pub async fn fetch_indexes(
    session_id: String,
    table: String,
    schema: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<IndexInfo>, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_indexes {schema:?}.{table}");
    driver.fetch_indexes(&table, schema.as_deref()).await
}

/// Return foreign keys for a table.
#[tauri::command]
pub async fn fetch_foreign_keys(
    session_id: String,
    table: String,
    schema: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<ForeignKeyInfo>, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_foreign_keys {schema:?}.{table}");
    driver.fetch_foreign_keys(&table, schema.as_deref()).await
}

/// Return available databases on the server.
#[tauri::command]
pub async fn fetch_databases(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<String>, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_databases");
    driver.fetch_databases().await
}

/// Return DDL for a table.
#[tauri::command]
pub async fn fetch_ddl(
    session_id: String,
    table: String,
    schema: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_ddl {schema:?}.{table}");
    driver.fetch_ddl(&table, schema.as_deref()).await
}

/// Switch the active database for a session (reconnects under the hood).
#[tauri::command]
pub async fn switch_database(
    session_id: String,
    database: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<(), AppError> {
    let mut mgr = manager.lock().await;
    tracing::info!(session_id = %session_id, database = %database, "switch_database");
    mgr.switch_database(&session_id, &database).await
}

/// Return available schemas for the connected PostgreSQL database.
/// Returns an empty list for non-PostgreSQL drivers that don't expose schemas.
#[tauri::command]
pub async fn fetch_schemas(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<String>, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_schemas");
    let result = driver
        .execute(
            "SELECT schema_name FROM information_schema.schemata \
             WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
             ORDER BY schema_name",
        )
        .await?;
    Ok(result
        .rows
        .iter()
        .filter_map(|r| r.first().and_then(|v| v.clone()))
        .collect())
}
