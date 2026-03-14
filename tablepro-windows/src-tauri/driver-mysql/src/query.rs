/// Query execution: execute() and cancel().
use mysql_async::prelude::Queryable;
use mysql_async::Row;
use tablepro_plugin_sdk::{FfiColumnInfo, FfiQueryResult, FfiString};

use crate::driver::MySqlDriver;
use crate::ffi::{query_result_error, string_to_ffi, vec_into_raw};

/// Run a SQL statement and return an FfiQueryResult.
pub fn do_execute(driver: &mut MySqlDriver, sql: &str) -> FfiQueryResult {
    match driver.runtime.block_on(run_query(driver.conn.as_mut(), sql)) {
        Ok(result) => result,
        Err(e) => query_result_error(e),
    }
}

async fn run_query(
    conn: Option<&mut mysql_async::Conn>,
    sql: &str,
) -> Result<FfiQueryResult, String> {
    let conn = conn.ok_or("Not connected")?;

    let mut result = conn.query_iter(sql).await.map_err(|e| e.to_string())?;

    let col_names: Vec<String> = result
        .columns()
        .as_deref()
        .map(|cols| cols.iter().map(|c| c.name_str().into_owned()).collect())
        .unwrap_or_default();

    let col_types: Vec<String> = result
        .columns()
        .as_deref()
        .map(|cols| cols.iter().map(|c| format!("{:?}", c.column_type())).collect())
        .unwrap_or_default();

    let column_count = col_names.len();

    let mut raw_rows: Vec<Row> = Vec::new();
    result.for_each(|row| raw_rows.push(row)).await.map_err(|e| e.to_string())?;

    let affected = result.affected_rows() as i64;

    let col_infos: Vec<FfiColumnInfo> = col_names
        .into_iter()
        .zip(col_types)
        .map(|(name, type_name)| FfiColumnInfo {
            name: string_to_ffi(name),
            type_name: string_to_ffi(type_name),
            nullable: true,
            is_primary_key: false,
        })
        .collect();

    // Flat cells array (row-major).
    let mut cells: Vec<FfiString> = Vec::new();
    for row in &raw_rows {
        for i in 0..column_count {
            let val: Option<String> = row.get_opt(i).and_then(|r| r.ok()).unwrap_or(None);
            cells.push(string_to_ffi(val.unwrap_or_default()));
        }
    }

    let row_count = raw_rows.len();
    let (col_ptr, col_len) = vec_into_raw(col_infos);
    let (cell_ptr, _) = vec_into_raw(cells);

    Ok(FfiQueryResult {
        columns: col_ptr,
        column_count: col_len,
        cells: cell_ptr,
        row_count,
        affected_rows: affected,
        error: FfiString::null(),
    })
}
