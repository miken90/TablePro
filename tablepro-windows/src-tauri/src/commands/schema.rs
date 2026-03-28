use tauri::State;
use tokio::sync::Mutex;

use crate::models::{
    AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, RoutineCatalog, RoutineInfo,
    RoutineKind, TableInfo,
};
use crate::services::sql_quoting::quote_identifier;
use crate::services::ConnectionManager;

/// Return all tables/views in the connected database.
#[tauri::command]
pub async fn fetch_tables(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<TableInfo>, AppError> {
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
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
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
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
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
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
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
    driver.fetch_foreign_keys(&table, schema.as_deref()).await
}

/// Return available databases on the server.
#[tauri::command]
pub async fn fetch_databases(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<String>, AppError> {
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
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
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
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

fn sql_string_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn first_value(result: &QueryResult) -> Option<String> {
    result
        .rows
        .first()
        .and_then(|r| r.first())
        .and_then(|v| v.clone())
}

fn first_value_i64(result: &QueryResult) -> i64 {
    first_value(result)
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0)
}

fn parse_mysql_enum_like(column_type: &str) -> Vec<String> {
    let lower = column_type.to_ascii_lowercase();
    if !(lower.starts_with("enum(") || lower.starts_with("set(")) {
        return vec![];
    }

    let (Some(open), Some(close)) = (column_type.find('('), column_type.rfind(')')) else {
        return vec![];
    };

    let mut values = Vec::new();
    let mut current = String::new();
    let mut chars = column_type[open + 1..close].chars().peekable();
    let mut in_quote = false;

    while let Some(ch) = chars.next() {
        if ch == '\'' {
            if in_quote {
                if chars.peek() == Some(&'\'') {
                    current.push('\'');
                    let _ = chars.next();
                } else {
                    in_quote = false;
                }
            } else {
                in_quote = true;
            }
            continue;
        }

        if ch == ',' && !in_quote {
            if !current.is_empty() {
                values.push(current.trim().to_string());
                current.clear();
            }
            continue;
        }

        current.push(ch);
    }

    if !current.is_empty() {
        values.push(current.trim().to_string());
    }

    values
}

/// Return ENUM/SET candidate values for a column.
#[tauri::command]
pub async fn fetch_enum_values(
    session_id: String,
    table: String,
    column: String,
    schema: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<String>, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)?.db_type.to_ascii_lowercase();
        (driver, driver_type)
    };

    match driver_type.as_str() {
        "mysql" | "mariadb" => {
            let mut sql = format!(
                "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = {} AND COLUMN_NAME = {}",
                sql_string_literal(&table),
                sql_string_literal(&column)
            );

            match schema {
                Some(s) if !s.is_empty() => {
                    sql.push_str(&format!(" AND TABLE_SCHEMA = {}", sql_string_literal(&s)));
                }
                _ => sql.push_str(" AND TABLE_SCHEMA = DATABASE()"),
            }

            sql.push_str(" LIMIT 1");
            let result = driver.execute(&sql).await?;
            let Some(column_type) = first_value(&result) else {
                return Ok(vec![]);
            };
            Ok(parse_mysql_enum_like(&column_type))
        }
        "postgres" | "postgresql" => {
            let mut sql = format!(
                "SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = {} AND column_name = {}",
                sql_string_literal(&table),
                sql_string_literal(&column)
            );

            match schema.as_deref() {
                Some(s) if !s.is_empty() => {
                    sql.push_str(&format!(" AND table_schema = {}", sql_string_literal(s)));
                }
                _ => sql.push_str(" AND table_schema = current_schema()"),
            }

            sql.push_str(" LIMIT 1");
            let info = driver.execute(&sql).await?;
            let Some(row) = info.rows.first() else {
                return Ok(vec![]);
            };

            let data_type = row
                .first()
                .and_then(|v| v.as_ref())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();
            let udt_name = row.get(1).and_then(|v| v.clone()).unwrap_or_default();

            if data_type != "user-defined" || udt_name.is_empty() {
                return Ok(vec![]);
            }

            let mut enum_sql = format!(
                "SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = {}",
                sql_string_literal(&udt_name)
            );

            if let Some(s) = schema.as_deref().filter(|s| !s.is_empty()) {
                enum_sql.push_str(&format!(" AND n.nspname = {}", sql_string_literal(s)));
            }

            enum_sql.push_str(" ORDER BY e.enumsortorder");
            let result = driver.execute(&enum_sql).await?;
            Ok(result
                .rows
                .iter()
                .filter_map(|r| r.first().and_then(|v| v.clone()))
                .collect())
        }
        _ => Ok(vec![]),
    }
}

