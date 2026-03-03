//! Import data from SQL and CSV files.

use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::database::driver::DatabaseDriver;
use crate::database::escaping::escape_string_literal;
use crate::models::DatabaseType;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub total_statements: usize,
    pub successful: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

pub async fn import_sql_file(
    driver: &Arc<Mutex<Box<dyn DatabaseDriver>>>,
    file_path: &str,
) -> Result<ImportResult, String> {
    let contents =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {e}"))?;

    let statements = split_sql_statements(&contents);
    let total_statements = statements.len();
    let mut successful = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    let driver_lock = driver.lock().await;

    for (i, stmt) in statements.iter().enumerate() {
        let trimmed = stmt.trim();
        if trimmed.is_empty() {
            continue;
        }
        match driver_lock.execute(trimmed).await {
            Ok(_) => successful += 1,
            Err(e) => {
                failed += 1;
                errors.push(format!("Statement {}: {}", i + 1, e));
                if errors.len() >= 100 {
                    errors.push("Too many errors, stopping collection".to_string());
                    break;
                }
            }
        }
    }

    Ok(ImportResult {
        total_statements,
        successful,
        failed,
        errors,
    })
}

pub async fn import_csv(
    driver: &Arc<Mutex<Box<dyn DatabaseDriver>>>,
    file_path: &str,
    table_name: &str,
    has_headers: bool,
    db_type: &DatabaseType,
) -> Result<ImportResult, String> {
    let contents =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {e}"))?;

    let mut lines = contents.lines();
    let headers: Vec<String> = if has_headers {
        match lines.next() {
            Some(header_line) => parse_csv_line(header_line),
            None => return Err("CSV file is empty".to_string()),
        }
    } else {
        // Generate column names from first row
        match contents.lines().next() {
            Some(first_line) => {
                let cols = parse_csv_line(first_line);
                (0..cols.len()).map(|i| format!("column_{}", i + 1)).collect()
            }
            None => return Err("CSV file is empty".to_string()),
        }
    };

    let quoted_table = db_type.quote_identifier(table_name);
    let quoted_cols: Vec<String> = headers.iter().map(|c| db_type.quote_identifier(c)).collect();
    let cols_str = quoted_cols.join(", ");

    let mut statements = Vec::new();
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let values = parse_csv_line(trimmed);
        let escaped: Vec<String> = values
            .iter()
            .map(|v| {
                if v.is_empty() {
                    "NULL".to_string()
                } else {
                    format!("'{}'", escape_string_literal(v, db_type))
                }
            })
            .collect();
        statements.push(format!(
            "INSERT INTO {quoted_table} ({cols_str}) VALUES ({});",
            escaped.join(", ")
        ));
    }

    let total_statements = statements.len();
    let mut successful = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    let driver_lock = driver.lock().await;

    for (i, stmt) in statements.iter().enumerate() {
        match driver_lock.execute(stmt).await {
            Ok(_) => successful += 1,
            Err(e) => {
                failed += 1;
                errors.push(format!("Row {}: {}", i + 1, e));
                if errors.len() >= 100 {
                    errors.push("Too many errors, stopping collection".to_string());
                    break;
                }
            }
        }
    }

    Ok(ImportResult {
        total_statements,
        successful,
        failed,
        errors,
    })
}

fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut prev_char = '\0';

    for ch in sql.chars() {
        match ch {
            '\'' if !in_double_quote && prev_char != '\\' => {
                in_single_quote = !in_single_quote;
                current.push(ch);
            }
            '"' if !in_single_quote && prev_char != '\\' => {
                in_double_quote = !in_double_quote;
                current.push(ch);
            }
            ';' if !in_single_quote && !in_double_quote => {
                let trimmed = current.trim().to_string();
                if !trimmed.is_empty() {
                    statements.push(trimmed);
                }
                current.clear();
            }
            _ => {
                current.push(ch);
            }
        }
        prev_char = ch;
    }

    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        statements.push(trimmed);
    }

    statements
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(ch);
            }
        } else {
            match ch {
                '"' => in_quotes = true,
                ',' => {
                    fields.push(current.clone());
                    current.clear();
                }
                _ => current.push(ch),
            }
        }
    }
    fields.push(current);

    fields
}
