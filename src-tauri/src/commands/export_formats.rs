use std::io::Write as IoWrite;
use std::sync::{Arc, Mutex as StdMutex};

use rust_xlsxwriter::{Worksheet, XlsxError};
use tokio::task;

use crate::models::AppError;
use crate::services::sql_quoting::quote_identifier;

// ---------------------------------------------------------------------------
// Error mapping helpers
// ---------------------------------------------------------------------------

pub(crate) fn map_xlsx_err(e: XlsxError) -> AppError {
    AppError::ConfigError(e.to_string())
}

pub(crate) fn map_join_err(e: task::JoinError) -> AppError {
    AppError::IoError(format!("Blocking task join error: {e}"))
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

pub(crate) async fn create_output_file(
    file_path: &str,
) -> Result<Arc<StdMutex<std::fs::File>>, AppError> {
    let file_path = file_path.to_string();
    task::spawn_blocking(move || {
        let file = std::fs::File::create(&file_path)?;
        Ok::<Arc<StdMutex<std::fs::File>>, std::io::Error>(Arc::new(StdMutex::new(file)))
    })
    .await
    .map_err(map_join_err)?
    .map_err(AppError::from)
}

pub(crate) async fn write_file_chunk(
    file: Arc<StdMutex<std::fs::File>>,
    bytes: Vec<u8>,
) -> Result<(), AppError> {
    if bytes.is_empty() {
        return Ok(());
    }

    task::spawn_blocking(move || {
        let mut guard = file
            .lock()
            .map_err(|e| std::io::Error::other(format!("Output file lock poisoned: {e}")))?;
        guard.write_all(&bytes)
    })
    .await
    .map_err(map_join_err)?
    .map_err(AppError::from)
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

pub fn escape_csv_field(value: &str, delimiter: &str, quote: char) -> String {
    let needs_quote = value.contains(delimiter)
        || value.contains(quote)
        || value.contains('\n')
        || value.contains('\r');
    if needs_quote {
        let escaped = value.replace(quote, &format!("{quote}{quote}"));
        format!("{quote}{escaped}{quote}")
    } else {
        value.to_string()
    }
}

pub(crate) fn write_csv_row(
    buf: &mut Vec<u8>,
    fields: &[Option<String>],
    delimiter: &str,
    quote: char,
) -> Result<(), AppError> {
    let row: Vec<String> = fields
        .iter()
        .map(|v| match v {
            Some(s) => escape_csv_field(s, delimiter, quote),
            None => String::new(),
        })
        .collect();
    writeln!(buf, "{}", row.join(delimiter)).map_err(|e| AppError::IoError(e.to_string()))
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

pub fn escape_sql_value(value: &str) -> String {
    value.replace('\'', "''")
}

pub(crate) fn generate_create_table(
    table: &str,
    columns: &[crate::models::ColumnInfo],
    driver_type: &str,
) -> String {
    let quoted_table = quote_identifier(table, driver_type);
    let cols: Vec<String> = columns
        .iter()
        .map(|c| {
            format!(
                "  {} {}",
                quote_identifier(&c.name, driver_type),
                c.type_name
            )
        })
        .collect();
    format!(
        "CREATE TABLE IF NOT EXISTS {quoted_table} (\n{}\n);\n\n",
        cols.join(",\n")
    )
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

pub(crate) fn indent_pretty_json(json: &str) -> String {
    json.lines()
        .map(|line| format!("  {line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn row_to_json_value(
    row: &[Option<String>],
    columns: &[crate::models::ColumnInfo],
    array_of_arrays: bool,
) -> serde_json::Value {
    if array_of_arrays {
        serde_json::Value::Array(
            row.iter()
                .map(|v| match v {
                    Some(s) => serde_json::Value::String(s.clone()),
                    None => serde_json::Value::Null,
                })
                .collect(),
        )
    } else {
        let mut obj = serde_json::Map::new();
        for (col, val) in columns.iter().zip(row.iter()) {
            let v = match val {
                Some(s) => serde_json::Value::String(s.clone()),
                None => serde_json::Value::Null,
            };
            obj.insert(col.name.clone(), v);
        }
        serde_json::Value::Object(obj)
    }
}

// ---------------------------------------------------------------------------
// XLSX helpers
// ---------------------------------------------------------------------------

/// Write a single cell into a worksheet with type detection.
/// Numbers are stored as f64; everything else as a string.
/// NULL values write an empty string so the cell is present but blank.
pub fn write_xlsx_cell(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: &Option<String>,
) -> Result<(), AppError> {
    match value {
        None => {
            worksheet.write_string(row, col, "").map_err(map_xlsx_err)?;
        }
        Some(s) => {
            let s = if s.len() > 32_767 {
                &s[..32_767]
            } else {
                s.as_str()
            };
            if let Ok(n) = s.parse::<f64>() {
                worksheet.write_number(row, col, n).map_err(map_xlsx_err)?;
            } else {
                worksheet.write_string(row, col, s).map_err(map_xlsx_err)?;
            }
        }
    }
    Ok(())
}
