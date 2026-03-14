/// Schema introspection: indexes and foreign keys.
use std::collections::HashMap;
use tablepro_plugin_sdk::{FfiForeignKeyInfo, FfiForeignKeyList, FfiIndexInfo, FfiIndexList, FfiString};

use crate::driver::MySqlDriver;
use crate::ffi::{fk_list_error, index_list_error, string_to_ffi, vec_into_raw};
use crate::schema_tables::{get_str, get_str_or, query_rows};

// ── fetch_indexes ─────────────────────────────────────────────────────────────

pub fn do_fetch_indexes(driver: &mut MySqlDriver, table: &str) -> FfiIndexList {
    let table = table.to_owned();
    match driver.runtime.block_on(fetch_indexes_async(driver.conn.as_mut(), &table)) {
        Ok(list) => list,
        Err(e) => index_list_error(e),
    }
}

async fn fetch_indexes_async(
    conn: Option<&mut mysql_async::Conn>,
    table: &str,
) -> Result<FfiIndexList, String> {
    let conn = conn.ok_or("Not connected")?;
    let safe = table.replace('`', "``");
    let rows = query_rows(conn, &format!("SHOW INDEX FROM `{safe}`")).await?;

    let mut order: Vec<String> = Vec::new();
    let mut map: HashMap<String, (Vec<String>, bool, String)> = HashMap::new();

    for row in &rows {
        let index_name = match get_str(row, 2) { Some(n) => n, None => continue };
        let col_name = match get_str(row, 4) { Some(c) => c, None => continue };
        let non_unique = get_str(row, 1).as_deref() == Some("1");
        let idx_type = get_str_or(row, 10, "BTREE");

        if let Some(entry) = map.get_mut(&index_name) {
            entry.0.push(col_name);
        } else {
            order.push(index_name.clone());
            map.insert(index_name, (vec![col_name], !non_unique, idx_type));
        }
    }

    let mut items: Vec<FfiIndexInfo> = Vec::with_capacity(order.len());
    for name in order {
        let (cols, is_unique, idx_type) = map.remove(&name).unwrap();
        let (col_ptr, col_len) = vec_into_raw(cols.into_iter().map(string_to_ffi).collect::<Vec<_>>());
        items.push(FfiIndexInfo {
            name: string_to_ffi(name),
            columns: col_ptr,
            column_count: col_len,
            is_unique,
            index_type: string_to_ffi(idx_type),
        });
    }

    let (ptr, len) = vec_into_raw(items);
    Ok(FfiIndexList { items: ptr, count: len, error: FfiString::null() })
}

// ── fetch_foreign_keys ───────────────────────────────────────────────────────

pub fn do_fetch_foreign_keys(driver: &mut MySqlDriver, table: &str) -> FfiForeignKeyList {
    let table = table.to_owned();
    let database = driver.database.clone();
    match driver.runtime.block_on(fetch_fks_async(driver.conn.as_mut(), &table, &database)) {
        Ok(list) => list,
        Err(e) => fk_list_error(e),
    }
}

async fn fetch_fks_async(
    conn: Option<&mut mysql_async::Conn>,
    table: &str,
    database: &str,
) -> Result<FfiForeignKeyList, String> {
    let conn = conn.ok_or("Not connected")?;
    let escaped_db = database.replace('\'', "''");
    let escaped_table = table.replace('\'', "''");

    let sql = format!(
        "SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, \
         kcu.REFERENCED_COLUMN_NAME \
         FROM information_schema.KEY_COLUMN_USAGE kcu \
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc \
             ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME \
             AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA \
         WHERE kcu.TABLE_SCHEMA = '{escaped_db}' \
             AND kcu.TABLE_NAME = '{escaped_table}' \
             AND kcu.REFERENCED_TABLE_NAME IS NOT NULL \
         ORDER BY kcu.CONSTRAINT_NAME"
    );

    let rows = query_rows(conn, &sql).await?;
    let mut items: Vec<FfiForeignKeyInfo> = Vec::with_capacity(rows.len());
    for row in &rows {
        let name = match get_str(row, 0) { Some(n) => n, None => continue };
        let column = match get_str(row, 1) { Some(c) => c, None => continue };
        let ref_table = match get_str(row, 2) { Some(t) => t, None => continue };
        let ref_col = match get_str(row, 3) { Some(c) => c, None => continue };
        items.push(FfiForeignKeyInfo {
            name: string_to_ffi(name),
            column: string_to_ffi(column),
            referenced_table: string_to_ffi(ref_table),
            referenced_column: string_to_ffi(ref_col),
        });
    }

    let (ptr, len) = vec_into_raw(items);
    Ok(FfiForeignKeyList { items: ptr, count: len, error: FfiString::null() })
}
