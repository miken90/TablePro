use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::sql_quoting::quote_identifier;
use crate::services::ConnectionManager;

/// Maximum rows per INSERT VALUES batch.
const BATCH_SIZE: usize = 500;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkResult {
    pub rows_affected: i64,
    pub batches_executed: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterCondition {
    pub column: String,
    pub operator: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnUpdate {
    pub column: String,
    pub value: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Escape a string value for safe inclusion in a SQL literal.
fn sql_literal(value: &Option<String>) -> String {
    match value {
        None => "NULL".to_string(),
        Some(s) if s.is_empty() => "''".to_string(),
        Some(s) => {
            // Only emit integers unquoted; everything else (floats, NaN, Infinity, text) gets quoted
            if s.parse::<i64>().is_ok() {
                s.clone()
            } else {
                format!("'{}'", s.replace('\'', "''"))
            }
        }
    }
}

/// Build a qualified table name from table + optional schema.
fn qualified_table(table: &str, schema: &Option<String>, driver_type: &str) -> String {
    match schema {
        Some(s) if !s.is_empty() => format!(
            "{}.{}",
            quote_identifier(s, driver_type),
            quote_identifier(table, driver_type)
        ),
        _ => quote_identifier(table, driver_type),
    }
}

/// Build a WHERE clause from structured filter conditions.
/// Validates each operator against an allow-list to prevent injection.
fn build_filter_where(
    filters: &[FilterCondition],
    driver_type: &str,
) -> Result<String, AppError> {
    if filters.is_empty() {
        return Err(AppError::ConfigError(
            "At least one filter condition is required".to_string(),
        ));
    }

    let mut parts = Vec::with_capacity(filters.len());

    for f in filters {
        let col = quote_identifier(&f.column, driver_type);
        let op = f.operator.trim().to_uppercase();

        let clause = match op.as_str() {
            "=" | "!=" | "<" | ">" | "<=" | ">=" | "LIKE" | "NOT LIKE" => {
                let val = sql_literal(&f.value);
                format!("{col} {op} {val}")
            }
            "IS NULL" => format!("{col} IS NULL"),
            "IS NOT NULL" => format!("{col} IS NOT NULL"),
            "IN" | "NOT IN" => {
                let raw = f.value.as_deref().unwrap_or("");
                let items: Vec<String> = raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .map(|s| sql_literal(&Some(s)))
                    .collect();
                if items.is_empty() {
                    return Err(AppError::ConfigError(
                        format!("{op} operator requires at least one value"),
                    ));
                }
                format!("{col} {op} ({})", items.join(", "))
            }
            "BETWEEN" => {
                let raw = f.value.as_deref().unwrap_or("");
                let parts: Vec<&str> = raw.splitn(2, ',').map(|s| s.trim()).collect();
                if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
                    return Err(AppError::ConfigError(
                        "BETWEEN requires exactly two comma-separated values (e.g. 10,20)".to_string(),
                    ));
                }
                let low = sql_literal(&Some(parts[0].to_string()));
                let high = sql_literal(&Some(parts[1].to_string()));
                format!("{col} BETWEEN {low} AND {high}")
            }
            other => {
                return Err(AppError::ConfigError(format!(
                    "Unsupported filter operator: {other}"
                )));
            }
        };

        parts.push(clause);
    }

    Ok(parts.join(" AND "))
}

/// Build a multi-row INSERT VALUES statement for a batch of rows.
fn build_batch_insert(
    qualified: &str,
    columns: &[String],
    rows: &[Vec<Option<String>>],
    driver_type: &str,
) -> String {
    let quoted_columns: Vec<String> = columns
        .iter()
        .map(|c| quote_identifier(c, driver_type))
        .collect();
    let col_list = quoted_columns.join(", ");

    let value_rows: Vec<String> = rows
        .iter()
        .map(|row| {
            let vals: Vec<String> = row.iter().map(sql_literal).collect();
            format!("({})", vals.join(", "))
        })
        .collect();

    format!(
        "INSERT INTO {qualified} ({col_list}) VALUES {}",
        value_rows.join(", ")
    )
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Insert rows in batches of 500, wrapped in a transaction when supported.
#[tauri::command]
pub async fn bulk_insert(
    app: tauri::AppHandle,
    session_id: String,
    table: String,
    schema: Option<String>,
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<BulkResult, AppError> {
    if columns.is_empty() {
        return Err(AppError::ConfigError("No columns specified".to_string()));
    }
    if rows.is_empty() {
        return Ok(BulkResult {
            rows_affected: 0,
            batches_executed: 0,
            duration_ms: 0,
        });
    }

    let (driver, driver_type, use_txn) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id)?;
        let dt = config.db_type.clone();
        let txn = driver.supports_transactions();
        (driver, dt, txn)
    };

    let qualified = qualified_table(&table, &schema, &driver_type);
    let start = Instant::now();

    if use_txn {
        driver.execute("BEGIN").await?;
    }

    let mut total_affected: i64 = 0;
    let mut batches_executed: usize = 0;
    let total_batches = rows.len().div_ceil(BATCH_SIZE);

    for chunk in rows.chunks(BATCH_SIZE) {
        let sql = build_batch_insert(&qualified, &columns, chunk, &driver_type);
        tracing::info!(session_id = %session_id, batch = batches_executed + 1, rows = chunk.len(), "bulk_insert batch");

        match driver.execute(&sql).await {
            Ok(result) => {
                total_affected += result.affected_rows;
                batches_executed += 1;
                let _ = app.emit("bulk:progress", serde_json::json!({
                    "batch": batches_executed,
                    "totalBatches": total_batches,
                    "rowsAffected": total_affected
                }));
            }
            Err(err) => {
                if use_txn {
                    let _ = driver.execute("ROLLBACK").await;
                }
                return Err(AppError::DatabaseError(format!(
                    "Bulk insert failed at batch {} ({} rows already committed): {}",
                    batches_executed + 1,
                    if use_txn { 0 } else { total_affected },
                    err
                )));
            }
        }
    }

    if use_txn {
        driver.execute("COMMIT").await?;
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    tracing::info!(
        session_id = %session_id,
        rows_affected = total_affected,
        batches = batches_executed,
        duration_ms,
        "bulk_insert complete"
    );

    Ok(BulkResult {
        rows_affected: total_affected,
        batches_executed,
        duration_ms,
    })
}

/// Count rows matching filters (dry-run for bulk update).
#[tauri::command]
pub async fn bulk_update_preview(
    session_id: String,
    table: String,
    schema: Option<String>,
    filters: Vec<FilterCondition>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<i64, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id)?;
        (driver, config.db_type.clone())
    };

    let qualified = qualified_table(&table, &schema, &driver_type);
    let where_clause = build_filter_where(&filters, &driver_type)?;
    let sql = format!("SELECT COUNT(*) FROM {qualified} WHERE {where_clause}");

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

/// Update one or more columns for all rows matching structured filters.
#[tauri::command]
pub async fn bulk_update(
    session_id: String,
    table: String,
    schema: Option<String>,
    updates: Vec<ColumnUpdate>,
    filters: Vec<FilterCondition>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<BulkResult, AppError> {
    if updates.is_empty() {
        return Err(AppError::ConfigError(
            "At least one column update is required".to_string(),
        ));
    }

    let (driver, driver_type, use_txn) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id)?;
        let dt = config.db_type.clone();
        let txn = driver.supports_transactions();
        (driver, dt, txn)
    };

    let qualified = qualified_table(&table, &schema, &driver_type);
    let where_clause = build_filter_where(&filters, &driver_type)?;
    let set_parts: Vec<String> = updates
        .iter()
        .map(|u| {
            let col = quote_identifier(&u.column, &driver_type);
            let val = sql_literal(&u.value);
            format!("{col} = {val}")
        })
        .collect();
    let set_clause = set_parts.join(", ");

    let sql = format!("UPDATE {qualified} SET {set_clause} WHERE {where_clause}");
    let start = Instant::now();

    tracing::info!(session_id = %session_id, "bulk_update: {}", &sql);

    if use_txn {
        driver.execute("BEGIN").await?;
    }

    match driver.execute(&sql).await {
        Ok(result) => {
            if use_txn {
                driver.execute("COMMIT").await?;
            }
            let duration_ms = start.elapsed().as_millis() as u64;
            Ok(BulkResult {
                rows_affected: result.affected_rows,
                batches_executed: 1,
                duration_ms,
            })
        }
        Err(err) => {
            if use_txn {
                let _ = driver.execute("ROLLBACK").await;
            }
            Err(err)
        }
    }
}

/// Count rows matching filters (dry-run for bulk delete).
#[tauri::command]
pub async fn bulk_delete_preview(
    session_id: String,
    table: String,
    schema: Option<String>,
    filters: Vec<FilterCondition>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<i64, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id)?;
        (driver, config.db_type.clone())
    };

    let qualified = qualified_table(&table, &schema, &driver_type);
    let where_clause = build_filter_where(&filters, &driver_type)?;
    let sql = format!("SELECT COUNT(*) FROM {qualified} WHERE {where_clause}");

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