/// Return an estimated row count for the table.
#[tauri::command]
pub async fn fetch_approximate_count(
    session_id: String,
    table: String,
    schema: Option<String>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<i64, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)?.db_type.to_ascii_lowercase();
        (driver, driver_type)
    };

    let sql = match driver_type.as_str() {
        "postgres" | "postgresql" => match schema.as_deref().filter(|s| !s.is_empty()) {
            Some(s) => format!(
                "SELECT COALESCE(c.reltuples::bigint, 0) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = {} AND n.nspname = {} LIMIT 1",
                sql_string_literal(&table),
                sql_string_literal(s)
            ),
            None => format!(
                "SELECT COALESCE(c.reltuples::bigint, 0) FROM pg_class c WHERE c.relname = {} LIMIT 1",
                sql_string_literal(&table)
            ),
        },
        "mysql" | "mariadb" => match schema.as_deref().filter(|s| !s.is_empty()) {
            Some(s) => format!(
                "SELECT COALESCE(TABLE_ROWS, 0) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = {} AND TABLE_SCHEMA = {} LIMIT 1",
                sql_string_literal(&table),
                sql_string_literal(s)
            ),
            None => format!(
                "SELECT COALESCE(TABLE_ROWS, 0) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = {} AND TABLE_SCHEMA = DATABASE() LIMIT 1",
                sql_string_literal(&table)
            ),
        },
        "mssql" | "sqlserver" | "sql_server" => {
            let mut sql = format!(
                "SELECT COALESCE(SUM(p.rows), 0) FROM sys.partitions p JOIN sys.tables t ON t.object_id = p.object_id JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE t.name = {} AND p.index_id IN (0, 1)",
                sql_string_literal(&table)
            );
            if let Some(s) = schema.as_deref().filter(|s| !s.is_empty()) {
                sql.push_str(&format!(" AND s.name = {}", sql_string_literal(s)));
            }
            sql
        }
        _ => {
            let qualified = match schema.as_deref().filter(|s| !s.is_empty()) {
                Some(s) => format!(
                    "{}.{}",
                    quote_identifier(s, &driver_type),
                    quote_identifier(&table, &driver_type)
                ),
                None => quote_identifier(&table, &driver_type),
            };
            format!("SELECT COUNT(*) FROM {qualified}")
        }
    };

    let result = driver.execute(&sql).await?;
    Ok(first_value_i64(&result))
}

fn bool_from_cell(value: Option<&String>) -> bool {
    value
        .map(|v| {
            let lower = v.trim().to_ascii_lowercase();
            matches!(lower.as_str(), "1" | "true" | "t" | "yes")
        })
        .unwrap_or(false)
}

fn unsupported_routine_catalog(reason: String) -> RoutineCatalog {
    RoutineCatalog {
        supported: false,
        reason: Some(reason),
        items: vec![],
    }
}

