use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::{
    sql_generator::{generate_statements, SavePayload},
    ConnectionManager,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub rows_affected: i64,
    pub statements_executed: usize,
}

#[tauri::command]
pub async fn save_changes(
    session_id: String,
    payload: SavePayload,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<SaveResult, AppError> {
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;

    let statements = generate_statements(&payload);
    let mut total_affected = 0i64;

    for sql in &statements {
        tracing::info!(session_id = %session_id, "save_changes: {}", sql);
        let result = driver.execute(sql).await?;
        total_affected += result.affected_rows;
    }

    Ok(SaveResult {
        rows_affected: total_affected,
        statements_executed: statements.len(),
    })
}
