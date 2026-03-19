use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::{
    sql_generator::{generate_insert_sql, generate_statements, generate_update_sql, SavePayload},
    ConnectionManager,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRowSqlPayload {
    pub table: String,
    pub schema: Option<String>,
    pub columns: Vec<String>,
    pub primary_keys: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub output_format: String,
}

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
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };

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

#[tauri::command]
pub async fn generate_row_sql(
    session_id: String,
    payload: GenerateRowSqlPayload,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    let driver_type = {
        let mgr = manager.lock().await;
        let config = mgr.get_config(&session_id)?;
        config.db_type.clone()
    };

    let format = payload.output_format.to_ascii_uppercase();
    let sql = match format.as_str() {
        "INSERT" => generate_insert_sql(
            &payload.table,
            payload.schema.as_deref(),
            &payload.columns,
            &payload.rows,
            &driver_type,
        ),
        "UPDATE" => generate_update_sql(
            &payload.table,
            payload.schema.as_deref(),
            &payload.columns,
            &payload.rows,
            &payload.primary_keys,
            &driver_type,
        ),
        other => {
            return Err(AppError::ConfigError(format!(
                "Unsupported output_format: {other}"
            )));
        }
    };

    Ok(sql)
}
