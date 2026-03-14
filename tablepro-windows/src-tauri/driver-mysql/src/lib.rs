/// MySQL/MariaDB driver plugin — exports C ABI functions per PluginVTable contract.
mod driver;
mod ffi;
mod query;
mod schema_indexes;
mod schema_tables;

use tablepro_plugin_sdk::{
    DriverConfig, DriverHandle, FfiColumnList, FfiForeignKeyList, FfiIndexList, FfiQueryResult,
    FfiResult, FfiStr, FfiString, FfiStringList, FfiTableList, PluginMetadata, PluginVTable,
    API_VERSION,
};

use driver::{handle_as_driver, MySqlDriver};
use ffi::{
    err_result, ffi_error, free_column_list, free_foreign_key_list, free_index_list,
    free_query_result, free_result, free_string, free_string_list, free_table_list, ok_result,
    string_to_ffi,
};
use query::do_execute;
use schema_indexes::{do_fetch_foreign_keys, do_fetch_indexes};
use schema_tables::{do_fetch_columns, do_fetch_databases, do_fetch_ddl, do_fetch_tables};

// ── Driver lifecycle ─────────────────────────────────────────────────────────

unsafe extern "C" fn create_driver(config: *const DriverConfig) -> *mut DriverHandle {
    if config.is_null() {
        return std::ptr::null_mut();
    }
    match MySqlDriver::from_config(&*config) {
        Some(driver) => {
            let boxed = Box::new(driver);
            Box::into_raw(boxed) as *mut DriverHandle
        }
        None => std::ptr::null_mut(),
    }
}

unsafe extern "C" fn destroy_driver(handle: *mut DriverHandle) {
    if handle.is_null() {
        return;
    }
    let driver = handle as *mut MySqlDriver;
    let mut boxed = Box::from_raw(driver);
    boxed.do_disconnect();
    drop(boxed);
}

// ── Connection ───────────────────────────────────────────────────────────────

unsafe extern "C" fn connect(handle: *mut DriverHandle) -> FfiResult {
    if handle.is_null() {
        return err_result("Null handle".to_owned());
    }
    let driver = handle_as_driver(handle);
    match driver.do_connect() {
        Ok(()) => ok_result(),
        Err(e) => err_result(e),
    }
}

unsafe extern "C" fn disconnect(handle: *mut DriverHandle) {
    if handle.is_null() {
        return;
    }
    handle_as_driver(handle).do_disconnect();
}

unsafe extern "C" fn ping(handle: *mut DriverHandle) -> FfiResult {
    if handle.is_null() {
        return err_result("Null handle".to_owned());
    }
    let driver = handle_as_driver(handle);
    match driver.do_ping() {
        Ok(()) => ok_result(),
        Err(e) => err_result(e),
    }
}

// ── Query ────────────────────────────────────────────────────────────────────

unsafe extern "C" fn execute(handle: *mut DriverHandle, sql: FfiStr) -> FfiQueryResult {
    if handle.is_null() {
        return ffi::query_result_error("Null handle".to_owned());
    }
    let sql_str = sql.as_str().to_owned();
    let driver = handle_as_driver(handle);
    do_execute(driver, &sql_str)
}

/// Cancel is not directly supported by mysql_async in blocking mode.
/// We return success — callers should use connection timeouts instead.
unsafe extern "C" fn cancel(handle: *mut DriverHandle) -> FfiResult {
    let _ = handle;
    ok_result()
}

// ── Schema ───────────────────────────────────────────────────────────────────

unsafe extern "C" fn fetch_tables(handle: *mut DriverHandle) -> FfiTableList {
    if handle.is_null() {
        return ffi::table_list_error("Null handle".to_owned());
    }
    do_fetch_tables(handle_as_driver(handle))
}

unsafe extern "C" fn fetch_columns(
    handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiColumnList {
    if handle.is_null() {
        return ffi::column_list_error("Null handle".to_owned());
    }
    let table = table.as_str().to_owned();
    do_fetch_columns(handle_as_driver(handle), &table)
}

unsafe extern "C" fn fetch_indexes(
    handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiIndexList {
    if handle.is_null() {
        return ffi::index_list_error("Null handle".to_owned());
    }
    let table = table.as_str().to_owned();
    do_fetch_indexes(handle_as_driver(handle), &table)
}

unsafe extern "C" fn fetch_foreign_keys(
    handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiForeignKeyList {
    if handle.is_null() {
        return ffi::fk_list_error("Null handle".to_owned());
    }
    let table = table.as_str().to_owned();
    do_fetch_foreign_keys(handle_as_driver(handle), &table)
}

unsafe extern "C" fn fetch_databases(handle: *mut DriverHandle) -> FfiStringList {
    if handle.is_null() {
        return ffi::string_list_error("Null handle".to_owned());
    }
    do_fetch_databases(handle_as_driver(handle))
}

unsafe extern "C" fn fetch_ddl(
    handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiString {
    if handle.is_null() {
        return ffi_error("Null handle".to_owned());
    }
    let table = table.as_str().to_owned();
    do_fetch_ddl(handle_as_driver(handle), &table)
}

// ── Plugin entry points ──────────────────────────────────────────────────────

/// # Safety
/// `vtable` must be a valid non-null pointer to a `PluginVTable` that the host owns.
#[no_mangle]
pub unsafe extern "C" fn tablepro_plugin_init(vtable: *mut PluginVTable) {
    if vtable.is_null() {
        return;
    }
    (*vtable).api_version = API_VERSION;
    (*vtable).create_driver = create_driver;
    (*vtable).destroy_driver = destroy_driver;
    (*vtable).connect = connect;
    (*vtable).disconnect = disconnect;
    (*vtable).ping = ping;
    (*vtable).execute = execute;
    (*vtable).cancel = cancel;
    (*vtable).fetch_tables = fetch_tables;
    (*vtable).fetch_columns = fetch_columns;
    (*vtable).fetch_indexes = fetch_indexes;
    (*vtable).fetch_foreign_keys = fetch_foreign_keys;
    (*vtable).fetch_databases = fetch_databases;
    (*vtable).fetch_ddl = fetch_ddl;
    (*vtable).free_result = free_result;
    (*vtable).free_query_result = free_query_result;
    (*vtable).free_table_list = free_table_list;
    (*vtable).free_column_list = free_column_list;
    (*vtable).free_index_list = free_index_list;
    (*vtable).free_foreign_key_list = free_foreign_key_list;
    (*vtable).free_string_list = free_string_list;
    (*vtable).free_string = free_string;
}

#[no_mangle]
pub extern "C" fn tablepro_plugin_metadata() -> PluginMetadata {
    PluginMetadata {
        api_version: API_VERSION,
        type_id: string_to_ffi("mysql".to_owned()),
        display_name: string_to_ffi("MySQL".to_owned()),
        default_port: 3306,
    }
}
