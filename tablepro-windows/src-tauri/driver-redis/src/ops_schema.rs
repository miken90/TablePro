use redis::cmd;
use tablepro_plugin_sdk::{
    DriverHandle, FfiColumnInfo, FfiColumnList, FfiForeignKeyList, FfiIndexList, FfiStr, FfiString,
    FfiStringList, FfiTableInfo, FfiTableList,
};

use crate::driver::RedisDriver;
use crate::ffi_helpers::string_to_ffi;

/// Fetch databases from INFO keyspace — returns db0, db1, ... with key counts.
pub unsafe fn fetch_databases(handle: *mut DriverHandle) -> FfiStringList {
    let driver = &mut *(handle as *mut RedisDriver);
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => {
            return FfiStringList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e),
            }
        }
    };

    let info: String = match cmd("INFO").arg("keyspace").query(conn) {
        Ok(v) => v,
        Err(e) => {
            return FfiStringList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(format!("INFO keyspace failed: {e}")),
            }
        }
    };

    // Parse lines like "db0:keys=42,expires=5,avg_ttl=0"
    let mut db_names: Vec<String> = info
        .lines()
        .filter(|line| line.starts_with("db"))
        .filter_map(|line| {
            let colon = line.find(':')?;
            let name = &line[..colon];
            let rest = &line[colon + 1..];
            // Extract key count for display
            let keys = rest
                .split(',')
                .find(|p| p.starts_with("keys="))
                .and_then(|p| p.strip_prefix("keys="))
                .unwrap_or("0");
            Some(format!("{name} ({keys} keys)"))
        })
        .collect();

    // If no databases have keys, at least show db0
    if db_names.is_empty() {
        db_names.push("db0 (0 keys)".to_string());
    }

    let mut items: Vec<FfiString> = db_names.into_iter().map(string_to_ffi).collect();
    let ptr = items.as_mut_ptr();
    let count = items.len();
    std::mem::forget(items);

    FfiStringList {
        items: ptr,
        count,
        error: FfiString::null(),
    }
}

/// Fetch tables = SCAN keys in the current database.
/// Returns keys as table entries with schema set to the db index.
pub unsafe fn fetch_tables(handle: *mut DriverHandle) -> FfiTableList {
    let driver = &mut *(handle as *mut RedisDriver);
    let db_label = format!("db{}", driver.current_db);
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => {
            return FfiTableList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e),
            }
        }
    };

    // Use SCAN to get up to 200 keys for sidebar display
    let mut keys: Vec<String> = Vec::new();
    let mut cursor: u64 = 0;
    let max_keys: usize = 200;

    loop {
        let result: (u64, Vec<String>) = match cmd("SCAN")
            .arg(cursor)
            .arg("COUNT")
            .arg(100)
            .query(conn)
        {
            Ok(r) => r,
            Err(e) => {
                return FfiTableList {
                    items: std::ptr::null_mut(),
                    count: 0,
                    error: string_to_ffi(format!("SCAN failed: {e}")),
                }
            }
        };

        cursor = result.0;
        keys.extend(result.1);

        if cursor == 0 || keys.len() >= max_keys {
            break;
        }
    }

    keys.truncate(max_keys);

    let mut items: Vec<FfiTableInfo> = keys
        .into_iter()
        .map(|key| FfiTableInfo {
            name: string_to_ffi(key),
            schema: string_to_ffi(db_label.clone()),
            table_type: string_to_ffi("KEY".to_string()),
            row_count_estimate: 0,
            has_row_count: false,
        })
        .collect();

    let ptr = items.as_mut_ptr();
    let count = items.len();
    std::mem::forget(items);

    FfiTableList {
        items: ptr,
        count,
        error: FfiString::null(),
    }
}

/// Fetch columns — returns fixed columns: Key, Type, TTL, Value.
pub unsafe fn fetch_columns(
    _handle: *mut DriverHandle,
    _table: FfiStr,
    _schema: FfiStr,
) -> FfiColumnList {
    let mut items: Vec<FfiColumnInfo> = vec![
        FfiColumnInfo {
            name: string_to_ffi("Key".to_string()),
            type_name: string_to_ffi("string".to_string()),
            nullable: false,
            is_primary_key: true,
        },
        FfiColumnInfo {
            name: string_to_ffi("Type".to_string()),
            type_name: string_to_ffi("string".to_string()),
            nullable: false,
            is_primary_key: false,
        },
        FfiColumnInfo {
            name: string_to_ffi("TTL".to_string()),
            type_name: string_to_ffi("integer".to_string()),
            nullable: false,
            is_primary_key: false,
        },
        FfiColumnInfo {
            name: string_to_ffi("Value".to_string()),
            type_name: string_to_ffi("string".to_string()),
            nullable: true,
            is_primary_key: false,
        },
    ];

    let ptr = items.as_mut_ptr();
    let count = items.len();
    std::mem::forget(items);

    FfiColumnList {
        items: ptr,
        count,
        error: FfiString::null(),
    }
}

/// Redis has no indexes — return empty list.
pub unsafe fn fetch_indexes(
    _handle: *mut DriverHandle,
    _table: FfiStr,
    _schema: FfiStr,
) -> FfiIndexList {
    FfiIndexList {
        items: std::ptr::null_mut(),
        count: 0,
        error: FfiString::null(),
    }
}

/// Redis has no foreign keys — return empty list.
pub unsafe fn fetch_foreign_keys(
    _handle: *mut DriverHandle,
    _table: FfiStr,
    _schema: FfiStr,
) -> FfiForeignKeyList {
    FfiForeignKeyList {
        items: std::ptr::null_mut(),
        count: 0,
        error: FfiString::null(),
    }
}

/// Redis has no DDL — return a descriptive message.
pub unsafe fn fetch_ddl(
    _handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiString {
    let name = table.as_str();
    string_to_ffi(format!(
        "-- Redis key '{}'\n-- DDL is not applicable for Redis keys.",
        name
    ))
}
