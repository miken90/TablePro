//! Index and foreign key schema queries for the MSSQL driver.
#![allow(clippy::get_first)]

use std::collections::HashMap;

use tablepro_plugin_sdk::{
    FfiForeignKeyInfo, FfiForeignKeyList, FfiIndexInfo, FfiIndexList, FfiString,
};

use crate::driver::MssqlDriver;
use crate::ffi::string_to_ffi;

fn escape_bracket(s: &str) -> String {
    s.replace(']', "]]")
}

pub fn fetch_indexes(driver: &MssqlDriver, table: &str, schema: &str) -> FfiIndexList {
    let schema = if schema.is_empty() { "dbo" } else { schema };
    let bt = escape_bracket(table);
    let bs = escape_bracket(schema);
    let full = format!("[{bs}].[{bt}]");
    let sql = format!(
        "SELECT i.name AS index_name, c.name AS column_name, i.is_unique, i.is_primary_key, i.type_desc \
         FROM sys.indexes i \
         JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id \
         JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id \
         WHERE i.object_id = OBJECT_ID('{full}') AND i.name IS NOT NULL \
         ORDER BY i.name, ic.key_ordinal"
    );

    match driver.execute_query(&sql) {
        Err(e) => FfiIndexList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e),
        },
        Ok((_, rows, _)) => build_index_list(rows),
    }
}

fn build_index_list(rows: Vec<Vec<Option<String>>>) -> FfiIndexList {
    let mut map: HashMap<String, (bool, String, Vec<String>)> = HashMap::new();
    for row in &rows {
        let idx_name = match row.get(0).and_then(|v| v.as_deref()) {
            Some(s) => s.to_owned(),
            None => continue,
        };
        let col_name = match row.get(1).and_then(|v| v.as_deref()) {
            Some(s) => s.to_owned(),
            None => continue,
        };
        let is_unique = row.get(2).and_then(|v| v.as_deref()) == Some("1");
        let idx_type = row
            .get(4)
            .and_then(|v| v.as_deref())
            .unwrap_or("NONCLUSTERED")
            .to_owned();
        let entry = map.entry(idx_name).or_insert((is_unique, idx_type, vec![]));
        entry.2.push(col_name);
    }

    let mut items: Vec<FfiIndexInfo> = map
        .into_iter()
        .map(|(name, (is_unique, idx_type, cols))| {
            let mut col_strings: Vec<FfiString> = cols.into_iter().map(string_to_ffi).collect();
            let col_count = col_strings.len();
            let col_ptr = col_strings.as_mut_ptr();
            std::mem::forget(col_strings);
            FfiIndexInfo {
                name: string_to_ffi(name),
                columns: col_ptr,
                column_count: col_count,
                is_unique,
                index_type: string_to_ffi(idx_type),
            }
        })
        .collect();

    items.sort_by(|a, b| {
        let an = unsafe { a.name.to_string_copy() };
        let bn = unsafe { b.name.to_string_copy() };
        an.cmp(&bn)
    });
    let count = items.len();
    let ptr = items.as_mut_ptr();
    std::mem::forget(items);
    FfiIndexList {
        items: ptr,
        count,
        error: FfiString::null(),
    }
}

pub fn fetch_foreign_keys(driver: &MssqlDriver, table: &str, schema: &str) -> FfiForeignKeyList {
    let schema = if schema.is_empty() { "dbo" } else { schema };
    let bt = escape_bracket(table);
    let bs = escape_bracket(schema);
    let full = format!("[{bs}].[{bt}]");
    let sql = format!(
        "SELECT fk.name AS fk_name, \
            COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name, \
            OBJECT_NAME(fk.referenced_object_id) AS referenced_table, \
            COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column \
         FROM sys.foreign_keys fk \
         JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id \
         WHERE fk.parent_object_id = OBJECT_ID('{full}') \
         ORDER BY fk.name"
    );

    match driver.execute_query(&sql) {
        Err(e) => FfiForeignKeyList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e),
        },
        Ok((_, rows, _)) => {
            let mut items: Vec<FfiForeignKeyInfo> = rows
                .into_iter()
                .filter_map(|row| {
                    let name = row.get(0)?.clone()?;
                    let column = row.get(1)?.clone()?;
                    let ref_table = row.get(2)?.clone()?;
                    let ref_col = row.get(3)?.clone()?;
                    Some(FfiForeignKeyInfo {
                        name: string_to_ffi(name),
                        column: string_to_ffi(column),
                        referenced_table: string_to_ffi(ref_table),
                        referenced_column: string_to_ffi(ref_col),
                    })
                })
                .collect();
            let count = items.len();
            let ptr = items.as_mut_ptr();
            std::mem::forget(items);
            FfiForeignKeyList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
    }
}
