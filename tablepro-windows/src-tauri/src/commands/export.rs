use std::io::Write as IoWrite;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::ConnectionManager;

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

    // Open the output file
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
            _ => {
                return Err(AppError::ConfigError(format!("Unknown format: {format}")));
            }
        }

        // Flush buffer to file
        if !buf.is_empty() && format != "json" {
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

        if chunk.rows.len() < CHUNK_SIZE as usize {
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
