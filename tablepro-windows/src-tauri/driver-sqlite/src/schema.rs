use crate::driver::SqliteDriver;
use crate::ffi_helpers::string_to_ffi;
use tablepro_plugin_sdk::{
    DriverHandle, FfiColumnInfo, FfiColumnList, FfiIndexInfo, FfiIndexList, FfiStr, FfiString,
};

pub unsafe fn fetch_columns(
    handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiColumnList {
    let driver = &*(handle as *mut SqliteDriver);
    let table_name = table.as_str().to_owned();
    let guard = driver.conn.lock().unwrap_or_else(|e| e.into_inner());
    let conn = match guard.as_ref() {
        None => {
            return FfiColumnList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
        Some(c) => c,
    };

    let safe_table = table_name.replace('\'', "''");
    let sql = format!("PRAGMA table_info('{}')", safe_table);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => {
            return FfiColumnList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e.to_string()),
            }
        }
    };

    // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
    let rows: Result<Vec<FfiColumnInfo>, rusqlite::Error> = stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            let type_name: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
            let notnull: i32 = row.get(3)?;
            let pk: i32 = row.get(5)?;
            Ok(FfiColumnInfo {
                name: string_to_ffi(name),
                type_name: string_to_ffi(type_name.to_uppercase()),
                nullable: notnull == 0,
                is_primary_key: pk > 0,
            })
        })
        .and_then(|mapped| mapped.collect());

    match rows {
        Ok(mut items) => {
            let ptr = items.as_mut_ptr();
            let count = items.len();
            std::mem::forget(items);
            FfiColumnList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
        Err(e) => FfiColumnList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e.to_string()),
        },
    }
}

pub unsafe fn fetch_indexes(
    handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiIndexList {
    let driver = &*(handle as *mut SqliteDriver);
    let table_name = table.as_str().to_owned();
    let guard = driver.conn.lock().unwrap_or_else(|e| e.into_inner());
    let conn = match guard.as_ref() {
        None => {
            return FfiIndexList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
        Some(c) => c,
    };

    let safe_table = table_name.replace('\'', "''");

    // Step 1: Get index list
    let list_sql = format!("PRAGMA index_list('{}')", safe_table);
    let mut list_stmt = match conn.prepare(&list_sql) {
        Ok(s) => s,
        Err(e) => {
            return FfiIndexList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e.to_string()),
            }
        }
    };

    // index_list columns: seq, name, unique, origin, partial
    let index_entries: Result<Vec<(String, bool)>, rusqlite::Error> = list_stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            let is_unique: bool = row.get::<_, i32>(2)? != 0;
            Ok((name, is_unique))
        })
        .and_then(|mapped| mapped.collect());

    let entries = match index_entries {
        Ok(e) => e,
        Err(e) => {
            return FfiIndexList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e.to_string()),
            }
        }
    };

    // Step 2: For each index, get column info
    let mut items: Vec<FfiIndexInfo> = Vec::new();
    for (idx_name, is_unique) in entries {
        let info_sql = format!("PRAGMA index_info('{}')", idx_name.replace('\'', "''"));
        if let Ok(mut info_stmt) = conn.prepare(&info_sql) {
            // index_info columns: seqno, cid, name
            let col_names: Vec<String> = info_stmt
                .query_map([], |row| {
                    let col_name: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
                    Ok(col_name)
                })
                .ok()
                .map(|mapped| mapped.filter_map(|r| r.ok()).collect())
                .unwrap_or_default();

            let mut ffi_cols: Vec<FfiString> = col_names.into_iter().map(string_to_ffi).collect();
            let col_ptr = ffi_cols.as_mut_ptr();
            let col_count = ffi_cols.len();
            std::mem::forget(ffi_cols);

            items.push(FfiIndexInfo {
                name: string_to_ffi(idx_name),
                columns: col_ptr,
                column_count: col_count,
                is_unique,
                index_type: string_to_ffi("BTREE".to_string()),
            });
        }
    }

    let ptr = items.as_mut_ptr();
    let count = items.len();
    std::mem::forget(items);
    FfiIndexList {
        items: ptr,
        count,
        error: FfiString::null(),
    }
}
