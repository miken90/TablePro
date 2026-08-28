use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use tokio::sync::Mutex;

use crate::drivers::DatabaseDriver;
use crate::models::AppError;
use crate::services::{
    sql_generator::{
        generate_insert_sql, generate_update_sql, plan_save, Dialect, SavePayload, SavePlan,
    },
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

/// What a save or a preview needs from the session: the driver to run on, the
/// database name history rows are filed under, and the dialect to generate in.
type SaveSession = (Arc<dyn DatabaseDriver>, Option<String>, Dialect);

/// Driver, database name and dialect for a save or a preview on `session_id`.
///
/// Both commands resolve through here, so the `Postgres` fallback for a
/// session whose config has gone and the driver that answers
/// `supports_transactions()` are decided once for the pair.
fn resolve_save_session(
    mgr: &ConnectionManager,
    session_id: &str,
) -> Result<SaveSession, AppError> {
    let driver = mgr.get_driver(session_id)?;
    let config = mgr.get_config(session_id).ok();
    let database_name = config
        .as_ref()
        .map(|cfg| cfg.database.clone())
        .filter(|name| !name.trim().is_empty());
    let dialect = config
        .as_ref()
        .map(|cfg| Dialect::from_db_type(&cfg.db_type))
        .unwrap_or(Dialect::Postgres);
    Ok((driver, database_name, dialect))
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
        resolve_save_session(&mgr, &session_id)?
    };

    let plan = plan_save(&payload, dialect, driver.supports_transactions())?;

    execute_plan(
        driver.as_ref(),
        &plan.statements,
        plan.transactional,
        (plan.begin, plan.commit, plan.rollback),
        &history_store,
        &database_name,
        &session_id,
    )
    .await
}

