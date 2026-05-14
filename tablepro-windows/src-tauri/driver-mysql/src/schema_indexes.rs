//! Schema introspection: indexes and foreign keys.
use std::collections::HashMap;

use mysql_async::Conn;

use driver_common::{DriverError, ForeignKeyInfo, IndexInfo};

use crate::schema_tables::{get_str, get_str_or, query_rows};

// ── fetch_indexes ─────────────────────────────────────────────────────────────

pub async fn fetch_indexes(conn: &mut Conn, table: &str) -> Result<Vec<IndexInfo>, DriverError> {
    let safe = table.replace('`', "``");
    let rows = query_rows(conn, &format!("SHOW INDEX FROM `{safe}`")).await?;

    let mut order: Vec<String> = Vec::new();
    let mut map: HashMap<String, (Vec<String>, bool, String)> = HashMap::new();

    for row in &rows {
        let index_name = match get_str(row, 2) {
            Some(n) => n,
            None => continue,
        };
        let col_name = match get_str(row, 4) {
            Some(c) => c,
            None => continue,
        };
        let non_unique = get_str(row, 1).as_deref() == Some("1");
        let idx_type = get_str_or(row, 10, "BTREE");

        if let Some(entry) = map.get_mut(&index_name) {
            entry.0.push(col_name);
        } else {
            order.push(index_name.clone());
            map.insert(index_name, (vec![col_name], !non_unique, idx_type));
        }
    }

    let mut items: Vec<IndexInfo> = Vec::with_capacity(order.len());
    for name in order {
        let (cols, is_unique, idx_type) = map.remove(&name).expect("name was just inserted");
        items.push(IndexInfo {
            name,
            columns: cols,
            is_unique,
            index_type: idx_type,
        });
    }

    Ok(items)
}

// ── fetch_foreign_keys ───────────────────────────────────────────────────────

pub async fn fetch_foreign_keys(
    conn: &mut Conn,
    table: &str,
    database: &str,
) -> Result<Vec<ForeignKeyInfo>, DriverError> {
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
    let mut items: Vec<ForeignKeyInfo> = Vec::with_capacity(rows.len());
    for row in &rows {
        let name = match get_str(row, 0) {
            Some(n) => n,
            None => continue,
        };
        let column = match get_str(row, 1) {
            Some(c) => c,
            None => continue,
        };
        let ref_table = match get_str(row, 2) {
            Some(t) => t,
            None => continue,
        };
        let ref_col = match get_str(row, 3) {
            Some(c) => c,
            None => continue,
        };
        items.push(ForeignKeyInfo {
            name,
            column,
            referenced_table: ref_table,
            referenced_column: ref_col,
        });
    }

    Ok(items)
}
