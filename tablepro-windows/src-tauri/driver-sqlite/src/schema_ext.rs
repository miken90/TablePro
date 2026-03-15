use crate::driver::SqliteDriver;
use crate::ffi_helpers::string_to_ffi;
use tablepro_plugin_sdk::{
    DriverHandle, FfiForeignKeyInfo, FfiForeignKeyList, FfiStr, FfiString, FfiStringList,
};

pub unsafe fn fetch_foreign_keys(
    handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiForeignKeyList {
    let driver = &*(handle as *mut SqliteDriver);
    let table_name = table.as_str().to_owned();
    let guard = driver.conn.lock().unwrap();
    let conn = match guard.as_ref() {
        None => {
            return FfiForeignKeyList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
        Some(c) => c,
    };

    let safe_table = table_name.replace('\'', "''");
    let sql = format!("PRAGMA foreign_key_list('{}')", safe_table);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => {
            return FfiForeignKeyList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e.to_string()),
            }
        }
    };

    // foreign_key_list columns: id, seq, table, from, to, on_update, on_delete, match
    let rows: Result<Vec<FfiForeignKeyInfo>, rusqlite::Error> = stmt
        .query_map([], |row| {
            let id: i32 = row.get(0)?;
            let ref_table: String = row.get(2)?;
            let from_col: String = row.get(3)?;
            let to_col: String = row.get(4)?;
            let fk_name = format!("fk_{}_{}", table_name, id);
            Ok(FfiForeignKeyInfo {
                name: string_to_ffi(fk_name),
                column: string_to_ffi(from_col),
                referenced_table: string_to_ffi(ref_table),
                referenced_column: string_to_ffi(to_col),
            })
        })
        .and_then(|mapped| mapped.collect());

    match rows {
        Ok(mut items) => {
            let ptr = items.as_mut_ptr();
            let count = items.len();
            std::mem::forget(items);
            FfiForeignKeyList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
        Err(e) => FfiForeignKeyList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e.to_string()),
        },
    }
}

pub unsafe fn fetch_databases(handle: *mut DriverHandle) -> FfiStringList {
    let driver = &*(handle as *mut SqliteDriver);
    let guard = driver.conn.lock().unwrap();
    let conn = match guard.as_ref() {
        None => {
            return FfiStringList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
        Some(c) => c,
    };

    let mut stmt = match conn.prepare("PRAGMA database_list") {
        Ok(s) => s,
        Err(e) => {
            return FfiStringList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e.to_string()),
            }
        }
    };

    // database_list columns: seq, name, file
    let rows: Result<Vec<FfiString>, rusqlite::Error> = stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(string_to_ffi(name))
        })
        .and_then(|mapped| mapped.collect());

    match rows {
        Ok(mut items) => {
            let ptr = items.as_mut_ptr();
            let count = items.len();
            std::mem::forget(items);
            FfiStringList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
        Err(e) => FfiStringList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e.to_string()),
        },
    }
}

pub unsafe fn fetch_ddl(handle: *mut DriverHandle, table: FfiStr, _schema: FfiStr) -> FfiString {
    let driver = &*(handle as *mut SqliteDriver);
    let table_name = table.as_str().to_owned();
    let guard = driver.conn.lock().unwrap();
    let conn = match guard.as_ref() {
        None => return string_to_ffi("ERROR: Not connected".to_string()),
        Some(c) => c,
    };

    let safe_table = table_name.replace('\'', "''");
    let sql = format!(
        "SELECT sql FROM sqlite_master WHERE name = '{}'",
        safe_table
    );

    match conn.query_row(&sql, [], |row| row.get::<_, Option<String>>(0)) {
        Ok(Some(ddl)) => {
            let result = if ddl.ends_with(';') {
                ddl
            } else {
                format!("{};", ddl)
            };
            string_to_ffi(result)
        }
        Ok(None) => string_to_ffi(format!("ERROR: No DDL found for '{}'", table_name)),
        Err(e) => string_to_ffi(format!("ERROR: {}", e)),
    }
}
