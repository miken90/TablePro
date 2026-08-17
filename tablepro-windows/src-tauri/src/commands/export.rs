use std::sync::Arc;
use std::time::Instant;

use rust_xlsxwriter::{Workbook, Worksheet};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tokio::task;

use crate::models::AppError;
use crate::drivers::DatabaseDriver;
use crate::services::sql_generator::Dialect;
use crate::services::sql_pagination::{count_subquery, paginated_subquery};
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
    let file_path = {
        // dev-only: WSL host path bridge
        #[cfg(unix)]
        {
            if file_path.len() >= 2 {
                let mut chars = file_path.chars();
                let drive = chars.next().unwrap();
                let colon = chars.next().unwrap();
                if drive.is_ascii_alphabetic() && colon == ':' {
                    let rest: String = chars.collect();
                    let normalized_rest = rest.replace('\\', "/");
                    let translated = if normalized_rest.starts_with('/') {
                        format!("/mnt/{}{}", drive.to_ascii_lowercase(), normalized_rest)
                    } else {
                        format!("/mnt/{}/{}", drive.to_ascii_lowercase(), normalized_rest)
                    };
                    tracing::info!("Translated Windows path to WSL path: {file_path} -> {translated}");
                    translated
                } else {
                    file_path
                }
            } else {
                file_path
            }
        }
        #[cfg(not(unix))]
        {
            file_path
        }
    };

    tracing::info!(session_id = %session_id, format = %format, "export_to_file: {} to {}", &sql, &file_path);

    // Create parent directories if they don't exist
    let parent_fp = file_path.clone();
    task::spawn_blocking(move || {
        if let Some(parent) = std::path::Path::new(&parent_fp).parent() {
            std::fs::create_dir_all(parent)?;
        }
        Ok::<(), std::io::Error>(())
    }).await.map_err(map_join_err)??;

    let start = Instant::now();
    let (driver, supports_export): (Arc<dyn DatabaseDriver>, bool) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let db_type = mgr
            .get_config(&session_id)
            .map(|c| c.db_type.clone())
            .unwrap_or_else(|_| driver.database_type_id().to_string());
        let supports_export = mgr
            .driver_registry()
            .get_capabilities(&db_type)
            .supports_import_export;
        (driver, supports_export)
    };
    let driver_type = driver.database_type_id().to_string();

    // Engines that declare `supportsImportExport: false` (MongoDB, Redis) are
    // hidden in the UI, but the command is reachable directly. Refuse here
    // with a clear message instead of letting a document/key-value engine
    // choke on `SELECT * FROM (…)`.
    if !supports_export {
        return Err(AppError::ConfigError(format!(
            "Export is not supported for {driver_type} connections"
        )));
    }

    let dialect = Dialect::from_db_type(&driver_type);

    // Count total rows (with timeout to avoid blocking on slow queries).
    // `None` means the dialect cannot count a wrapped query safely; the total
    // is then whatever we actually read, reported once the export finishes.
    let total = match count_subquery(&sql, "_export_count", dialect) {
        None => 0,
        Some(count_sql) => match tokio::time::timeout(
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
        },
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
        // `None` = this dialect cannot page a wrapped query without risking a
        // corrupt export (see `sql_pagination`), so run the user's query once
        // and treat the whole result as a single chunk.
        let paginated = paginated_subquery(&sql, "_export_data", CHUNK_SIZE, offset, dialect);
        let single_pass = paginated.is_none();
        let chunk_sql = paginated.unwrap_or_else(|| sql.clone());
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
        if single_pass || chunk.rows.len() < CHUNK_SIZE as usize || xlsx_row_limit_hit { break; }
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

    /// The XLSX path must emit a real OOXML workbook, not a mislabelled text
    /// dump — the format is offered in the export dialog on this basis.
    #[test]
    fn test_xlsx_export_produces_a_valid_ooxml_workbook() {
        use super::super::export_writers::{write_xlsx_chunk, XlsxChunkOpts, XlsxChunkState};

        let columns = vec![
            crate::models::ColumnInfo {
                name: "id".to_string(),
                type_name: "INT".to_string(),
                nullable: false,
                is_primary_key: true,
            },
            crate::models::ColumnInfo {
                name: "name".to_string(),
                type_name: "TEXT".to_string(),
                nullable: true,
                is_primary_key: false,
            },
        ];
        let rows = vec![
            vec![Some("1".to_string()), Some("alice".to_string())],
            vec![Some("2".to_string()), None],
        ];

        let mut ws = Worksheet::new();
        let mut rows_exported: u64 = 0;
        let state = XlsxChunkState {
            row_limit: XLSX_MAX_ROWS,
            session_id: "test".to_string(),
        };
        let opts = XlsxChunkOpts {
            xlsx_row: 0,
            xlsx_row_limit_hit: false,
            include_header: true,
            header_written: false,
        };
        let (header_written, next_row, limit_hit) =
            write_xlsx_chunk(&mut ws, &rows, &columns, opts, &mut rows_exported, &state).unwrap();
        assert!(header_written);
        assert!(!limit_hit);
        assert_eq!(next_row, 3, "header row + 2 data rows");
        assert_eq!(rows_exported, 2);

        let mut workbook = Workbook::new();
        workbook.push_worksheet(ws);
        let bytes = workbook.save_to_buffer().expect("workbook save failed");

        // XLSX is a zip container: local file header magic.
        assert_eq!(
            &bytes[..4],
            b"PK\x03\x04",
            "not a zip container — XLSX output would be corrupt"
        );
        // The zip's central directory stores entry names uncompressed, so the
        // required OOXML parts are findable in the raw bytes.
        for part in ["xl/workbook.xml", "[Content_Types].xml", "xl/worksheets/"] {
            assert!(
                bytes
                    .windows(part.len())
                    .any(|w| w == part.as_bytes()),
                "workbook is missing required OOXML part: {part}"
            );
        }
    }
}
