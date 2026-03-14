/// Schema introspection: tables, columns, databases, DDL.
use mysql_async::prelude::Queryable;
use mysql_async::Row;
use tablepro_plugin_sdk::{FfiColumnInfo, FfiColumnList, FfiString, FfiStringList, FfiTableInfo, FfiTableList};

use crate::driver::MySqlDriver;
use crate::ffi::{column_list_error, ffi_error, string_list_error, string_to_ffi, table_list_error, vec_into_raw};

// ── Shared query helper ───────────────────────────────────────────────────────

pub fn get_str(row: &Row, idx: usize) -> Option<String> {
    row.get_opt::<String, _>(idx)?.ok()
}

pub fn get_str_or(row: &Row, idx: usize, default: &str) -> String {
    get_str(row, idx).unwrap_or_else(|| default.to_owned())
}

pub async fn query_rows(conn: &mut mysql_async::Conn, sql: &str) -> Result<Vec<Row>, String> {
    let mut result = conn.query_iter(sql).await.map_err(|e| e.to_string())?;
    let mut rows: Vec<Row> = Vec::new();
    result.for_each(|r| rows.push(r)).await.map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── fetch_tables ─────────────────────────────────────────────────────────────

pub fn do_fetch_tables(driver: &mut MySqlDriver) -> FfiTableList {
    match driver.runtime.block_on(fetch_tables_async(driver.conn.as_mut())) {
        Ok(list) => list,
        Err(e) => table_list_error(e),
    }
}

async fn fetch_tables_async(conn: Option<&mut mysql_async::Conn>) -> Result<FfiTableList, String> {
    let conn = conn.ok_or("Not connected")?;
    let rows = query_rows(conn, "SHOW FULL TABLES").await?;
    let mut items: Vec<FfiTableInfo> = Vec::with_capacity(rows.len());
    for row in &rows {
        let name = match get_str(row, 0) { Some(n) => n, None => continue };
        let type_str = get_str_or(row, 1, "BASE TABLE");
        let ttype = if type_str.contains("VIEW") { "VIEW" } else { "TABLE" };
        items.push(FfiTableInfo {
            name: string_to_ffi(name),
            schema: FfiString::null(),
            table_type: string_to_ffi(ttype.to_owned()),
            row_count_estimate: -1,
            has_row_count: false,
        });
    }
    let (ptr, len) = vec_into_raw(items);
    Ok(FfiTableList { items: ptr, count: len, error: FfiString::null() })
}

// ── fetch_columns ─────────────────────────────────────────────────────────────

pub fn do_fetch_columns(driver: &mut MySqlDriver, table: &str) -> FfiColumnList {
    let table = table.to_owned();
    match driver.runtime.block_on(fetch_columns_async(driver.conn.as_mut(), &table)) {
        Ok(list) => list,
        Err(e) => column_list_error(e),
    }
}

async fn fetch_columns_async(
    conn: Option<&mut mysql_async::Conn>,
    table: &str,
) -> Result<FfiColumnList, String> {
    let conn = conn.ok_or("Not connected")?;
    let safe = table.replace('`', "``");
    let rows = query_rows(conn, &format!("SHOW FULL COLUMNS FROM `{safe}`")).await?;
    let mut items: Vec<FfiColumnInfo> = Vec::with_capacity(rows.len());
    for row in &rows {
        let name = match get_str(row, 0) { Some(n) => n, None => continue };
        let data_type = get_str_or(row, 1, "TEXT");
        let upper = data_type.to_uppercase();
        let normalized = if upper.starts_with("ENUM(") || upper.starts_with("SET(") { data_type } else { upper };
        let is_nullable = get_str(row, 3).as_deref() == Some("YES");
        let is_pk = get_str(row, 4).as_deref() == Some("PRI");
        items.push(FfiColumnInfo {
            name: string_to_ffi(name),
            type_name: string_to_ffi(normalized),
            nullable: is_nullable,
            is_primary_key: is_pk,
        });
    }
    let (ptr, len) = vec_into_raw(items);
    Ok(FfiColumnList { items: ptr, count: len, error: FfiString::null() })
}

// ── fetch_databases ──────────────────────────────────────────────────────────

pub fn do_fetch_databases(driver: &mut MySqlDriver) -> FfiStringList {
    match driver.runtime.block_on(fetch_databases_async(driver.conn.as_mut())) {
        Ok(list) => list,
        Err(e) => string_list_error(e),
    }
}

async fn fetch_databases_async(conn: Option<&mut mysql_async::Conn>) -> Result<FfiStringList, String> {
    let conn = conn.ok_or("Not connected")?;
    let rows = query_rows(conn, "SHOW DATABASES").await?;
    let mut items: Vec<FfiString> = Vec::with_capacity(rows.len());
    for row in &rows {
        if let Some(name) = get_str(row, 0) { items.push(string_to_ffi(name)); }
    }
    let (ptr, len) = vec_into_raw(items);
    Ok(FfiStringList { items: ptr, count: len, error: FfiString::null() })
}

// ── fetch_ddl ────────────────────────────────────────────────────────────────

pub fn do_fetch_ddl(driver: &mut MySqlDriver, table: &str) -> FfiString {
    let table = table.to_owned();
    match driver.runtime.block_on(fetch_ddl_async(driver.conn.as_mut(), &table)) {
        Ok(ddl) => string_to_ffi(ddl),
        Err(e) => ffi_error(e),
    }
}

async fn fetch_ddl_async(conn: Option<&mut mysql_async::Conn>, table: &str) -> Result<String, String> {
    let conn = conn.ok_or("Not connected")?;
    let safe = table.replace('`', "``");
    let sql = format!("SHOW CREATE TABLE `{safe}`");
    if let Ok(rows) = query_rows(conn, &sql).await {
        if let Some(row) = rows.first() {
            if let Some(ddl) = get_str(row, 1) {
                return Ok(if ddl.ends_with(';') { ddl } else { ddl + ";" });
            }
        }
    }
    let sql = format!("SHOW CREATE VIEW `{safe}`");
    let rows = query_rows(conn, &sql).await?;
    let row = rows.first().ok_or_else(|| format!("No DDL found for '{table}'"))?;
    get_str(row, 1).ok_or_else(|| format!("Empty DDL for '{table}'"))
}