/// The statements `save_changes` would run for this payload, and nothing else
/// — no execution, no history row.
///
/// Preview and execute share `plan_save`, so a preview that shows three
/// statements wrapped in `BEGIN TRANSACTION` is the literal thing the driver
/// will be handed.
#[tauri::command]
pub async fn preview_statements(
    session_id: String,
    payload: SavePayload,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<SavePlan, AppError> {
    let (driver, _database_name, dialect) = {
        let mgr = manager.lock().await;
        resolve_save_session(&mgr, &session_id)?
    };

    plan_save(&payload, dialect, driver.supports_transactions())
}

/// Run a prepared statement list on `driver`, wrapping it in a transaction
/// when `transactional`, and record the attempt in query history.
///
/// Executes exactly `statements`, in order, and nothing else.
async fn execute_plan(
    driver: &dyn DatabaseDriver,
    statements: &[String],
    transactional: bool,
    keywords: (&'static str, &'static str, &'static str),
    history_store: &Mutex<HistoryStore>,
    database_name: &Option<String>,
    session_id: &str,
) -> Result<SaveResult, AppError> {
    let mut total_affected = 0i64;
    let started_at = Instant::now();
    let mut executed_statements: Vec<&str> = Vec::with_capacity(statements.len());

    let (begin, commit, rollback) = keywords;
    if transactional {
        driver.execute(begin).await?;
    }

    for sql in statements {
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
    use super::execute_plan;
    use crate::drivers::DatabaseDriver;
    use crate::models::{
        AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo,
    };
    use crate::storage::history_store::HistoryStore;
    use async_trait::async_trait;
    use std::sync::Mutex as StdMutex;
    use tokio::sync::Mutex;

    /// Records every `execute` it is handed and can fail on one exact
    /// statement. The recorded list is the whole point: it is the only way to
    /// see what the save path actually sent, as opposed to what it planned.
    struct FakeDriver {
        executed: StdMutex<Vec<String>>,
        fail_on: Option<String>,
        affected_per_statement: i64,
        supports_transactions: bool,
    }

    impl FakeDriver {
        fn new() -> Self {
            Self {
                executed: StdMutex::new(Vec::new()),
                fail_on: None,
                affected_per_statement: 0,
                supports_transactions: true,
            }
        }

        fn failing_on(sql: &str) -> Self {
            Self {
                fail_on: Some(sql.to_string()),
                ..Self::new()
            }
        }

        fn affecting(rows: i64) -> Self {
            Self {
                affected_per_statement: rows,
                ..Self::new()
            }
        }

        fn recorded(&self) -> Vec<String> {
            self.executed.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl DatabaseDriver for FakeDriver {
        async fn connect(&self) -> Result<(), AppError> {
            Ok(())
        }
        fn disconnect(&self) {}
        async fn ping(&self) -> Result<(), AppError> {
            Ok(())
        }
        async fn execute(&self, query: &str) -> Result<QueryResult, AppError> {
            self.executed.lock().unwrap().push(query.to_string());
            if self.fail_on.as_deref() == Some(query) {
                return Err(AppError::DatabaseError("boom".to_string()));
            }
            Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                affected_rows: self.affected_per_statement,
                execution_time_ms: 0.0,
                truncated: false,
                total_row_count: None,
            })
        }
        async fn fetch_tables(&self) -> Result<Vec<TableInfo>, AppError> {
            Ok(vec![])
        }
        async fn fetch_columns(
            &self,
            _table: &str,
            _schema: Option<&str>,
        ) -> Result<Vec<ColumnInfo>, AppError> {
            Ok(vec![])
        }
        async fn fetch_indexes(
            &self,
            _table: &str,
            _schema: Option<&str>,
        ) -> Result<Vec<IndexInfo>, AppError> {
            Ok(vec![])
        }
        async fn fetch_foreign_keys(
            &self,
            _table: &str,
            _schema: Option<&str>,
        ) -> Result<Vec<ForeignKeyInfo>, AppError> {
            Ok(vec![])
        }
        async fn fetch_databases(&self) -> Result<Vec<String>, AppError> {
            Ok(vec![])
        }
        async fn fetch_ddl(&self, _table: &str, _schema: Option<&str>) -> Result<String, AppError> {
            Ok(String::new())
        }
        async fn cancel_query(&self) -> Result<(), AppError> {
            Ok(())
        }
        fn supports_schemas(&self) -> bool {
            true
        }
        fn supports_transactions(&self) -> bool {
            self.supports_transactions
        }
        fn database_type_id(&self) -> &str {
            "fake"
        }
    }

    fn history() -> Mutex<HistoryStore> {
        Mutex::new(HistoryStore::new_in_memory().expect("in-memory history store"))
    }

    fn statements(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    const PG: (&str, &str, &str) = ("BEGIN", "COMMIT", "ROLLBACK");
    const MSSQL: (&str, &str, &str) = (
        "BEGIN TRANSACTION",
        "COMMIT TRANSACTION",
        "ROLLBACK TRANSACTION",
    );

    /// One statement is not worth a transaction: it runs in autocommit and no
    /// BEGIN or COMMIT reaches the driver.
    #[tokio::test(flavor = "multi_thread")]
    async fn single_statement_runs_in_autocommit() {
        let driver = FakeDriver::new();
        let store = history();
        let stmts = statements(&["UPDATE t SET a=1 WHERE id=1"]);

        execute_plan(&driver, &stmts, false, PG, &store, &None, "s1")
            .await
            .expect("save");

        assert_eq!(driver.recorded(), vec!["UPDATE t SET a=1 WHERE id=1"]);
    }

    /// The tripwire: what the driver saw is the begin keyword, then exactly
    /// the planned statements in order, then the commit keyword — nothing
    /// added, filtered or reordered between the plan and the wire.
    #[tokio::test(flavor = "multi_thread")]
    async fn multi_statement_wraps_the_plan_exactly() {
        let driver = FakeDriver::new();
        let store = history();
        let stmts = statements(&[
            "UPDATE t SET a=1 WHERE id=1",
            "UPDATE t SET a=2 WHERE id=2",
            "DELETE FROM t WHERE id=3",
        ]);

        execute_plan(&driver, &stmts, true, PG, &store, &None, "s1")
            .await
            .expect("save");

        let mut expected = vec![PG.0.to_string()];
        expected.extend(stmts.iter().cloned());
        expected.push(PG.1.to_string());
        assert_eq!(driver.recorded(), expected);
    }

    /// The dialect's own keywords are the ones that reach the driver.
    #[tokio::test(flavor = "multi_thread")]
    async fn the_wrapper_uses_the_dialect_keywords() {
        let driver = FakeDriver::new();
        let store = history();
        let stmts = statements(&["UPDATE t SET a=1", "UPDATE t SET a=2"]);

        execute_plan(&driver, &stmts, true, MSSQL, &store, &None, "s1")
            .await
            .expect("save");

        assert_eq!(
            driver.recorded(),
            vec![
                "BEGIN TRANSACTION",
                "UPDATE t SET a=1",
                "UPDATE t SET a=2",
                "COMMIT TRANSACTION",
            ]
        );
    }

    /// A failure rolls back and returns the driver's own error, not a
    /// rewritten one, and the statements after the failure never run.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_failure_rolls_back_and_returns_the_original_error() {
        let driver = FakeDriver::failing_on("UPDATE t SET a=2 WHERE id=2");
        let store = history();
        let stmts = statements(&[
            "UPDATE t SET a=1 WHERE id=1",
            "UPDATE t SET a=2 WHERE id=2",
            "DELETE FROM t WHERE id=3",
        ]);

        let error = execute_plan(&driver, &stmts, true, PG, &store, &None, "s1")
            .await
            .expect_err("must fail");

        assert!(matches!(error, AppError::DatabaseError(ref m) if m == "boom"));
        assert_eq!(
            driver.recorded(),
            vec![
                "BEGIN",
                "UPDATE t SET a=1 WHERE id=1",
                "UPDATE t SET a=2 WHERE id=2",
                "ROLLBACK",
            ]
        );
    }

    /// History carries what was attempted, joined, under `failed`.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_failure_writes_a_failed_history_row() {
        let driver = FakeDriver::failing_on("UPDATE t SET a=2");
        let store = history();
        let stmts = statements(&["UPDATE t SET a=1", "UPDATE t SET a=2"]);

        execute_plan(
            &driver,
            &stmts,
            true,
            PG,
            &store,
            &Some("shop".to_string()),
            "s1",
        )
        .await
        .expect_err("must fail");

        let entries = store.lock().await.fetch_recent(10).expect("history");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].status, "failed");
        assert_eq!(entries[0].query, "UPDATE t SET a=1;\nUPDATE t SET a=2");
        assert_eq!(entries[0].database.as_deref(), Some("shop"));
    }

    /// A completed save writes one `success` row carrying the joined SQL.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_completed_save_writes_a_success_history_row() {
        let driver = FakeDriver::new();
        let store = history();
        let stmts = statements(&["UPDATE t SET a=1", "UPDATE t SET a=2"]);

        execute_plan(&driver, &stmts, true, PG, &store, &None, "s1")
            .await
            .expect("save");

        let entries = store.lock().await.fetch_recent(10).expect("history");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].status, "success");
        assert_eq!(entries[0].query, "UPDATE t SET a=1;\nUPDATE t SET a=2");
    }

    /// `rows_affected` sums the statements only — the BEGIN and COMMIT the
    /// driver also executed contribute nothing — and `statements_executed`
    /// counts the plan.
    #[tokio::test(flavor = "multi_thread")]
    async fn the_result_sums_affected_rows_and_counts_statements() {
        let driver = FakeDriver::affecting(4);
        let store = history();
        let stmts = statements(&["UPDATE t SET a=1", "UPDATE t SET a=2", "UPDATE t SET a=3"]);

        let result = execute_plan(&driver, &stmts, true, PG, &store, &None, "s1")
            .await
            .expect("save");

        assert_eq!(result.rows_affected, 12);
        assert_eq!(result.statements_executed, 3);
    }
}
