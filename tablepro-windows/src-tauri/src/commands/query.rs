use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, QueryResult};
use crate::services::ConnectionManager;

/// Execute a SQL statement and return result set.
#[tauri::command]
pub async fn execute_query(
    session_id: String,
    sql: String,
    _params: Option<Vec<String>>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<QueryResult, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "execute_query: {}", &sql);
    driver.execute(&sql).await
}

/// Fetch a paginated slice of rows from a table.
#[tauri::command]
pub async fn fetch_rows(
    session_id: String,
    table: String,
    schema: Option<String>,
    offset: u64,
    limit: u64,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<QueryResult, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_rows {table} offset={offset} limit={limit}");

    let qualified = match &schema {
        Some(s) if !s.is_empty() => format!("\"{s}\".\"{table}\""),
        _ => format!("\"{table}\""),
    };
    let sql = format!("SELECT * FROM {qualified} LIMIT {limit} OFFSET {offset}");
    driver.execute(&sql).await
}

/// Return total row count for a table.
#[tauri::command]
pub async fn fetch_count(
    session_id: String,
    table: String,
    schema: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<i64, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "fetch_count {table}");

    let qualified = match &schema {
        Some(s) if !s.is_empty() => format!("\"{s}\".\"{table}\""),
        _ => format!("\"{table}\""),
    };
    let sql = format!("SELECT COUNT(*) FROM {qualified}");
    let result = driver.execute(&sql).await?;
    let count = result
        .rows
        .first()
        .and_then(|r| r.first())
        .and_then(|v| v.as_deref())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    Ok(count)
}

/// Cancel an in-flight query.
#[tauri::command]
pub async fn cancel_query(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<(), AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;
    tracing::info!(session_id = %session_id, "cancel_query");
    driver.cancel_query()
}
