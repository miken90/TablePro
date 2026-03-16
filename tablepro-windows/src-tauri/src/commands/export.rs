use std::io::Write as IoWrite;
use std::time::Instant;

use rust_xlsxwriter::{Workbook, Worksheet, XlsxError};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::ConnectionManager;

/// Excel row limit (1,048,576 rows per sheet, row 0 is header)
const XLSX_MAX_ROWS: u32 = 1_048_575;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub delimiter: Option<String>,
    pub include_header: Option<bool>,
    pub pretty: Option<bool>,
    pub array_of_arrays: Option<bool>,
    pub table_name: Option<String>,
    pub include_create_table: Option<bool>,
    pub batch_size: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub rows_exported: u64,
    pub file_path: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    current: u64,
    total: u64,
    format: String,
}

const CHUNK_SIZE: u64 = 10_000;

fn escape_csv_field(value: &str, delimiter: &str, quote: char) -> String {
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

fn write_csv_row(
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

fn escape_sql_value(value: &str) -> String {
    value.replace('\'', "''")
}

fn generate_create_table(table: &str, columns: &[crate::models::ColumnInfo]) -> String {
    let cols: Vec<String> = columns
        .iter()
        .map(|c| format!("  \"{}\" {}", c.name, c.type_name))
        .collect();
    format!("CREATE TABLE IF NOT EXISTS \"{table}\" (\n{}\n);\n\n", cols.join(",\n"))
}

fn map_xlsx_err(e: XlsxError) -> AppError {
    AppError::ConfigError(e.to_string())
}

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
            // Truncate to Excel's 32,767-character cell limit
            let s = if s.len() > 32_767 { &s[..32_767] } else { s.as_str() };
            if let Ok(n) = s.parse::<f64>() {
                worksheet.write_number(row, col, n).map_err(map_xlsx_err)?;
            } else {
                worksheet.write_string(row, col, s).map_err(map_xlsx_err)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn export_to_file(
    app: AppHandle,
    session_id: String,
    sql: String,
    format: String,
    file_path: String,
    options: ExportOptions,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<ExportResult, AppError> {
    tracing::info!(session_id = %session_id, format = %format, "export_to_file: {}", &sql);

    let start = Instant::now();

    // Step 1: get total count
    let total = {
        let count_sql = format!("SELECT COUNT(*) FROM ({sql}) AS _export_count");
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let result = driver.execute(&count_sql).await?;
        result
            .rows
            .first()
            .and_then(|r| r.first())
            .and_then(|v| v.as_deref())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0)
    };

    tracing::info!(session_id = %session_id, "export total rows: {}", total);

    // Open the output file (not used by xlsx — xlsxwriter writes directly)
    let mut file = std::fs::File::create(&file_path)?;
    let mut buf: Vec<u8> = Vec::with_capacity(64 * 1024);

    let delimiter = options.delimiter.as_deref().unwrap_or(",").to_string();
    let include_header = options.include_header.unwrap_or(true);
    let pretty = options.pretty.unwrap_or(false);
    let array_of_arrays = options.array_of_arrays.unwrap_or(false);
    let table_name = options.table_name.clone().unwrap_or_else(|| "export".to_string());
    let include_create_table = options.include_create_table.unwrap_or(false);
    let batch_size = options.batch_size.unwrap_or(100) as usize;

    let mut rows_exported: u64 = 0;
    let mut offset: u64 = 0;
    let mut header_written = false;

    // JSON specific state
    let mut json_rows: Vec<serde_json::Value> = Vec::new();

    // XLSX specific state.
    // Use Worksheet::new() (standalone, not tied to workbook) to avoid borrow checker
    // issues when holding the reference across loop iterations.
    // The worksheet is pushed into the workbook and saved after the loop.
    let mut xlsx_worksheet: Option<Worksheet> = if format == "xlsx" {
        Some(Worksheet::new())
    } else {
        None
    };
    // Next row index to write (0 = header row, 1+ = data rows)
    let mut xlsx_row: u32 = 0;
    // Whether the xlsx export has hit the Excel row cap
    let mut xlsx_row_limit_hit = false;

    loop {
        let chunk_sql = format!(
            "SELECT * FROM ({sql}) AS _export_data LIMIT {CHUNK_SIZE} OFFSET {offset}"
        );

        let chunk = {
            let mgr = manager.lock().await;
            let driver = mgr.get_driver(&session_id)?;
            driver.execute(&chunk_sql).await?
        };

        if chunk.rows.is_empty() {
            break;
        }

        let columns = &chunk.columns;

        match format.as_str() {
            "csv" => {
                if !header_written && include_header {
                    let headers: Vec<String> = columns
                        .iter()
                        .map(|c| escape_csv_field(&c.name, &delimiter, '"'))
                        .collect();
                    writeln!(&mut buf, "{}", headers.join(&delimiter))
                        .map_err(|e| AppError::IoError(e.to_string()))?;
                    header_written = true;
                } else if !header_written {
                    header_written = true;
                }
                for row in &chunk.rows {
                    write_csv_row(&mut buf, row, &delimiter, '"')?;
                    rows_exported += 1;
                }
            }
            "json" => {
                for row in &chunk.rows {
                    if array_of_arrays {
                        let arr: serde_json::Value = serde_json::Value::Array(
                            row.iter()
                                .map(|v| match v {
                                    Some(s) => serde_json::Value::String(s.clone()),
                                    None => serde_json::Value::Null,
                                })
                                .collect(),
                        );
                        json_rows.push(arr);
                    } else {
                        let mut obj = serde_json::Map::new();
                        for (col, val) in columns.iter().zip(row.iter()) {
                            let v = match val {
                                Some(s) => serde_json::Value::String(s.clone()),
                                None => serde_json::Value::Null,
                            };
                            obj.insert(col.name.clone(), v);
                        }
                        json_rows.push(serde_json::Value::Object(obj));
                    }
                    rows_exported += 1;
                }
            }
            "sql" => {
                if !header_written {
                    if include_create_table {
                        let ddl = generate_create_table(&table_name, columns);
                        buf.extend_from_slice(ddl.as_bytes());
                    }
                    header_written = true;
                }

                // Build batched INSERTs
                let col_names: Vec<String> =
                    columns.iter().map(|c| format!("\"{}\"", c.name)).collect();
                let col_list = col_names.join(", ");

                for batch in chunk.rows.chunks(batch_size) {
                    let mut stmt = format!(
                        "INSERT INTO \"{table_name}\" ({col_list}) VALUES\n"
                    );
                    let mut value_rows = Vec::with_capacity(batch.len());
                    for row in batch {
                        let vals: Vec<String> = row
                            .iter()
                            .map(|v| match v {
                                Some(s) => format!("'{}'", escape_sql_value(s)),
                                None => "NULL".to_string(),
                            })
                            .collect();
                        value_rows.push(format!("  ({})", vals.join(", ")));
                        rows_exported += 1;
                    }
                    stmt.push_str(&value_rows.join(",\n"));
                    stmt.push_str(";\n");
                    buf.extend_from_slice(stmt.as_bytes());
                }
            }
            "xlsx" => {
                let ws = xlsx_worksheet
                    .as_mut()
                    .expect("xlsx worksheet initialised before loop");

                // Write header row on the first chunk
                if !header_written {
                    if include_header {
                        for (col_idx, col) in columns.iter().enumerate() {
                            ws.write_string(0, col_idx as u16, &col.name)
                                .map_err(map_xlsx_err)?;
                        }
                        xlsx_row = 1;
                    }
                    header_written = true;
                }

                if !xlsx_row_limit_hit {
                    for row in &chunk.rows {
                        if xlsx_row > XLSX_MAX_ROWS {
                            xlsx_row_limit_hit = true;
                            tracing::warn!(
                                session_id = %session_id,
                                "xlsx export: Excel row limit ({}) reached, truncating",
                                XLSX_MAX_ROWS
                            );
                            break;
                        }
                        for (col_idx, cell) in row.iter().enumerate() {
                            write_xlsx_cell(ws, xlsx_row, col_idx as u16, cell)?;
                        }
                        xlsx_row += 1;
                        rows_exported += 1;
                    }
                }
            }
            _ => {
                return Err(AppError::ConfigError(format!("Unknown format: {format}")));
            }
        }

        // Flush buffer to file (not used for json or xlsx)
        if !buf.is_empty() && format != "json" && format != "xlsx" {
            file.write_all(&buf).map_err(|e| AppError::IoError(e.to_string()))?;
            buf.clear();
        }

        offset += CHUNK_SIZE;

        // Emit progress
        let _ = app.emit(
            "export:progress",
            ExportProgress {
                current: rows_exported,
                total,
                format: format.clone(),
            },
        );

        if chunk.rows.len() < CHUNK_SIZE as usize || xlsx_row_limit_hit {
            break;
        }
    }

    // Finalise JSON — write all collected rows at once
    if format == "json" {
        let output = serde_json::Value::Array(json_rows);
        let json_str = if pretty {
            serde_json::to_string_pretty(&output)
        } else {
            serde_json::to_string(&output)
        }
        .map_err(|e| AppError::ConfigError(e.to_string()))?;
        file.write_all(json_str.as_bytes())
            .map_err(|e| AppError::IoError(e.to_string()))?;
    }

    // Finalise XLSX — push worksheet into a workbook and save to file_path
    if let Some(worksheet) = xlsx_worksheet {
        let mut workbook = Workbook::new();
        workbook.push_worksheet(worksheet);
        workbook.save(&file_path).map_err(map_xlsx_err)?;
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    tracing::info!(
        session_id = %session_id,
        rows = rows_exported,
        duration_ms = duration_ms,
        "export_to_file complete"
    );

    Ok(ExportResult {
        rows_exported,
        file_path,
        duration_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // write_xlsx_cell
    // ---------------------------------------------------------------------------

    #[test]
    fn test_write_xlsx_cell_null_writes_empty_string() {
        let mut ws = Worksheet::new();
        assert!(write_xlsx_cell(&mut ws, 0, 0, &None).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_integer_value() {
        let mut ws = Worksheet::new();
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("42".to_string())).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_float_value() {
        let mut ws = Worksheet::new();
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("3.14".to_string())).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_negative_number() {
        let mut ws = Worksheet::new();
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("-100.5".to_string())).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_string_value() {
        let mut ws = Worksheet::new();
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("hello world".to_string())).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_date_string() {
        let mut ws = Worksheet::new();
        // Dates kept as strings (not numeric)
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("2024-01-15".to_string())).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_long_string_truncated() {
        let mut ws = Worksheet::new();
        // Strings >32,767 chars must be silently truncated without panicking
        let long = "x".repeat(40_000);
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some(long)).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_empty_string() {
        let mut ws = Worksheet::new();
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some(String::new())).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_scientific_notation_is_number() {
        let mut ws = Worksheet::new();
        // "1e10" parses as f64, should be stored as number
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("1e10".to_string())).is_ok());
    }

    // ---------------------------------------------------------------------------
    // escape_csv_field
    // ---------------------------------------------------------------------------

    #[test]
    fn test_escape_csv_field_plain() {
        assert_eq!(escape_csv_field("hello", ",", '"'), "hello");
    }

    #[test]
    fn test_escape_csv_field_with_delimiter() {
        assert_eq!(escape_csv_field("a,b", ",", '"'), "\"a,b\"");
    }

    #[test]
    fn test_escape_csv_field_with_quote() {
        assert_eq!(escape_csv_field("say \"hi\"", ",", '"'), "\"say \"\"hi\"\"\"");
    }

    #[test]
    fn test_escape_csv_field_with_newline() {
        assert_eq!(escape_csv_field("line\nbreak", ",", '"'), "\"line\nbreak\"");
    }

    // ---------------------------------------------------------------------------
    // escape_sql_value
    // ---------------------------------------------------------------------------

    #[test]
    fn test_escape_sql_value_no_quotes() {
        assert_eq!(escape_sql_value("hello"), "hello");
    }

    #[test]
    fn test_escape_sql_value_with_single_quote() {
        assert_eq!(escape_sql_value("it's"), "it''s");
    }

    #[test]
    fn test_escape_sql_value_multiple_quotes() {
        assert_eq!(escape_sql_value("a'b'c"), "a''b''c");
    }

    // ---------------------------------------------------------------------------
    // XLSX_MAX_ROWS constant
    // ---------------------------------------------------------------------------

    #[test]
    fn test_xlsx_max_rows_is_excel_limit() {
        // Excel supports 1,048,576 rows total; with row 0 as header,
        // max data row index is 1,048,575
        assert_eq!(XLSX_MAX_ROWS, 1_048_575_u32);
    }
}
