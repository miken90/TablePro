use crate::models::AppError;
use crate::services::sql_quoting::quote_identifier;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnDef {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlterColumnChange {
    pub change_type: AlterChangeType,
    pub column_name: String,
    pub before: Option<ColumnDef>,
    pub after: Option<ColumnDef>,
}

#[derive(Debug, Clone, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AlterChangeType {
    AddColumn,
    ModifyColumn,
    DropColumn,
}

fn normalize_driver(driver_type: &str) -> &str {
    match driver_type.to_ascii_lowercase().as_str() {
        "postgresql" | "postgres" => "postgres",
        "sqlserver" | "sql_server" | "mssql" => "mssql",
        "mariadb" | "mysql" => "mysql",
        "sqlite3" | "sqlite" => "sqlite",
        _ => "postgres",
    }
}

fn qualified_table(table: &str, schema: Option<&str>, driver: &str) -> String {
    match schema {
        Some(s) if !s.is_empty() => {
            format!(
                "{}.{}",
                quote_identifier(s, driver),
                quote_identifier(table, driver)
            )
        }
        _ => quote_identifier(table, driver),
    }
}

fn format_default(default_value: Option<&str>) -> String {
    match default_value.map(str::trim).filter(|s| !s.is_empty()) {
        Some(v) => format!(" DEFAULT {v}"),
        None => String::new(),
    }
}

fn add_column_sql(table: &str, schema: Option<&str>, col: &ColumnDef, driver: &str) -> String {
    let qt = qualified_table(table, schema, driver);
    let qcol = quote_identifier(&col.name, driver);
    let nullable = if col.nullable { " NULL" } else { " NOT NULL" };
    let default = format_default(col.default_value.as_deref());
    format!(
        "ALTER TABLE {qt} ADD {qcol} {} {nullable}{default}",
        col.type_name
    )
}

fn drop_column_sql(
    table: &str,
    schema: Option<&str>,
    col_name: &str,
    driver: &str,
) -> Option<String> {
    if driver == "sqlite" {
        return None; // SQLite < 3.35 doesn't support DROP COLUMN; disable
    }
    let qt = qualified_table(table, schema, driver);
    let qcol = quote_identifier(col_name, driver);
    Some(format!("ALTER TABLE {qt} DROP COLUMN {qcol}"))
}

fn modify_column_sql(
    table: &str,
    schema: Option<&str>,
    before: &ColumnDef,
    after: &ColumnDef,
    driver: &str,
) -> Option<Vec<String>> {
    if driver == "sqlite" {
        return None; // SQLite doesn't support MODIFY COLUMN; disable
    }

    let qt = qualified_table(table, schema, driver);
    let qcol_before = quote_identifier(&before.name, driver);
    let nullable = if after.nullable { " NULL" } else { " NOT NULL" };
    let default = format_default(after.default_value.as_deref());

    let mut stmts = Vec::new();

    // Rename if needed
    if before.name != after.name {
        let qcol_after = quote_identifier(&after.name, driver);
        let rename_sql = match driver {
            "postgres" => format!("ALTER TABLE {qt} RENAME COLUMN {qcol_before} TO {qcol_after}"),
            "mysql" => format!(
                "ALTER TABLE {qt} CHANGE {qcol_before} {qcol_after} {}{nullable}{default}",
                after.type_name
            ),
            "mssql" => format!("EXEC sp_rename '{qt}.{qcol_before}', '{qcol_after}', 'COLUMN'"),
            _ => format!("ALTER TABLE {qt} RENAME COLUMN {qcol_before} TO {qcol_after}"),
        };
        stmts.push(rename_sql);
        if driver == "mysql" {
            // CHANGE handles type+nullable+default in one stmt
            return Some(stmts);
        }
    }

    let qcol = quote_identifier(&after.name, driver);

    match driver {
        "postgres" => {
            if before.type_name != after.type_name {
                stmts.push(format!(
                    "ALTER TABLE {qt} ALTER COLUMN {qcol} TYPE {}",
                    after.type_name
                ));
            }
            if before.nullable != after.nullable {
                if after.nullable {
                    stmts.push(format!(
                        "ALTER TABLE {qt} ALTER COLUMN {qcol} DROP NOT NULL"
                    ));
                } else {
                    stmts.push(format!("ALTER TABLE {qt} ALTER COLUMN {qcol} SET NOT NULL"));
                }
            }
            match (&before.default_value, &after.default_value) {
                (_, Some(d)) if !d.trim().is_empty() => {
                    stmts.push(format!(
                        "ALTER TABLE {qt} ALTER COLUMN {qcol} SET DEFAULT {d}"
                    ));
                }
                (Some(_), None) => {
                    stmts.push(format!("ALTER TABLE {qt} ALTER COLUMN {qcol} DROP DEFAULT"));
                }
                _ => {}
            }
        }
        "mysql" => {
            stmts.push(format!(
                "ALTER TABLE {qt} MODIFY COLUMN {qcol} {}{nullable}{default}",
                after.type_name
            ));
        }
        "mssql" => {
            stmts.push(format!(
                "ALTER TABLE {qt} ALTER COLUMN {qcol} {}{nullable}",
                after.type_name
            ));
            match (&before.default_value, &after.default_value) {
                (_, Some(d)) if !d.trim().is_empty() => {
                    stmts.push(format!("ALTER TABLE {qt} ADD DEFAULT {d} FOR {qcol}"));
                }
                _ => {}
            }
        }
        _ => {
            stmts.push(format!(
                "ALTER TABLE {qt} ALTER COLUMN {qcol} TYPE {}{nullable}{default}",
                after.type_name
            ));
        }
    }

    if stmts.is_empty() {
        None
    } else {
        Some(stmts)
    }
}

pub fn generate_alter_sql(
    table: &str,
    schema: Option<&str>,
    changes: &[AlterColumnChange],
    driver_type: &str,
) -> Result<Vec<String>, AppError> {
    let driver = normalize_driver(driver_type);
    let mut statements = Vec::new();

    for change in changes {
        match change.change_type {
            AlterChangeType::AddColumn => {
                let col = change.after.as_ref().ok_or_else(|| {
                    AppError::DatabaseError("add_column requires 'after' definition".to_string())
                })?;
                statements.push(add_column_sql(table, schema, col, driver));
            }
            AlterChangeType::DropColumn => {
                if let Some(sql) = drop_column_sql(table, schema, &change.column_name, driver) {
                    statements.push(sql);
                }
            }
            AlterChangeType::ModifyColumn => {
                let before = change.before.as_ref().ok_or_else(|| {
                    AppError::DatabaseError(
                        "modify_column requires 'before' definition".to_string(),
                    )
                })?;
                let after = change.after.as_ref().ok_or_else(|| {
                    AppError::DatabaseError("modify_column requires 'after' definition".to_string())
                })?;
                if let Some(stmts) = modify_column_sql(table, schema, before, after, driver) {
                    statements.extend(stmts);
                }
            }
        }
    }

    Ok(statements)
}