/// Delete all rows matching structured filters.
#[tauri::command]
pub async fn bulk_delete(
    session_id: String,
    table: String,
    schema: Option<String>,
    filters: Vec<FilterCondition>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<BulkResult, AppError> {
    let (driver, driver_type, use_txn) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id)?;
        let dt = config.db_type.clone();
        let txn = driver.supports_transactions();
        (driver, dt, txn)
    };

    let qualified = qualified_table(&table, &schema, &driver_type);
    let where_clause = build_filter_where(&filters, &driver_type)?;

    let sql = format!("DELETE FROM {qualified} WHERE {where_clause}");
    let start = Instant::now();

    tracing::info!(session_id = %session_id, "bulk_delete: {}", &sql);

    if use_txn {
        driver.execute("BEGIN").await?;
    }

    match driver.execute(&sql).await {
        Ok(result) => {
            if use_txn {
                driver.execute("COMMIT").await?;
            }
            let duration_ms = start.elapsed().as_millis() as u64;
            Ok(BulkResult {
                rows_affected: result.affected_rows,
                batches_executed: 1,
                duration_ms,
            })
        }
        Err(err) => {
            if use_txn {
                let _ = driver.execute("ROLLBACK").await;
            }
            Err(err)
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sql_literal_null() {
        assert_eq!(sql_literal(&None), "NULL");
    }

    #[test]
    fn test_sql_literal_empty() {
        assert_eq!(sql_literal(&Some(String::new())), "''");
    }

    #[test]
    fn test_sql_literal_number() {
        assert_eq!(sql_literal(&Some("42".to_string())), "42");
        assert_eq!(sql_literal(&Some("3.14".to_string())), "'3.14'"); // floats are quoted for safety
        assert_eq!(sql_literal(&Some("-1".to_string())), "-1");
        assert_eq!(sql_literal(&Some("NaN".to_string())), "'NaN'"); // NaN must be quoted
        assert_eq!(sql_literal(&Some("Infinity".to_string())), "'Infinity'"); // Infinity must be quoted
    }

    #[test]
    fn test_sql_literal_string() {
        assert_eq!(sql_literal(&Some("hello".to_string())), "'hello'");
    }

    #[test]
    fn test_sql_literal_escapes_quotes() {
        assert_eq!(sql_literal(&Some("it's".to_string())), "'it''s'");
    }

    #[test]
    fn test_qualified_table_with_schema() {
        assert_eq!(
            qualified_table("users", &Some("public".to_string()), "postgres"),
            "\"public\".\"users\""
        );
    }

    #[test]
    fn test_qualified_table_without_schema() {
        assert_eq!(
            qualified_table("users", &None, "postgres"),
            "\"users\""
        );
    }

    #[test]
    fn test_qualified_table_mysql() {
        assert_eq!(
            qualified_table("users", &Some("mydb".to_string()), "mysql"),
            "`mydb`.`users`"
        );
    }

    #[test]
    fn test_build_filter_where_equals() {
        let filters = vec![FilterCondition {
            column: "name".to_string(),
            operator: "=".to_string(),
            value: Some("Alice".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"name\" = 'Alice'");
    }

    #[test]
    fn test_build_filter_where_is_null() {
        let filters = vec![FilterCondition {
            column: "age".to_string(),
            operator: "IS NULL".to_string(),
            value: None,
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"age\" IS NULL");
    }

    #[test]
    fn test_build_filter_where_in() {
        let filters = vec![FilterCondition {
            column: "status".to_string(),
            operator: "IN".to_string(),
            value: Some("active, pending".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"status\" IN ('active', 'pending')");
    }

    #[test]
    fn test_build_filter_where_multiple() {
        let filters = vec![
            FilterCondition {
                column: "age".to_string(),
                operator: ">".to_string(),
                value: Some("18".to_string()),
            },
            FilterCondition {
                column: "active".to_string(),
                operator: "=".to_string(),
                value: Some("true".to_string()),
            },
        ];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"age\" > 18 AND \"active\" = 'true'");
    }

    #[test]
    fn test_build_filter_where_empty_rejects() {
        let result = build_filter_where(&[], "postgres");
        assert!(result.is_err());
    }

    #[test]
    fn test_build_filter_where_bad_operator_rejects() {
        let filters = vec![FilterCondition {
            column: "x".to_string(),
            operator: "DROP TABLE".to_string(),
            value: None,
        }];
        let result = build_filter_where(&filters, "postgres");
        assert!(result.is_err());
    }

    #[test]
    fn test_build_batch_insert_single_row() {
        let sql = build_batch_insert(
            "\"public\".\"users\"",
            &["name".to_string(), "age".to_string()],
            &[vec![Some("Alice".to_string()), Some("30".to_string())]],
            "postgres",
        );
        assert_eq!(
            sql,
            "INSERT INTO \"public\".\"users\" (\"name\", \"age\") VALUES ('Alice', 30)"
        );
    }

    #[test]
    fn test_build_batch_insert_multiple_rows() {
        let sql = build_batch_insert(
            "\"users\"",
            &["id".to_string(), "name".to_string()],
            &[
                vec![Some("1".to_string()), Some("Alice".to_string())],
                vec![Some("2".to_string()), Some("Bob".to_string())],
            ],
            "postgres",
        );
        assert_eq!(
            sql,
            "INSERT INTO \"users\" (\"id\", \"name\") VALUES (1, 'Alice'), (2, 'Bob')"
        );
    }

    #[test]
    fn test_build_batch_insert_with_null() {
        let sql = build_batch_insert(
            "\"t\"",
            &["a".to_string()],
            &[vec![None]],
            "postgres",
        );
        assert_eq!(sql, "INSERT INTO \"t\" (\"a\") VALUES (NULL)");
    }

    #[test]
    fn test_build_filter_where_like() {
        let filters = vec![FilterCondition {
            column: "name".to_string(),
            operator: "LIKE".to_string(),
            value: Some("%alice%".to_string()),
        }];
        let result = build_filter_where(&filters, "mysql").unwrap();
        assert_eq!(result, "`name` LIKE '%alice%'");
    }

    #[test]
    fn test_build_filter_where_in_numbers() {
        let filters = vec![FilterCondition {
            column: "id".to_string(),
            operator: "IN".to_string(),
            value: Some("1, 2, 3".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"id\" IN (1, 2, 3)");
    }

    #[test]
    fn test_build_filter_where_sql_injection_in_value() {
        let filters = vec![FilterCondition {
            column: "name".to_string(),
            operator: "=".to_string(),
            value: Some("'; DROP TABLE users; --".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        // The single quote is escaped — the injection attempt stays inside the string literal
        assert!(result.contains("''"));
        // The entire malicious payload is wrapped in a single quoted string
        assert_eq!(
            result,
            "\"name\" = '''; DROP TABLE users; --'"
        );
    }

    #[test]
    fn test_build_filter_where_between() {
        let filters = vec![FilterCondition {
            column: "age".to_string(),
            operator: "BETWEEN".to_string(),
            value: Some("10,20".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"age\" BETWEEN 10 AND 20");
    }

    #[test]
    fn test_build_filter_where_not_like() {
        let filters = vec![FilterCondition {
            column: "name".to_string(),
            operator: "NOT LIKE".to_string(),
            value: Some("%test%".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"name\" NOT LIKE '%test%'");
    }

    #[test]
    fn test_build_filter_where_not_in() {
        let filters = vec![FilterCondition {
            column: "status".to_string(),
            operator: "NOT IN".to_string(),
            value: Some("active, pending".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres").unwrap();
        assert_eq!(result, "\"status\" NOT IN ('active', 'pending')");
    }

    #[test]
    fn test_build_filter_where_between_invalid() {
        let filters = vec![FilterCondition {
            column: "age".to_string(),
            operator: "BETWEEN".to_string(),
            value: Some("10".to_string()),
        }];
        let result = build_filter_where(&filters, "postgres");
        assert!(result.is_err());
    }
}
