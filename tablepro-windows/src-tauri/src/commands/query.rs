use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{watch, Mutex};
use uuid::Uuid;

use crate::drivers::DatabaseDriver;
use crate::models::{AppError, QueryResult};
use crate::services::sql_generator::Dialect;
use crate::services::sql_pagination::paginate_owned_query;
use crate::services::sql_quoting::quote_identifier;
use crate::services::ConnectionManager;

/// Maximum rows returned by `execute_query` before truncation.
///
/// Drivers return a complete `QueryResult` to Rust — there is no cursor or
/// chunking API in the current driver trait. Every row the driver produces is
/// materialised in memory, serialised to JSON, and sent over the Tauri IPC
/// bridge as a single message.
///
/// True streaming would require a cursor-based fetch API on the driver trait
/// plus a corresponding chunked IPC channel on the Tauri side. Until that work
/// lands, this hard cap prevents the single IPC payload from crashing or
/// hanging the WebView.
const MAX_RESULT_ROWS: usize = 50_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryStartedEvent {
    session_id: String,
    query_id: String,
    timestamp: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryProgressEvent {
    session_id: String,
    query_id: String,
    elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryCompletedEvent {
    session_id: String,
    query_id: String,
    elapsed_ms: u64,
    row_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryErrorEvent {
    session_id: String,
    query_id: String,
    elapsed_ms: u64,
    error: String,
}

fn unix_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Basic sanity check for WHERE clauses — rejects obviously dangerous patterns.
/// Not full SQL injection prevention (users have raw SQL access anyway).
/// Uses word-boundary matching for keywords to avoid false positives on column
/// names like `drop_reason` or `deletion_date`.
fn validate_where_clause(clause: &str) -> Result<(), AppError> {
    let upper = clause.to_uppercase();
    // Semicolons and comments are always suspicious in a WHERE clause
    for pat in [";", "--"] {
        if upper.contains(pat) {
            return Err(AppError::DatabaseError(format!(
                "WHERE clause contains forbidden pattern: {pat}"
            )));
        }
    }
    // SQL keywords must appear as standalone words (preceded by start or whitespace)
    for keyword in ["DROP ", "DELETE ", "ALTER ", "TRUNCATE "] {
        if is_standalone_keyword(&upper, keyword) {
            return Err(AppError::DatabaseError(format!(
                "WHERE clause contains forbidden keyword: {}",
                keyword.trim()
            )));
        }
    }
    Ok(())
}

/// Check if `keyword` appears as a standalone word in `haystack`.
/// A keyword is standalone if it's at the start or preceded by whitespace.
fn is_standalone_keyword(haystack: &str, keyword: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(keyword) {
        let abs_pos = start + pos;
        if abs_pos == 0 || haystack.as_bytes()[abs_pos - 1].is_ascii_whitespace() {
            return true;
        }
        start = abs_pos + 1;
    }
    false
}

/// Execute a SQL statement and return result set.
#[tauri::command]
pub async fn execute_query(
    app: AppHandle,
    session_id: String,
    sql: String,
    _params: Option<Vec<String>>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<QueryResult, AppError> {
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };

    let query_id = Uuid::new_v4().to_string();
    let started_at = Instant::now();

    let _ = app.emit(
        "query:started",
        QueryStartedEvent {
            session_id: session_id.clone(),
            query_id: query_id.clone(),
            timestamp: unix_timestamp_ms(),
        },
    );

    let (progress_stop_tx, mut progress_stop_rx) = watch::channel(false);
    let app_for_progress = app.clone();
    let session_for_progress = session_id.clone();
    let query_for_progress = query_id.clone();
    let progress_started_at = started_at;

    let progress_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    let _ = app_for_progress.emit(
                        "query:progress",
                        QueryProgressEvent {
                            session_id: session_for_progress.clone(),
                            query_id: query_for_progress.clone(),
                            elapsed_ms: progress_started_at.elapsed().as_millis() as u64,
                        },
                    );
                }
                changed = progress_stop_rx.changed() => {
                    if changed.is_err() || *progress_stop_rx.borrow() {
                        break;
                    }
                }
            }
        }
    });

    tracing::info!(session_id = %session_id, query_id = %query_id, "execute_query: {}", &sql);
    let execute_result = driver.execute(&sql).await;

    let _ = progress_stop_tx.send(true);
    let _ = progress_task.await;

    let elapsed_ms = started_at.elapsed().as_millis() as u64;

    match execute_result {
        Ok(mut result) => {
            let original_row_count = result.rows.len();
            let row_count = if result.affected_rows > 0 {
                result.affected_rows as usize
            } else {
                original_row_count
            };

            // Truncate oversized result sets to prevent WebView crashes.
            if original_row_count > MAX_RESULT_ROWS {
                tracing::warn!(
                    session_id = %session_id,
                    query_id = %query_id,
                    original_row_count,
                    max = MAX_RESULT_ROWS,
                    "Result truncated to fit IPC payload limit"
                );
                result.rows.truncate(MAX_RESULT_ROWS);
                result.truncated = true;
                result.total_row_count = Some(original_row_count);
            }

            let cell_count = result.rows.len() * result.columns.len();
            if cell_count > 500_000 {
                tracing::warn!(
                    session_id = %session_id,
                    query_id = %query_id,
                    cell_count,
                    "Large IPC payload may cause WebView lag"
                );
            }

            let _ = app.emit(
                "query:completed",
                QueryCompletedEvent {
                    session_id,
                    query_id,
                    elapsed_ms,
                    row_count,
                },
            );

            Ok(result)
        }
        Err(error) => {
            // Safety net: detect connection-level errors and emit connection:lost
            let error_lower = error.inner_message().to_lowercase();
            if error_lower.contains("connection")
                || error_lower.contains("broken pipe")
                || error_lower.contains("connection reset")
                || error_lower.contains("not connected")
            {
                let _ = app.emit(
                    "connection:lost",
                    serde_json::json!({
                        "sessionId": &session_id,
                        "message": error.inner_message(),
                    }),
                );
            }

            let _ = app.emit(
                "query:error",
                QueryErrorEvent {
                    session_id,
                    query_id,
                    elapsed_ms,
                    error: error.inner_message(),
                },
            );
            Err(error)
        }
    }
}

