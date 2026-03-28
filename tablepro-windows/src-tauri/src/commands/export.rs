use std::sync::Arc;
use std::time::Instant;

use rust_xlsxwriter::{Workbook, Worksheet};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tokio::task;

use crate::models::AppError;
use crate::plugin::DatabaseDriver;
use crate::services::ConnectionManager;

use super::export_formats::{create_output_file, map_join_err, map_xlsx_err, write_file_chunk};
use super::export_writers::{
    write_csv_chunk, write_json_chunk, write_sql_chunk, write_xlsx_chunk,
    SqlChunkOpts, XlsxChunkOpts, XlsxChunkState,
};

/// Excel row limit (1,048,576 rows per sheet, row 0 is header)
pub(crate) const XLSX_MAX_ROWS: u32 = 1_048_575;

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
    let driver: Arc<dyn DatabaseDriver> = {
        let mgr = manager.lock().await;
        mgr.get_driver(&session_id)?
    };
    let driver_type = driver.database_type_id().to_string();

    // Count total rows (with timeout to avoid blocking on slow queries).
    let total = {
        let count_sql = format!("SELECT COUNT(*) FROM ({sql}) AS _export_count");
        match tokio::time::timeout(
            std::time::Duration::from_secs(2),
            driver.execute(&count_sql),
        ).await {
            Ok(Ok(result)) => result
                .rows.first()
                .and_then(|r| r.first())
                .and_then(|v| v.as_deref())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0),
            Ok(Err(e)) => {
                tracing::warn!(session_id = %session_id, "Export count query failed: {e}");
                0
            }
            Err(_) => {
                tracing::warn!(session_id = %session_id, "Export count query timed out (2s), using indeterminate progress");
                0
            }
        }
    };

    tracing::info!(session_id = %session_id, "export total rows: {}", total);

    let output_file = if format == "xlsx" {
        None
    } else {
        Some(create_output_file(&file_path).await?)
    };

    let delimiter = options.delimiter.as_deref().unwrap_or(",").to_string();
    let include_header = options.include_header.unwrap_or(true);
    let pretty = options.pretty.unwrap_or(false);
    let array_of_arrays = options.array_of_arrays.unwrap_or(false);
    let table_name = options.table_name.clone().unwrap_or_else(|| "export".to_string());
    let include_create_table = options.include_create_table.unwrap_or(false);
    let batch_size = options.batch_size.unwrap_or(100).max(1) as usize;

    let mut rows_exported: u64 = 0;
    let mut offset: u64 = 0;
    let mut header_written = false;
    let mut json_first_row = true;
    let mut buf: Vec<u8> = Vec::with_capacity(64 * 1024);

    // JSON: write opening bracket.
    if format == "json" {
        let open = if pretty { b"[\n".to_vec() } else { b"[".to_vec() };
        write_file_chunk(output_file.as_ref().cloned().ok_or_else(|| AppError::IoError("Missing output file handle".to_string()))?, open).await?;
    }

    // XLSX: create worksheet.
    let mut xlsx_worksheet: Option<Worksheet> = if format == "xlsx" { Some(Worksheet::new()) } else { None };
    let mut xlsx_row: u32 = 0;
    let mut xlsx_row_limit_hit = false;

    loop {
        let chunk_sql = format!("SELECT * FROM ({sql}) AS _export_data LIMIT {CHUNK_SIZE} OFFSET {offset}");
        let chunk = driver.execute(&chunk_sql).await?;
        if chunk.rows.is_empty() { break; }
        let columns = &chunk.columns;

        match format.as_str() {
            "csv" => {
                header_written = write_csv_chunk(
                    &mut buf, &chunk.rows, columns, &delimiter,
                    include_header, header_written, &mut rows_exported,
                )?;
            }
            "json" => {
                let file = output_file.as_ref().cloned()
                    .ok_or_else(|| AppError::IoError("Missing output file".to_string()))?;
                json_first_row = write_json_chunk(
                    file, &chunk.rows, columns, array_of_arrays,
                    pretty, json_first_row, &mut rows_exported,
                ).await?;
            }
            "sql" => {
                let opts = SqlChunkOpts {
                    table_name: &table_name,
                    driver_type: &driver_type,
                    include_create_table,
                    batch_size,
                };
                header_written = write_sql_chunk(
                    &mut buf, &chunk.rows, columns, &opts, header_written, &mut rows_exported,
                )?;
            }
            "xlsx" => {
                let ws = xlsx_worksheet.as_mut().expect("xlsx worksheet initialised before loop");
                let state = XlsxChunkState { row_limit: XLSX_MAX_ROWS, session_id: session_id.clone() };
                let opts = XlsxChunkOpts {
                    xlsx_row, xlsx_row_limit_hit, include_header, header_written,
                };
                (header_written, xlsx_row, xlsx_row_limit_hit) = write_xlsx_chunk(
                    ws, &chunk.rows, columns, opts, &mut rows_exported, &state,
                )?;
            }
            _ => return Err(AppError::ConfigError(format!("Unknown format: {format}"))),
        }

        // Flush text buffer.
        if !buf.is_empty() && matches!(format.as_str(), "csv" | "sql") {
            let bytes = std::mem::take(&mut buf);
            write_file_chunk(output_file.as_ref().cloned().ok_or_else(|| AppError::IoError("Missing output file handle".to_string()))?, bytes).await?;
            buf = Vec::with_capacity(64 * 1024);
        }

        offset += CHUNK_SIZE;
        let _ = app.emit("export:progress", ExportProgress { current: rows_exported, total, format: format.clone() });
        if chunk.rows.len() < CHUNK_SIZE as usize || xlsx_row_limit_hit { break; }
    }

    // Finalize JSON.
    if format == "json" {
        let close = if pretty { b"\n]".to_vec() } else { b"]".to_vec() };
        write_file_chunk(output_file.as_ref().cloned().ok_or_else(|| AppError::IoError("Missing output file handle".to_string()))?, close).await?;
    }

    // Finalize XLSX.
    if let Some(worksheet) = xlsx_worksheet {
        let fp = file_path.clone();
        task::spawn_blocking(move || {
            let mut workbook = Workbook::new();
            workbook.push_worksheet(worksheet);
            workbook.save(&fp).map_err(map_xlsx_err)
        }).await.map_err(map_join_err)??;
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    tracing::info!(session_id = %session_id, rows = rows_exported, duration_ms, "export_to_file complete");

    Ok(ExportResult { rows_exported, file_path, duration_ms })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::export_formats::{escape_csv_field, escape_sql_value, write_xlsx_cell};

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
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("2024-01-15".to_string())).is_ok());
    }

    #[test]
    fn test_write_xlsx_cell_long_string_truncated() {
        let mut ws = Worksheet::new();
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
        assert!(write_xlsx_cell(&mut ws, 0, 0, &Some("1e10".to_string())).is_ok());
    }

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

    #[test]
    fn test_generate_create_table_uses_driver_quoting() {
        use super::super::export_formats::generate_create_table;
        let columns = vec![crate::models::ColumnInfo {
            name: "na]me".to_string(),
            type_name: "TEXT".to_string(),
            nullable: true,
            is_primary_key: false,
        }];
        let ddl = generate_create_table("my]table", &columns, "mssql");
        assert!(ddl.contains("CREATE TABLE IF NOT EXISTS [my]]table]"));
        assert!(ddl.contains("[na]]me] TEXT"));
    }

    #[test]
    fn test_xlsx_max_rows_is_excel_limit() {
        assert_eq!(XLSX_MAX_ROWS, 1_048_575_u32);
    }
}
