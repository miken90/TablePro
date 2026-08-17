//! Synchronous rusqlite helpers — invoked from within `spawn_blocking`.

use driver_common::{
    ColumnInfo, DriverError, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo,
};
use rusqlite::Connection;

pub fn ping(conn: &Connection) -> Result<(), DriverError> {
    conn.execute_batch("SELECT 1")
        .map_err(|e| DriverError::Query(e.to_string()))
}

pub fn execute(conn: &Connection, sql: &str) -> Result<QueryResult, DriverError> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let col_count = stmt.column_count();

    if col_count == 0 {
        let affected = stmt
            .execute([])
            .map_err(|e| DriverError::Query(e.to_string()))?;
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: affected as i64,
            execution_time_ms: 0.0,
            truncated: false,
            total_row_count: None,
        });
    }

    let col_meta = stmt.columns();
    let columns: Vec<ColumnInfo> = (0..col_count)
        .map(|i| ColumnInfo {
            name: col_meta[i].name().to_string(),
            type_name: col_meta[i].decl_type().unwrap_or("").to_uppercase(),
            nullable: true,
            is_primary_key: false,
        })
        .collect();

    let rows: Vec<Vec<Option<String>>> = stmt
        .query_map([], |row| {
            let mut cells = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val: rusqlite::Result<Option<String>> = row.get(i);
                cells.push(val.unwrap_or(None));
            }
            Ok(cells)
        })
        .and_then(|mapped| mapped.collect())
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(QueryResult {
        columns,
        rows,
        affected_rows: 0,
        execution_time_ms: 0.0,
        truncated: false,
        total_row_count: None,
    })
}

pub fn fetch_tables(conn: &Connection) -> Result<Vec<TableInfo>, DriverError> {
    let sql = "SELECT name, type FROM sqlite_master \
               WHERE type IN ('table','view') \
               AND name NOT LIKE 'sqlite_%' \
               ORDER BY name";
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let rows: Vec<TableInfo> = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let type_raw: String = row.get(1)?;
            let table_type = if type_raw == "view" { "VIEW" } else { "TABLE" };
            Ok(TableInfo {
                name,
                schema: None,
                table_type: table_type.to_string(),
                row_count_estimate: None,
            })
        })
        .and_then(|mapped| mapped.collect())
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows)
}

pub fn fetch_columns(conn: &Connection, table: &str) -> Result<Vec<ColumnInfo>, DriverError> {
    let safe = table.replace('\'', "''");
    let sql = format!("PRAGMA table_info('{}')", safe);
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| DriverError::Query(e.to_string()))?;

    // PRAGMA table_info: cid, name, type, notnull, dflt_value, pk
    let rows: Vec<ColumnInfo> = stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            let type_name: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
            let notnull: i32 = row.get(3)?;
            let pk: i32 = row.get(5)?;
            Ok(ColumnInfo {
                name,
                type_name: type_name.to_uppercase(),
                nullable: notnull == 0,
                is_primary_key: pk > 0,
            })
        })
        .and_then(|mapped| mapped.collect())
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows)
}

pub fn fetch_indexes(conn: &Connection, table: &str) -> Result<Vec<IndexInfo>, DriverError> {
    let safe = table.replace('\'', "''");
    let list_sql = format!("PRAGMA index_list('{}')", safe);
    let mut list_stmt = conn
        .prepare(&list_sql)
        .map_err(|e| DriverError::Query(e.to_string()))?;

    // index_list: seq, name, unique, origin, partial
    let entries: Vec<(String, bool)> = list_stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            let is_unique: bool = row.get::<_, i32>(2)? != 0;
            Ok((name, is_unique))
        })
        .and_then(|mapped| mapped.collect())
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let mut out: Vec<IndexInfo> = Vec::with_capacity(entries.len());
    for (idx_name, is_unique) in entries {
        let info_sql = format!("PRAGMA index_info('{}')", idx_name.replace('\'', "''"));
        let mut info_stmt = conn
            .prepare(&info_sql)
            .map_err(|e| DriverError::Query(e.to_string()))?;
        // index_info: seqno, cid, name
        let columns: Vec<String> = info_stmt
            .query_map([], |row| {
                let col_name: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
                Ok(col_name)
            })
            .and_then(|mapped| mapped.collect())
            .map_err(|e| DriverError::Query(e.to_string()))?;

        out.push(IndexInfo {
            name: idx_name,
            columns,
            is_unique,
            index_type: "BTREE".to_string(),
        });
    }
    Ok(out)
}

pub fn fetch_foreign_keys(
    conn: &Connection,
    table: &str,
) -> Result<Vec<ForeignKeyInfo>, DriverError> {
    let safe = table.replace('\'', "''");
    let sql = format!("PRAGMA foreign_key_list('{}')", safe);
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| DriverError::Query(e.to_string()))?;

    // foreign_key_list: id, seq, table, from, to, on_update, on_delete, match
    let table_owned = table.to_string();
    let rows: Vec<ForeignKeyInfo> = stmt
        .query_map([], |row| {
            let id: i32 = row.get(0)?;
            let ref_table: String = row.get(2)?;
            let from_col: String = row.get(3)?;
            let to_col: String = row.get(4)?;
            Ok(ForeignKeyInfo {
                name: format!("fk_{}_{}", table_owned, id),
                column: from_col,
                referenced_table: ref_table,
                referenced_column: to_col,
            })
        })
        .and_then(|mapped| mapped.collect())
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows)
}

pub fn fetch_databases(conn: &Connection) -> Result<Vec<String>, DriverError> {
    let mut stmt = conn
        .prepare("PRAGMA database_list")
        .map_err(|e| DriverError::Query(e.to_string()))?;
    // database_list: seq, name, file
    let rows: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .and_then(|mapped| mapped.collect())
        .map_err(|e| DriverError::Query(e.to_string()))?;
    Ok(rows)
}

pub fn fetch_ddl(conn: &Connection, table: &str) -> Result<String, DriverError> {
    let safe = table.replace('\'', "''");
    let sql = format!("SELECT sql FROM sqlite_master WHERE name = '{}'", safe);
    let result: Option<String> = conn
        .query_row(&sql, [], |row| row.get::<_, Option<String>>(0))
        .map_err(|e| DriverError::Query(e.to_string()))?;
    match result {
        Some(ddl) => {
            if ddl.ends_with(';') {
                Ok(ddl)
            } else {
                Ok(format!("{};", ddl))
            }
        }
        None => Err(DriverError::Query(format!("No DDL found for '{}'", table))),
    }
}
