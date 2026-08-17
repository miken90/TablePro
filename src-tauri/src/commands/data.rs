use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::{
    sql_generator::{generate_insert_sql, generate_statements, generate_update_sql, Dialect, SavePayload},
    ConnectionManager,
};
use crate::storage::history_store::HistoryStore;

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
    history_store: State<'_, Mutex<HistoryStore>>,
) -> Result<SaveResult, AppError> {
    let (driver, database_name, dialect) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id).ok();
        let database_name = config
            .as_ref()
            .map(|cfg| cfg.database.clone())
            .filter(|name| !name.trim().is_empty());
        let dialect = config
            .as_ref()
            .map(|cfg| Dialect::from_db_type(&cfg.db_type))
            .unwrap_or(Dialect::Postgres);
        (driver, database_name, dialect)
    };

    let statements = generate_statements(&payload, dialect);
    let mut total_affected = 0i64;
    let started_at = Instant::now();
    let mut executed_statements: Vec<&str> = Vec::with_capacity(statements.len());

    for sql in &statements {
        tracing::info!(session_id = %session_id, "save_changes: {}", sql);
        executed_statements.push(sql.as_str());

        match driver.execute(sql).await {
            Ok(result) => {
                total_affected += result.affected_rows;
            }
            Err(error) => {
                let elapsed_ms = started_at.elapsed().as_millis() as i64;
                let history_sql = executed_statements.join(";\n");
                let store = history_store.lock().await;
                if let Err(history_error) = store.insert_for_async(
                    &history_sql,
                    database_name.as_deref(),
                    elapsed_ms,
                    total_affected,
                    "failed",
                ) {
                    tracing::warn!(session_id = %session_id, "save_changes history insert failed: {}", history_error);
                }
                return Err(error);
            }
        }
    }

    let elapsed_ms = started_at.elapsed().as_millis() as i64;
    if !executed_statements.is_empty() {
        let history_sql = executed_statements.join(";\n");
        let store = history_store.lock().await;
        if let Err(error) = store.insert_for_async(
            &history_sql,
            database_name.as_deref(),
            elapsed_ms,
            total_affected,
            "success",
        ) {
            tracing::warn!(session_id = %session_id, "save_changes history insert failed: {}", error);
        }
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
