//! Schema introspection: tables, columns, databases, DDL.
use mysql_async::prelude::Queryable;
use mysql_async::{Conn, Row};

use driver_common::{ColumnInfo, DriverError, TableInfo};

// ── Shared query helpers ─────────────────────────────────────────────────────

pub(crate) fn get_str(row: &Row, idx: usize) -> Option<String> {
    row.get_opt::<String, _>(idx)?.ok()
}

pub(crate) fn get_str_or(row: &Row, idx: usize, default: &str) -> String {
    get_str(row, idx).unwrap_or_else(|| default.to_owned())
}

pub(crate) async fn query_rows(conn: &mut Conn, sql: &str) -> Result<Vec<Row>, DriverError> {
    let mut result = conn
        .query_iter(sql)
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;
    let mut rows: Vec<Row> = Vec::new();
    result
        .for_each(|r| rows.push(r))
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;
    Ok(rows)
}

// ── fetch_tables ─────────────────────────────────────────────────────────────

pub async fn fetch_tables(conn: &mut Conn) -> Result<Vec<TableInfo>, DriverError> {
    let rows = query_rows(conn, "SHOW FULL TABLES").await?;
    let mut items: Vec<TableInfo> = Vec::with_capacity(rows.len());
    for row in &rows {
        let name = match get_str(row, 0) {
            Some(n) => n,
            None => continue,
        };
        let type_str = get_str_or(row, 1, "BASE TABLE");
        let ttype = if type_str.contains("VIEW") { "VIEW" } else { "TABLE" };
        items.push(TableInfo {
            name,
            schema: None,
            table_type: ttype.to_owned(),
            row_count_estimate: None,
        });
    }
    Ok(items)
}

// ── fetch_columns ─────────────────────────────────────────────────────────────

pub async fn fetch_columns(conn: &mut Conn, table: &str) -> Result<Vec<ColumnInfo>, DriverError> {
    let safe = table.replace('`', "``");
    let rows = query_rows(conn, &format!("SHOW FULL COLUMNS FROM `{safe}`")).await?;
    let mut items: Vec<ColumnInfo> = Vec::with_capacity(rows.len());
    for row in &rows {
        let name = match get_str(row, 0) {
            Some(n) => n,
            None => continue,
        };
        let data_type = get_str_or(row, 1, "TEXT");
        let upper = data_type.to_uppercase();
        let normalized = if upper.starts_with("ENUM(") || upper.starts_with("SET(") {
            data_type
        } else {
            upper
        };
        let is_nullable = get_str(row, 3).as_deref() == Some("YES");
        let is_pk = get_str(row, 4).as_deref() == Some("PRI");
        items.push(ColumnInfo {
            name,
            type_name: normalized,
            nullable: is_nullable,
            is_primary_key: is_pk,
        });
    }
    Ok(items)
}

// ── fetch_databases ──────────────────────────────────────────────────────────

pub async fn fetch_databases(conn: &mut Conn) -> Result<Vec<String>, DriverError> {
    let rows = query_rows(conn, "SHOW DATABASES").await?;
    let mut items: Vec<String> = Vec::with_capacity(rows.len());
    for row in &rows {
        if let Some(name) = get_str(row, 0) {
            items.push(name);
        }
    }
    Ok(items)
}

// ── fetch_ddl ────────────────────────────────────────────────────────────────

pub async fn fetch_ddl(conn: &mut Conn, table: &str) -> Result<String, DriverError> {
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
    let row = rows
        .first()
        .ok_or_else(|| DriverError::Query(format!("No DDL found for '{table}'")))?;
    get_str(row, 1).ok_or_else(|| DriverError::Query(format!("Empty DDL for '{table}'")))
}