/// Fetch a paginated slice of rows from a table.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn fetch_rows(
    session_id: String,
    table: String,
    schema: Option<String>,
    where_clause: Option<String>,
    order_by: Option<String>,
    offset: u64,
    limit: u64,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<QueryResult, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)
            .map(|c| c.db_type.clone())
            .unwrap_or_default();
        (driver, driver_type)
    };
    tracing::info!(session_id = %session_id, "fetch_rows {table} offset={offset} limit={limit}");

    let qualified = match &schema {
        Some(s) if !s.is_empty() => format!("{}.{}", quote_identifier(s, &driver_type), quote_identifier(&table, &driver_type)),
        _ => quote_identifier(&table, &driver_type),
    };

    let where_part = match &where_clause {
        Some(w) if !w.trim().is_empty() => {
            validate_where_clause(w)?;
            format!(" WHERE {w}")
        }
        _ => String::new(),
    };

    let dialect = Dialect::from_db_type(&driver_type);
    let tail = match paginate_owned_query(order_by.as_deref(), limit, offset, dialect) {
        Some(tail) => tail,
        None => {
            // SQL Server pages with OFFSET/FETCH, which is only legal after an
            // ORDER BY, and the grid browses unsorted by default. Fall back to
            // a deterministic ordering derived from the table itself rather
            // than an arbitrary one that would let pages skip or repeat rows.
            let ordering = deterministic_ordering(&driver, &table, schema.as_deref(), &driver_type)
                .await?;
            paginate_owned_query(Some(&ordering), limit, offset, dialect).ok_or_else(|| {
                AppError::DatabaseError(format!(
                    "Cannot page through '{table}' without a stable ordering"
                ))
            })?
        }
    };

    let sql = format!("SELECT * FROM {qualified}{where_part}{tail}");
    driver.execute(&sql).await
}