/// Return function/procedure metadata for supported engines.
#[tauri::command]
pub async fn fetch_routines(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<RoutineCatalog, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)?.db_type.to_ascii_lowercase();
        (driver, driver_type)
    };

    match driver_type.as_str() {
        "postgres" | "postgresql" => {
            let sql = "SELECT \
                           n.nspname AS routine_schema, \
                           p.proname AS routine_name, \
                           CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_kind, \
                           pg_get_function_identity_arguments(p.oid) AS routine_args, \
                           CASE WHEN p.prokind = 'p' THEN NULL ELSE pg_get_function_result(p.oid) END AS return_type \
                       FROM pg_proc p \
                       JOIN pg_namespace n ON n.oid = p.pronamespace \
                       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
                         AND p.prokind IN ('f', 'p') \
                       ORDER BY n.nspname, p.proname";
            let result = driver.execute(sql).await?;

            let items = result
                .rows
                .iter()
                .filter_map(|row| {
                    let schema = row.first().and_then(|v| v.clone());
                    let name = row.get(1).and_then(|v| v.clone())?;
                    let kind = match row.get(2).and_then(|v| v.as_deref()) {
                        Some("PROCEDURE") => RoutineKind::Procedure,
                        _ => RoutineKind::Function,
                    };
                    let signature_args = row.get(3).and_then(|v| v.clone());
                    let return_type = row.get(4).and_then(|v| v.clone());

                    Some(RoutineInfo {
                        name,
                        schema,
                        kind,
                        signature: signature_args,
                        return_type,
                        is_table_valued: false,
                    })
                })
                .collect();

            Ok(RoutineCatalog {
                supported: true,
                reason: None,
                items,
            })
        }
        "mysql" | "mariadb" => {
            let sql = "SELECT \
                           ROUTINE_SCHEMA, \
                           ROUTINE_NAME, \
                           ROUTINE_TYPE, \
                           DTD_IDENTIFIER \
                       FROM INFORMATION_SCHEMA.ROUTINES \
                       WHERE ROUTINE_SCHEMA = DATABASE() \
                       ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME";
            let result = driver.execute(sql).await?;

            let items = result
                .rows
                .iter()
                .filter_map(|row| {
                    let schema = row.first().and_then(|v| v.clone());
                    let name = row.get(1).and_then(|v| v.clone())?;
                    let kind = match row.get(2).and_then(|v| v.as_deref()) {
                        Some("PROCEDURE") => RoutineKind::Procedure,
                        _ => RoutineKind::Function,
                    };
                    let return_type = if kind == RoutineKind::Function {
                        row.get(3).and_then(|v| v.clone())
                    } else {
                        None
                    };

                    Some(RoutineInfo {
                        name,
                        schema,
                        kind,
                        signature: None,
                        return_type,
                        is_table_valued: false,
                    })
                })
                .collect();

            Ok(RoutineCatalog {
                supported: true,
                reason: None,
                items,
            })
        }
        "mssql" | "sqlserver" | "sql_server" => {
            let sql = "SELECT \
                           s.name AS routine_schema, \
                           o.name AS routine_name, \
                           o.type AS routine_type, \
                           CASE WHEN o.type IN ('TF', 'IF', 'FT') THEN 1 ELSE 0 END AS is_table_valued \
                       FROM sys.objects o \
                       INNER JOIN sys.schemas s ON s.schema_id = o.schema_id \
                       WHERE o.type IN ('P', 'PC', 'FN', 'TF', 'IF', 'FS', 'FT') \
                         AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest') \
                       ORDER BY s.name, o.name";
            let result = driver.execute(sql).await?;

            let items = result
                .rows
                .iter()
                .filter_map(|row| {
                    let schema = row.first().and_then(|v| v.clone());
                    let name = row.get(1).and_then(|v| v.clone())?;
                    let type_code = row.get(2).and_then(|v| v.as_deref()).unwrap_or("FN");
                    let kind = if matches!(type_code, "P" | "PC") {
                        RoutineKind::Procedure
                    } else {
                        RoutineKind::Function
                    };

                    Some(RoutineInfo {
                        name,
                        schema,
                        kind,
                        signature: None,
                        return_type: None,
                        is_table_valued: bool_from_cell(row.get(3).and_then(|v| v.as_ref())),
                    })
                })
                .collect();

            Ok(RoutineCatalog {
                supported: true,
                reason: None,
                items,
            })
        }
        "sqlite" => Ok(unsupported_routine_catalog(
            "Not supported for SQLite".to_string(),
        )),
        other => Ok(unsupported_routine_catalog(format!(
            "Not supported for {}",
            other
        ))),
    }
}

/// Return available schemas for the connected PostgreSQL database.
/// Returns an empty list for non-PostgreSQL drivers that don't expose schemas.
#[tauri::command]
pub async fn fetch_schemas(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<String>, AppError> {
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
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

#[cfg(test)]
mod tests {
    use super::parse_mysql_enum_like;

    #[test]
    fn parses_mysql_enum_values() {
        assert_eq!(
            parse_mysql_enum_like("enum('new','in_progress','done')"),
            vec!["new", "in_progress", "done"]
        );
    }

    #[test]
    fn parses_mysql_set_values_with_escaped_quotes() {
        assert_eq!(
            parse_mysql_enum_like("set('a''b','x')"),
            vec!["a'b", "x"]
        );
    }
}
