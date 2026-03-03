//! Export data to CSV, JSON, SQL formats.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

use crate::database::escaping::escape_string_literal;
use crate::models::DatabaseType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Sql,
    Xlsx,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub file_path: String,
    pub table_name: Option<String>,
    pub include_headers: bool,
    pub delimiter: Option<String>,
    pub pretty: Option<bool>,
    pub db_type: Option<DatabaseType>,
}

pub fn export_to_csv(
    rows: &[Vec<Option<String>>],
    columns: &[String],
    options: &ExportOptions,
) -> Result<String, String> {
    let delimiter = options
        .delimiter
        .as_deref()
        .unwrap_or(",")
        .chars()
        .next()
        .unwrap_or(',');
    let path = Path::new(&options.file_path);

    let mut file = fs::File::create(path).map_err(|e| format!("Failed to create file: {e}"))?;

    if options.include_headers {
        let header_line: Vec<String> = columns.iter().map(|c| csv_escape(c, delimiter)).collect();
        writeln!(file, "{}", header_line.join(&delimiter.to_string()))
            .map_err(|e| format!("Write error: {e}"))?;
    }

    for row in rows {
        let line: Vec<String> = row
            .iter()
            .map(|cell| match cell {
                Some(v) => csv_escape(v, delimiter),
                None => String::new(),
            })
            .collect();
        writeln!(file, "{}", line.join(&delimiter.to_string()))
            .map_err(|e| format!("Write error: {e}"))?;
    }

    Ok(options.file_path.clone())
}

pub fn export_to_json(
    rows: &[Vec<Option<String>>],
    columns: &[String],
    options: &ExportOptions,
) -> Result<String, String> {
    let path = Path::new(&options.file_path);
    let pretty = options.pretty.unwrap_or(true);

    let objects: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let mut map = serde_json::Map::new();
            for (i, col) in columns.iter().enumerate() {
                let val = row
                    .get(i)
                    .and_then(|v| v.as_ref())
                    .map(|v| serde_json::Value::String(v.clone()))
                    .unwrap_or(serde_json::Value::Null);
                map.insert(col.clone(), val);
            }
            serde_json::Value::Object(map)
        })
        .collect();

    let json_str = if pretty {
        serde_json::to_string_pretty(&objects)
    } else {
        serde_json::to_string(&objects)
    }
    .map_err(|e| format!("JSON serialization error: {e}"))?;

    fs::write(path, &json_str).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(options.file_path.clone())
}

pub fn export_to_sql(
    rows: &[Vec<Option<String>>],
    columns: &[String],
    options: &ExportOptions,
) -> Result<String, String> {
    let table_name = options
        .table_name
        .as_deref()
        .ok_or("Table name is required for SQL export")?;
    let db_type = options
        .db_type
        .as_ref()
        .unwrap_or(&DatabaseType::Mysql);
    let path = Path::new(&options.file_path);

    let mut file = fs::File::create(path).map_err(|e| format!("Failed to create file: {e}"))?;

    let quoted_table = db_type.quote_identifier(table_name);
    let quoted_cols: Vec<String> = columns.iter().map(|c| db_type.quote_identifier(c)).collect();
    let cols_str = quoted_cols.join(", ");

    for row in rows {
        let values: Vec<String> = row
            .iter()
            .map(|cell| match cell {
                Some(v) => format!("'{}'", escape_string_literal(v, db_type)),
                None => "NULL".to_string(),
            })
            .collect();
        writeln!(
            file,
            "INSERT INTO {quoted_table} ({cols_str}) VALUES ({});",
            values.join(", ")
        )
        .map_err(|e| format!("Write error: {e}"))?;
    }

    Ok(options.file_path.clone())
}

fn csv_escape(value: &str, delimiter: char) -> String {
    if value.contains(delimiter) || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
