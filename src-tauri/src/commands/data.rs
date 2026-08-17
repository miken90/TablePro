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

/// `(BEGIN, COMMIT, ROLLBACK)` for a dialect.
///
/// All drivers hold a single connection behind a mutex, so these land on the
/// same session as the statements they wrap.
fn transaction_keywords(dialect: Dialect) -> (&'static str, &'static str, &'static str) {
    match dialect {
        Dialect::Mssql => (
            "BEGIN TRANSACTION",
            "COMMIT TRANSACTION",
            "ROLLBACK TRANSACTION",
        ),
        Dialect::MySql => ("START TRANSACTION", "COMMIT", "ROLLBACK"),
        _ => ("BEGIN", "COMMIT", "ROLLBACK"),
    }
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

    // A grid save is one edit as far as the user is concerned. Executed one
    // statement at a time in autocommit, a bulk delete that failed on row 30
    // left the first 29 rows permanently gone with no way back.
    //
    // Engines that report `supports_transactions() == false` (MongoDB, Redis)
    // keep the sequential behavior — they have no SQL transaction to open, and
    // the grid save path does not reach them.
    let transactional = statements.len() > 1 && driver.supports_transactions();
    let (begin, commit, rollback) = transaction_keywords(dialect);
    if transactional {
        driver.execute(begin).await?;
    }

    for sql in &statements {
        tracing::info!(session_id = %session_id, "save_changes: {}", sql);
        executed_statements.push(sql.as_str());

        match driver.execute(sql).await {
            Ok(result) => {
                total_affected += result.affected_rows;
            }
            Err(error) => {
                if transactional {
                    if let Err(rollback_error) = driver.execute(rollback).await {
                        // Nothing better to do: report the original failure,
                        // but make the failed rollback visible.
                        tracing::error!(
                            session_id = %session_id,
                            "save_changes rollback failed: {}", rollback_error
                        );
                    }
                }
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

    if transactional {
        driver.execute(commit).await?;
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
        )?,
        other => {
            return Err(AppError::ConfigError(format!(
                "Unsupported output_format: {other}"
            )));
        }
    };

    Ok(sql)
}

#[cfg(test)]
mod tests {
    use super::transaction_keywords;
    use crate::services::sql_generator::Dialect;

    #[test]
    fn transaction_keywords_match_each_engine() {
        assert_eq!(
            transaction_keywords(Dialect::Postgres),
            ("BEGIN", "COMMIT", "ROLLBACK")
        );
        assert_eq!(
            transaction_keywords(Dialect::Sqlite),
            ("BEGIN", "COMMIT", "ROLLBACK")
        );
        // MySQL's BEGIN is a label statement in stored programs; START
        // TRANSACTION is the unambiguous spelling.
        assert_eq!(
            transaction_keywords(Dialect::MySql),
            ("START TRANSACTION", "COMMIT", "ROLLBACK")
        );
        assert_eq!(
            transaction_keywords(Dialect::Mssql),
            ("BEGIN TRANSACTION", "COMMIT TRANSACTION", "ROLLBACK TRANSACTION")
        );
    }
}
