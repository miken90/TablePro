use crate::driver::SqliteDriver;
use crate::ffi_helpers::{
    build_query_result, err_query_result, err_result, ok_result, string_to_ffi,
};
use tablepro_plugin_sdk::{
    DriverHandle, FfiQueryResult, FfiResult, FfiStr, FfiString, FfiTableInfo, FfiTableList,
};

pub unsafe fn connect(handle: *mut DriverHandle) -> FfiResult {
    let driver = &*(handle as *mut SqliteDriver);
    let db_path = driver.database.clone();

    let result: Result<rusqlite::Connection, String> = driver.runtime.block_on(async {
        tokio::task::spawn_blocking(move || {
            rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    });

    match result {
        Ok(conn) => {
            // Enable WAL mode for better concurrency
            let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");
            // Set busy timeout to 5 seconds
            let _ = conn.execute_batch("PRAGMA busy_timeout=5000;");

            let interrupt = conn.get_interrupt_handle();
            {
                let mut guard = driver.interrupt_handle.lock().unwrap();
                *guard = Some(interrupt);
            }
            {
                let mut guard = driver.conn.lock().unwrap();
                *guard = Some(conn);
            }
            ok_result()
        }
        Err(e) => err_result(e),
    }
}

pub unsafe fn disconnect(handle: *mut DriverHandle) {
    let driver = &*(handle as *mut SqliteDriver);
    {
        let mut guard = driver.interrupt_handle.lock().unwrap();
        *guard = None;
    }
    {
        let mut guard = driver.conn.lock().unwrap();
        *guard = None;
    }
}

pub unsafe fn ping(handle: *mut DriverHandle) -> FfiResult {
    let driver = &*(handle as *mut SqliteDriver);
    let guard = driver.conn.lock().unwrap();
    match guard.as_ref() {
        None => err_result("Not connected".to_string()),
        Some(conn) => match conn.execute_batch("SELECT 1") {
            Ok(_) => ok_result(),
            Err(e) => err_result(e.to_string()),
        },
    }
}

pub unsafe fn execute(handle: *mut DriverHandle, sql: FfiStr) -> FfiQueryResult {
    let driver = &*(handle as *mut SqliteDriver);
    let sql_str = sql.as_str().to_owned();
    let guard = driver.conn.lock().unwrap();
    let conn = match guard.as_ref() {
        None => return err_query_result("Not connected".to_string()),
        Some(c) => c,
    };

    let mut stmt = match conn.prepare(&sql_str) {
        Ok(s) => s,
        Err(e) => return err_query_result(e.to_string()),
    };

    let col_count = stmt.column_count();

    // No columns means it's a write statement (INSERT/UPDATE/DELETE)
    if col_count == 0 {
        match stmt.execute([]) {
            Ok(affected) => {
                return build_query_result(vec![], vec![], affected as i64);
            }
            Err(e) => return err_query_result(e.to_string()),
        }
    }

    // Build column metadata
    let col_meta = stmt.columns();
    let columns: Vec<(String, String, bool, bool)> = (0..col_count)
        .map(|i| {
            let name = col_meta[i].name().to_string();
            let type_name = col_meta[i]
                .decl_type()
                .unwrap_or("")
                .to_uppercase();
            (name, type_name, true, false)
        })
        .collect();

    // Fetch rows
    let rows_result: Result<Vec<Vec<Option<String>>>, rusqlite::Error> = stmt
        .query_map([], |row| {
            let mut cells = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val: rusqlite::Result<Option<String>> = row.get(i);
                cells.push(val.unwrap_or(None));
            }
            Ok(cells)
        })
        .and_then(|mapped| mapped.collect());

    match rows_result {
        Ok(rows) => build_query_result(columns, rows, 0),
        Err(e) => err_query_result(e.to_string()),
    }
}

pub unsafe fn cancel(handle: *mut DriverHandle) -> FfiResult {
    let driver = &*(handle as *mut SqliteDriver);
    let guard = driver.interrupt_handle.lock().unwrap();
    match guard.as_ref() {
        None => err_result("No active connection to cancel".to_string()),
        Some(interrupt) => {
            interrupt.interrupt();
            ok_result()
        }
    }
}

pub unsafe fn fetch_tables(handle: *mut DriverHandle) -> FfiTableList {
    let driver = &*(handle as *mut SqliteDriver);
    let guard = driver.conn.lock().unwrap();
    let conn = match guard.as_ref() {
        None => {
            return FfiTableList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
        Some(c) => c,
    };

    let sql = "SELECT name, type FROM sqlite_master \
               WHERE type IN ('table','view') \
               AND name NOT LIKE 'sqlite_%' \
               ORDER BY name";

    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(e) => {
            return FfiTableList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(e.to_string()),
            }
        }
    };

    let rows: Result<Vec<FfiTableInfo>, rusqlite::Error> = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let type_raw: String = row.get(1)?;
            let table_type = if type_raw == "view" { "VIEW" } else { "TABLE" };
            Ok(FfiTableInfo {
                name: string_to_ffi(name),
                schema: string_to_ffi(String::new()),
                table_type: string_to_ffi(table_type.to_string()),
                row_count_estimate: 0,
                has_row_count: false,
            })
        })
        .and_then(|mapped| mapped.collect());

    match rows {
        Ok(mut items) => {
            let ptr = items.as_mut_ptr();
            let count = items.len();
            std::mem::forget(items);
            FfiTableList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
        Err(e) => FfiTableList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e.to_string()),
        },
    }
}
