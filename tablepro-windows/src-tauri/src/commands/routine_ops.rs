use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, QueryResult};
use crate::services::sql_quoting::quote_identifier;
use crate::services::ConnectionManager;

/// Check if `name` matches `^[a-zA-Z_][a-zA-Z0-9_]*$` without pulling in regex.
fn is_valid_identifier(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// System routines that must never be executed through the UI.
const PG_DENYLIST: &[&str] = &[
    "pg_terminate_backend",
    "pg_cancel_backend",
    "pg_reload_conf",
];

const MSSQL_DENYLIST_PREFIXES: &[&str] = &["xp_", "sp_oa"];
const MSSQL_DENYLIST_EXACT: &[&str] = &["sp_configure"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineParam {
    pub name: String,
    pub value: Option<String>,
    pub param_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineResult {
    pub result_set: Option<QueryResult>,
    pub output_params: Vec<(String, serde_json::Value)>,
}

fn validate_routine_name(name: &str) -> Result<(), AppError> {
    if !is_valid_identifier(name) {
        return Err(AppError::DatabaseError(format!(
            "Invalid routine name: {name}"
        )));
    }
    Ok(())
}

fn validate_schema_name(schema: &str) -> Result<(), AppError> {
    if !is_valid_identifier(schema) {
        return Err(AppError::DatabaseError(format!(
            "Invalid schema name: {schema}"
        )));
    }
    Ok(())
}

fn check_denylist(name: &str, driver_type: &str) -> Result<(), AppError> {
    let lower = name.to_ascii_lowercase();

    match driver_type {
        "postgres" | "postgresql" => {
            if PG_DENYLIST.contains(&lower.as_str()) {
                return Err(AppError::DatabaseError(format!(
                    "Execution of system routine '{name}' is not allowed"
                )));
            }
        }
        "mssql" | "sqlserver" | "sql_server" => {
            if MSSQL_DENYLIST_EXACT.contains(&lower.as_str()) {
                return Err(AppError::DatabaseError(format!(
                    "Execution of system routine '{name}' is not allowed"
                )));
            }
            for prefix in MSSQL_DENYLIST_PREFIXES {
                if lower.starts_with(prefix) {
                    return Err(AppError::DatabaseError(format!(
                        "Execution of system routine '{name}' is not allowed"
                    )));
                }
            }
        }
        _ => {}
    }

    Ok(())
}

fn build_qualified_name(name: &str, schema: Option<&str>, driver_type: &str) -> String {
    match schema {
        Some(s) if !s.is_empty() => format!(
            "{}.{}",
            quote_identifier(s, driver_type),
            quote_identifier(name, driver_type)
        ),
        _ => quote_identifier(name, driver_type),
    }
}

fn escape_param_value(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Return the source definition of a stored routine.
#[tauri::command]
pub async fn get_routine_source(
    session_id: String,
    routine_name: String,
    routine_schema: Option<String>,
    routine_kind: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    validate_routine_name(&routine_name)?;
    if let Some(ref s) = routine_schema {
        if !s.is_empty() {
            validate_schema_name(s)?;
        }
    }

    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)?.db_type.to_ascii_lowercase();
        (driver, driver_type)
    };

    match driver_type.as_str() {
        "postgres" | "postgresql" => {
            // Use pg_get_functiondef to get the full source
            let schema_filter = match routine_schema.as_deref() {
                Some(s) if !s.is_empty() => {
                    format!(" AND n.nspname = '{}'", s.replace('\'', "''"))
                }
                _ => String::new(),
            };
            let sql = format!(
                "SELECT pg_get_functiondef(p.oid) \
                 FROM pg_proc p \
                 JOIN pg_namespace n ON n.oid = p.pronamespace \
                 WHERE p.proname = '{}'{} \
                 LIMIT 1",
                routine_name.replace('\'', "''"),
                schema_filter
            );
            let result = driver.execute(&sql).await?;
            result
                .rows
                .first()
                .and_then(|r| r.first())
                .and_then(|v| v.clone())
                .ok_or_else(|| {
                    AppError::NotFound(format!("Routine '{routine_name}' not found"))
                })
        }
        "mysql" | "mariadb" => {
            let kind_upper = routine_kind.to_ascii_uppercase();
            let keyword = if kind_upper == "PROCEDURE" {
                "PROCEDURE"
            } else {
                "FUNCTION"
            };
            let qualified = build_qualified_name(
                &routine_name,
                routine_schema.as_deref(),
                &driver_type,
            );
            let sql = format!("SHOW CREATE {keyword} {qualified}");
            let result = driver.execute(&sql).await?;
            // MySQL returns the definition in column index 2 (PROCEDURE) or 2 (FUNCTION)
            result
                .rows
                .first()
                .and_then(|r| r.get(2).and_then(|v| v.clone()))
                .ok_or_else(|| {
                    AppError::NotFound(format!("Routine '{routine_name}' not found"))
                })
        }
        "mssql" | "sqlserver" | "sql_server" => {
            // sp_helptext returns one row per line of source
            let qualified = build_qualified_name(
                &routine_name,
                routine_schema.as_deref(),
                &driver_type,
            );
            let sql = format!("EXEC sp_helptext {}", escape_param_value(&qualified));
            let result = driver.execute(&sql).await?;
            let source: String = result
                .rows
                .iter()
                .filter_map(|r| r.first().and_then(|v| v.clone()))
                .collect::<Vec<_>>()
                .join("");
            if source.is_empty() {
                return Err(AppError::NotFound(format!(
                    "Routine '{routine_name}' not found"
                )));
            }
            Ok(source)
        }
        "sqlite" => Err(AppError::DatabaseError(
            "Stored routines are not supported for SQLite".to_string(),
        )),
        other => Err(AppError::DatabaseError(format!(
            "Stored routines are not supported for {other}"
        ))),
    }
}

/// Build the SQL that will be executed for a routine, for preview purposes.
fn build_execute_sql(
    routine_name: &str,
    routine_schema: Option<&str>,
    routine_kind: &str,
    params: &[RoutineParam],
    driver_type: &str,
) -> String {
    let qualified = build_qualified_name(routine_name, routine_schema, driver_type);
    let param_values: Vec<String> = params
        .iter()
        .map(|p| match &p.value {
            None => "NULL".to_string(),
            Some(v) => escape_param_value(v),
        })
        .collect();
    let param_list = param_values.join(", ");

    let kind_lower = routine_kind.to_ascii_lowercase();

    match driver_type {
        "postgres" | "postgresql" => {
            if kind_lower == "procedure" {
                format!("CALL {qualified}({param_list})")
            } else {
                format!("SELECT {qualified}({param_list})")
            }
        }
        "mysql" | "mariadb" => {
            format!("CALL {qualified}({param_list})")
        }
        "mssql" | "sqlserver" | "sql_server" => {
            if param_list.is_empty() {
                format!("EXEC {qualified}")
            } else {
                format!("EXEC {qualified} {param_list}")
            }
        }
        _ => format!("SELECT {qualified}({param_list})"),
    }
}

/// Generate the SQL preview for executing a routine (without actually running it).
#[tauri::command]
pub async fn preview_routine_sql(
    routine_name: String,
    routine_schema: Option<String>,
    routine_kind: String,
    params: Vec<RoutineParam>,
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    validate_routine_name(&routine_name)?;
    if let Some(ref s) = routine_schema {
        if !s.is_empty() {
            validate_schema_name(s)?;
        }
    }

    let driver_type = {
        let mgr = manager.lock().await;
        mgr.get_config(&session_id)?.db_type.to_ascii_lowercase()
    };

    check_denylist(&routine_name, &driver_type)?;

    Ok(build_execute_sql(
        &routine_name,
        routine_schema.as_deref(),
        &routine_kind,
        &params,
        &driver_type,
    ))
}

/// Execute a stored routine and return its result.
#[tauri::command]
pub async fn execute_routine(
    session_id: String,
    routine_name: String,
    routine_schema: Option<String>,
    routine_kind: String,
    params: Vec<RoutineParam>,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<RoutineResult, AppError> {
    validate_routine_name(&routine_name)?;
    if let Some(ref s) = routine_schema {
        if !s.is_empty() {
            validate_schema_name(s)?;
        }
    }

    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)?.db_type.to_ascii_lowercase();
        (driver, driver_type)
    };

    check_denylist(&routine_name, &driver_type)?;

    let sql = build_execute_sql(
        &routine_name,
        routine_schema.as_deref(),
        &routine_kind,
        &params,
        &driver_type,
    );

    tracing::info!(session_id = %session_id, "execute_routine: {sql}");

    let result = driver.execute(&sql).await?;

    Ok(RoutineResult {
        result_set: Some(result),
        output_params: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_routine_names_pass() {
        assert!(validate_routine_name("my_func").is_ok());
        assert!(validate_routine_name("_private").is_ok());
        assert!(validate_routine_name("GetUsers123").is_ok());
    }

    #[test]
    fn invalid_routine_names_rejected() {
        assert!(validate_routine_name("my-func").is_err());
        assert!(validate_routine_name("'; DROP TABLE--").is_err());
        assert!(validate_routine_name("").is_err());
        assert!(validate_routine_name("123abc").is_err());
        assert!(validate_routine_name("a b").is_err());
    }

    #[test]
    fn pg_denylist_blocks_system_routines() {
        assert!(check_denylist("pg_terminate_backend", "postgres").is_err());
        assert!(check_denylist("pg_cancel_backend", "postgresql").is_err());
        assert!(check_denylist("pg_reload_conf", "postgres").is_err());
        assert!(check_denylist("my_function", "postgres").is_ok());
    }

    #[test]
    fn mssql_denylist_blocks_system_routines() {
        assert!(check_denylist("xp_cmdshell", "mssql").is_err());
        assert!(check_denylist("xp_anything", "mssql").is_err());
        assert!(check_denylist("sp_OACreate", "mssql").is_err());
        assert!(check_denylist("sp_configure", "sqlserver").is_err());
        assert!(check_denylist("my_proc", "mssql").is_ok());
    }

    #[test]
    fn build_execute_sql_pg_function() {
        let params = vec![RoutineParam {
            name: "x".to_string(),
            value: Some("42".to_string()),
            param_type: Some("int".to_string()),
        }];
        let sql =
            build_execute_sql("my_func", Some("public"), "function", &params, "postgres");
        assert_eq!(sql, "SELECT \"public\".\"my_func\"('42')");
    }

    #[test]
    fn build_execute_sql_pg_procedure() {
        let sql = build_execute_sql("my_proc", None, "procedure", &[], "postgres");
        assert_eq!(sql, "CALL \"my_proc\"()");
    }

    #[test]
    fn build_execute_sql_mysql() {
        let params = vec![
            RoutineParam {
                name: "a".to_string(),
                value: Some("hello".to_string()),
                param_type: None,
            },
            RoutineParam {
                name: "b".to_string(),
                value: None,
                param_type: None,
            },
        ];
        let sql = build_execute_sql("my_proc", None, "procedure", &params, "mysql");
        assert_eq!(sql, "CALL `my_proc`('hello', NULL)");
    }

    #[test]
    fn build_execute_sql_mssql_no_params() {
        let sql = build_execute_sql("dbo_proc", Some("dbo"), "procedure", &[], "mssql");
        assert_eq!(sql, "EXEC [dbo].[dbo_proc]");
    }

    #[test]
    fn build_execute_sql_mssql_with_params() {
        let params = vec![RoutineParam {
            name: "id".to_string(),
            value: Some("1".to_string()),
            param_type: None,
        }];
        let sql =
            build_execute_sql("my_proc", Some("dbo"), "procedure", &params, "mssql");
        assert_eq!(sql, "EXEC [dbo].[my_proc] '1'");
    }

    #[test]
    fn escape_param_value_handles_quotes() {
        assert_eq!(escape_param_value("it's"), "'it''s'");
        assert_eq!(escape_param_value("normal"), "'normal'");
    }

    #[test]
    fn build_qualified_name_with_schema() {
        let result = build_qualified_name("func", Some("public"), "postgres");
        assert_eq!(result, "\"public\".\"func\"");
    }

    #[test]
    fn build_qualified_name_without_schema() {
        let result = build_qualified_name("func", None, "mysql");
        assert_eq!(result, "`func`");
    }
}
