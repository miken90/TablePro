use crate::models::AppError;
use crate::services::sql_quoting::quote_identifier;

#[derive(Debug, Clone)]
pub struct ColumnDefinition {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub primary_key: bool,
    pub auto_increment: bool,
}

fn normalize_driver_type(driver_type: &str) -> String {
    let normalized = driver_type.to_ascii_lowercase();
    match normalized.as_str() {
        "postgresql" => "postgres".to_string(),
        "sqlserver" | "sql_server" => "mssql".to_string(),
        "mariadb" => "mysql".to_string(),
        "sqlite3" => "sqlite".to_string(),
        _ => normalized,
    }
}

fn validate_ident(name: &str, label: &str) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::DatabaseError(format!("{label} cannot be empty")));
    }
    Ok(())
}

fn format_column(col: &ColumnDefinition, driver: &str) -> Result<(String, bool), AppError> {
    validate_ident(&col.name, "Column name")?;

    let quoted_name = quote_identifier(&col.name, driver);
    let mut definition = String::new();
    let mut embedded_primary_key = false;

    if driver == "sqlite" && col.auto_increment {
        definition.push_str(&format!("{quoted_name} INTEGER PRIMARY KEY AUTOINCREMENT"));
        embedded_primary_key = true;
        return Ok((definition, embedded_primary_key));
    }

    let data_type = if driver == "postgres" && col.auto_increment {
        let upper = col.data_type.to_ascii_uppercase();
        if upper.contains("BIG") {
            "BIGSERIAL".to_string()
        } else {
            "SERIAL".to_string()
        }
    } else {
        col.data_type.trim().to_string()
    };

    if data_type.is_empty() {
        return Err(AppError::DatabaseError(format!(
            "Column '{}' type cannot be empty",
            col.name
        )));
    }

    definition.push_str(&format!("{quoted_name} {data_type}"));

    if col.auto_increment {
        match driver {
            "mysql" => definition.push_str(" AUTO_INCREMENT"),
            "mssql" => definition.push_str(" IDENTITY(1,1)"),
            _ => {}
        }
    }

    if col.nullable {
        definition.push_str(" NULL");
    } else {
        definition.push_str(" NOT NULL");
    }

    if let Some(default_value) = col.default_value.as_deref() {
        let trimmed = default_value.trim();
        if !trimmed.is_empty() {
            definition.push_str(&format!(" DEFAULT {trimmed}"));
        }
    }

    Ok((definition, embedded_primary_key))
}

pub fn generate_create_table(
    table_name: &str,
    schema: Option<&str>,
    columns: &[ColumnDefinition],
    driver_type: &str,
) -> Result<String, AppError> {
    validate_ident(table_name, "Table name")?;
    if columns.is_empty() {
        return Err(AppError::DatabaseError(
            "At least one column is required".to_string(),
        ));
    }

    let driver = normalize_driver_type(driver_type);
    let quoted_table = quote_identifier(table_name, &driver);
    let full_table = if driver == "postgres" {
        match schema.map(str::trim).filter(|s| !s.is_empty()) {
            Some(schema_name) => {
                format!(
                    "{}.{}",
                    quote_identifier(schema_name, &driver),
                    quoted_table
                )
            }
            None => quoted_table,
        }
    } else {
        quoted_table
    };

    let mut parts = Vec::with_capacity(columns.len() + 1);
    let mut pk_columns: Vec<String> = Vec::new();

    for col in columns {
        let (column_sql, embedded_pk) = format_column(col, &driver)?;
        parts.push(column_sql);
        if col.primary_key && !embedded_pk {
            pk_columns.push(quote_identifier(&col.name, &driver));
        }
    }

    if !pk_columns.is_empty() {
        parts.push(format!("PRIMARY KEY ({})", pk_columns.join(", ")));
    }

    Ok(format!(
        "CREATE TABLE {} (\n  {}\n)",
        full_table,
        parts.join(",\n  ")
    ))
}

#[cfg(test)]
mod tests {
    use super::{generate_create_table, ColumnDefinition};

    fn col(name: &str, data_type: &str) -> ColumnDefinition {
        ColumnDefinition {
            name: name.to_string(),
            data_type: data_type.to_string(),
            nullable: false,
            default_value: None,
            primary_key: false,
            auto_increment: false,
        }
    }

    #[test]
    fn generates_postgres_schema_ddl() {
        let mut id = col("id", "INT");
        id.primary_key = true;
        id.auto_increment = true;
        let mut active = col("active", "BOOLEAN");
        active.default_value = Some("true".to_string());

        let ddl =
            generate_create_table("users", Some("public"), &[id, active], "postgres").unwrap();
        assert!(ddl.contains("CREATE TABLE \"public\".\"users\""));
        assert!(ddl.contains("\"id\" SERIAL"));
        assert!(ddl.contains("\"active\" BOOLEAN NOT NULL DEFAULT true"));
        assert!(ddl.contains("PRIMARY KEY (\"id\")"));
    }

    #[test]
    fn generates_mysql_auto_increment() {
        let mut id = col("id", "INT");
        id.primary_key = true;
        id.auto_increment = true;

        let ddl = generate_create_table("users", None, &[id], "mysql").unwrap();
        assert!(ddl.contains("CREATE TABLE `users`"));
        assert!(ddl.contains("`id` INT AUTO_INCREMENT NOT NULL"));
        assert!(ddl.contains("PRIMARY KEY (`id`)"));
    }

    #[test]
    fn generates_mssql_identity() {
        let mut id = col("id", "INT");
        id.primary_key = true;
        id.auto_increment = true;

        let ddl = generate_create_table("users", None, &[id], "mssql").unwrap();
        assert!(ddl.contains("CREATE TABLE [users]"));
        assert!(ddl.contains("[id] INT IDENTITY(1,1) NOT NULL"));
        assert!(ddl.contains("PRIMARY KEY ([id])"));
    }

    #[test]
    fn generates_sqlite_autoincrement_pk_inline() {
        let mut id = col("id", "INT");
        id.primary_key = true;
        id.auto_increment = true;
        let name = ColumnDefinition {
            name: "name".to_string(),
            data_type: "TEXT".to_string(),
            nullable: true,
            default_value: None,
            primary_key: false,
            auto_increment: false,
        };

        let ddl = generate_create_table("users", None, &[id, name], "sqlite").unwrap();
        assert!(ddl.contains("CREATE TABLE \"users\""));
        assert!(ddl.contains("\"id\" INTEGER PRIMARY KEY AUTOINCREMENT"));
        assert!(!ddl.contains("PRIMARY KEY (\"id\")"));
    }

    #[test]
    fn rejects_empty_table_name() {
        let err = generate_create_table("   ", None, &[col("id", "INT")], "postgres").unwrap_err();
        assert!(err.to_string().contains("Table name cannot be empty"));
    }
}
