//! VTable handlers — driver lifecycle, connection, query, and schema dispatch.

use tablepro_plugin_sdk::{
    DriverConfig, DriverHandle, FfiColumnList, FfiForeignKeyList, FfiIndexList, FfiQueryResult,
    FfiResult, FfiStr, FfiString, FfiStringList, FfiTableList,
};

use crate::driver::{build_query_result, err_query_result, MssqlDriver};
use crate::ffi::{err_result, ok_result};
use crate::schema;

pub unsafe fn handle_as_driver(handle: *mut DriverHandle) -> &'static MssqlDriver {
    &*(handle as *mut MssqlDriver)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

pub unsafe extern "C" fn create_driver(config: *const DriverConfig) -> *mut DriverHandle {
    if config.is_null() {
        return std::ptr::null_mut();
    }
    match MssqlDriver::from_config(&*config) {
        Ok(driver) => Box::into_raw(driver) as *mut DriverHandle,
        Err(_) => std::ptr::null_mut(),
    }
}

pub unsafe extern "C" fn destroy_driver(handle: *mut DriverHandle) {
    if handle.is_null() {
        return;
    }
    let _ = Box::from_raw(handle as *mut MssqlDriver);
}

// ── Connection ─────────────────────────────────────────────────────────────────

pub unsafe extern "C" fn connect(handle: *mut DriverHandle) -> FfiResult {
    match handle_as_driver(handle).connect() {
        Ok(()) => ok_result(),
        Err(e) => err_result(e),
    }
}

pub unsafe extern "C" fn disconnect(handle: *mut DriverHandle) {
    handle_as_driver(handle).disconnect();
}

pub unsafe extern "C" fn ping(handle: *mut DriverHandle) -> FfiResult {
    match handle_as_driver(handle).ping() {
        Ok(()) => ok_result(),
        Err(e) => err_result(e),
    }
}

// ── Query ──────────────────────────────────────────────────────────────────────

pub unsafe extern "C" fn execute(handle: *mut DriverHandle, sql: FfiStr) -> FfiQueryResult {
    let sql_str = sql.as_str();
    match handle_as_driver(handle).execute_query(sql_str) {
        Ok((cols, rows, affected)) => build_query_result(cols, rows, affected),
        Err(e) => err_query_result(e),
    }
}

pub unsafe extern "C" fn cancel(_handle: *mut DriverHandle) -> FfiResult {
    // Tiberius has no per-query cancel flag; return success gracefully.
    ok_result()
}

// ── Schema ─────────────────────────────────────────────────────────────────────

pub unsafe extern "C" fn fetch_tables(handle: *mut DriverHandle) -> FfiTableList {
    schema::fetch_tables(handle_as_driver(handle))
}

pub unsafe extern "C" fn fetch_columns(
    handle: *mut DriverHandle,
    table: FfiStr,
    schema_ffi: FfiStr,
) -> FfiColumnList {
    schema::fetch_columns(
        handle_as_driver(handle),
        table.as_str(),
        schema_ffi.as_str(),
    )
}

pub unsafe extern "C" fn fetch_indexes(
    handle: *mut DriverHandle,
    table: FfiStr,
    schema_ffi: FfiStr,
) -> FfiIndexList {
    schema::fetch_indexes(
        handle_as_driver(handle),
        table.as_str(),
        schema_ffi.as_str(),
    )
}

pub unsafe extern "C" fn fetch_foreign_keys(
    handle: *mut DriverHandle,
    table: FfiStr,
    schema_ffi: FfiStr,
) -> FfiForeignKeyList {
    schema::fetch_foreign_keys(
        handle_as_driver(handle),
        table.as_str(),
        schema_ffi.as_str(),
    )
}

pub unsafe extern "C" fn fetch_databases(handle: *mut DriverHandle) -> FfiStringList {
    schema::fetch_databases(handle_as_driver(handle))
}

pub unsafe extern "C" fn fetch_ddl(
    handle: *mut DriverHandle,
    table: FfiStr,
    schema_ffi: FfiStr,
) -> FfiString {
    schema::fetch_ddl(
        handle_as_driver(handle),
        table.as_str(),
        schema_ffi.as_str(),
    )
}