/// Build an ordering that makes paginated browsing of `table` stable.
///
/// Prefers the primary key. Falling back to every column keeps pagination
/// stable in content terms: rows can only tie when they are identical in every
/// column, and swapping two identical rows between pages is unobservable.
async fn deterministic_ordering(
    driver: &Arc<dyn DatabaseDriver>,
    table: &str,
    schema: Option<&str>,
    driver_type: &str,
) -> Result<String, AppError> {
    let columns = driver.fetch_columns(table, schema).await?;
    if columns.is_empty() {
        return Err(AppError::DatabaseError(format!(
            "No columns found for '{table}'; cannot order rows for pagination"
        )));
    }

    let primary_keys: Vec<&crate::models::ColumnInfo> =
        columns.iter().filter(|c| c.is_primary_key).collect();
    let ordering_columns = if primary_keys.is_empty() {
        columns.iter().collect::<Vec<_>>()
    } else {
        primary_keys
    };

    Ok(ordering_columns
        .iter()
        .map(|c| quote_identifier(&c.name, driver_type))
        .collect::<Vec<_>>()
        .join(", "))
}

/// Return total row count for a table.
#[tauri::command]
pub async fn fetch_count(
    session_id: String,
    table: String,
    schema: Option<String>,
    where_clause: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<i64, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)
            .map(|c| c.db_type.clone())
            .unwrap_or_default();
        (driver, driver_type)
    };
    tracing::info!(session_id = %session_id, "fetch_count {table}");

    let qualified = match &schema {
        Some(s) if !s.is_empty() => format!("{}.{}", quote_identifier(s, &driver_type), quote_identifier(&table, &driver_type)),
        _ => quote_identifier(&table, &driver_type),
    };

    let where_part = match &where_clause {
        Some(w) if !w.trim().is_empty() => {
            validate_where_clause(w)?;
            format!(" WHERE {w}")
        }
        _ => String::new(),
    };

    let sql = format!("SELECT COUNT(*) FROM {qualified}{where_part}");
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
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
    tracing::info!(session_id = %session_id, "cancel_query");
    driver.cancel_query().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_where_clause_safe() {
        assert!(validate_where_clause("\"name\" = 'Alice'").is_ok());
        assert!(validate_where_clause("\"age\" > 18 AND \"active\" = true").is_ok());
        assert!(validate_where_clause("\"col\" IS NULL").is_ok());
    }

    #[test]
    fn test_validate_where_clause_semicolon() {
        assert!(validate_where_clause("1=1; DROP TABLE users").is_err());
    }

    #[test]
    fn test_validate_where_clause_comment() {
        assert!(validate_where_clause("1=1 -- comment").is_err());
    }

    #[test]
    fn test_validate_where_clause_drop() {
        assert!(validate_where_clause("DROP TABLE users").is_err());
        assert!(validate_where_clause("drop table users").is_err());
    }

    #[test]
    fn test_validate_where_clause_delete() {
        assert!(validate_where_clause("DELETE FROM users").is_err());
    }

    #[test]
    fn test_validate_where_clause_alter() {
        assert!(validate_where_clause("ALTER TABLE users").is_err());
    }

    #[test]
    fn test_validate_where_clause_truncate() {
        assert!(validate_where_clause("TRUNCATE TABLE users").is_err());
    }

    #[test]
    fn test_validate_where_clause_empty_string() {
        assert!(validate_where_clause("").is_ok());
    }

    #[test]
    fn test_validate_where_clause_whitespace_only() {
        assert!(validate_where_clause("   ").is_ok());
    }

    #[test]
    fn test_validate_where_clause_column_name_with_drop_prefix() {
        // Column names containing "drop" should NOT be rejected
        assert!(validate_where_clause("\"drop_reason\" = 'test'").is_ok());
        assert!(validate_where_clause("\"deleted_at\" IS NOT NULL").is_ok());
    }

    #[test]
    fn test_validate_where_clause_standalone_drop_still_caught() {
        assert!(validate_where_clause("1=1 DROP TABLE users").is_err());
    }
}
