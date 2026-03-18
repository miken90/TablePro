use std::io::Write as IoWrite;
use std::sync::{Arc, Mutex as StdMutex};

use crate::models::{AppError, ColumnInfo};

use super::export_formats::{
    escape_csv_field, escape_sql_value, generate_create_table, indent_pretty_json,
    map_xlsx_err, row_to_json_value, write_csv_row, write_file_chunk, write_xlsx_cell,
};
use crate::services::sql_quoting::quote_identifier;

// ---------------------------------------------------------------------------
// CSV chunk writer
// ---------------------------------------------------------------------------

/// Write one CSV chunk into `buf`. Returns updated `header_written`.
pub(crate) fn write_csv_chunk(
    buf: &mut Vec<u8>,
    rows: &[Vec<Option<String>>],
    columns: &[ColumnInfo],
    delimiter: &str,
    include_header: bool,
    header_written: bool,
    rows_exported: &mut u64,
) -> Result<bool, AppError> {
    let mut written = header_written;
    if !written && include_header {
        let headers: Vec<String> = columns
            .iter()
            .map(|c| escape_csv_field(&c.name, delimiter, '"'))
            .collect();
        writeln!(buf, "{}", headers.join(delimiter))
            .map_err(|e| AppError::IoError(e.to_string()))?;
    }
    written = true;

    for row in rows {
        write_csv_row(buf, row, delimiter, '"')?;
        *rows_exported += 1;
    }
    Ok(written)
}

// ---------------------------------------------------------------------------
// JSON chunk writer
// ---------------------------------------------------------------------------

/// Write one JSON chunk directly to file. Returns updated `json_first_row`.
pub(crate) async fn write_json_chunk(
    file: Arc<StdMutex<std::fs::File>>,
    rows: &[Vec<Option<String>>],
    columns: &[ColumnInfo],
    array_of_arrays: bool,
    pretty: bool,
    json_first_row: bool,
    rows_exported: &mut u64,
) -> Result<bool, AppError> {
    let mut first = json_first_row;
    for row in rows {
        let value = row_to_json_value(row, columns, array_of_arrays);
        let payload = if pretty {
            indent_pretty_json(&serde_json::to_string_pretty(&value)?)
        } else {
            serde_json::to_string(&value)?
        };

        let mut chunk_bytes = Vec::with_capacity(payload.len() + 4);
        if !first {
            if pretty {
                chunk_bytes.extend_from_slice(b",\n");
            } else {
                chunk_bytes.push(b',');
            }
        }
        chunk_bytes.extend_from_slice(payload.as_bytes());
        write_file_chunk(file.clone(), chunk_bytes).await?;

        first = false;
        *rows_exported += 1;
    }
    Ok(first)
}

// ---------------------------------------------------------------------------
// SQL chunk writer
// ---------------------------------------------------------------------------

/// Options for writing a SQL chunk.
pub(crate) struct SqlChunkOpts<'a> {
    pub table_name: &'a str,
    pub driver_type: &'a str,
    pub include_create_table: bool,
    pub batch_size: usize,
}

/// Write one SQL chunk into `buf`. Returns updated `header_written`.
pub(crate) fn write_sql_chunk(
    buf: &mut Vec<u8>,
    rows: &[Vec<Option<String>>],
    columns: &[ColumnInfo],
    opts: &SqlChunkOpts<'_>,
    header_written: bool,
    rows_exported: &mut u64,
) -> Result<bool, AppError> {
    let mut written = header_written;
    if !written {
        if opts.include_create_table {
            let ddl = generate_create_table(opts.table_name, columns, opts.driver_type);
            buf.extend_from_slice(ddl.as_bytes());
        }
        written = true;
    }

    let quoted_table = quote_identifier(opts.table_name, opts.driver_type);
    let col_list: Vec<String> = columns
        .iter()
        .map(|c| quote_identifier(&c.name, opts.driver_type))
        .collect();
    let col_list = col_list.join(", ");

    for batch in rows.chunks(opts.batch_size) {
        let mut stmt = format!("INSERT INTO {quoted_table} ({col_list}) VALUES\n");
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
            *rows_exported += 1;
        }
        stmt.push_str(&value_rows.join(",\n"));
        stmt.push_str(";\n");
        buf.extend_from_slice(stmt.as_bytes());
    }
    Ok(written)
}

// ---------------------------------------------------------------------------
// XLSX chunk writer
// ---------------------------------------------------------------------------

/// Per-export state needed when writing each XLSX chunk.
pub(crate) struct XlsxChunkState {
    pub row_limit: u32,
    pub session_id: String,
}

/// Options for writing an XLSX chunk.
pub(crate) struct XlsxChunkOpts {
    pub xlsx_row: u32,
    pub xlsx_row_limit_hit: bool,
    pub include_header: bool,
    pub header_written: bool,
}

/// Write one XLSX chunk to the worksheet. Returns `(header_written, xlsx_row, row_limit_hit)`.
pub(crate) fn write_xlsx_chunk(
    ws: &mut rust_xlsxwriter::Worksheet,
    rows: &[Vec<Option<String>>],
    columns: &[ColumnInfo],
    opts: XlsxChunkOpts,
    rows_exported: &mut u64,
    state: &XlsxChunkState,
) -> Result<(bool, u32, bool), AppError> {
    let mut written = opts.header_written;
    let mut row_idx = opts.xlsx_row;
    let mut limit_hit = opts.xlsx_row_limit_hit;

    if !written {
        if opts.include_header {
            for (col_idx, col) in columns.iter().enumerate() {
                ws.write_string(0, col_idx as u16, &col.name)
                    .map_err(map_xlsx_err)?;
            }
            row_idx = 1;
        }
        written = true;
    }

    if !limit_hit {
        for row in rows {
            if row_idx > state.row_limit {
                limit_hit = true;
                tracing::warn!(
                    session_id = %state.session_id,
                    "xlsx export: Excel row limit ({}) reached, truncating",
                    state.row_limit
                );
                break;
            }
            for (col_idx, cell) in row.iter().enumerate() {
                write_xlsx_cell(ws, row_idx, col_idx as u16, cell)?;
            }
            row_idx += 1;
            *rows_exported += 1;
        }
    }

    Ok((written, row_idx, limit_hit))
}
