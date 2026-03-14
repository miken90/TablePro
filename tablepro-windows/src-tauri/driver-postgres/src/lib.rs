mod driver;
mod ffi_helpers;
mod free_fns;
mod ops_basic;
mod ops_schema;

use driver::PostgresDriver;
use ffi_helpers::{string_to_ffi, err_result};
use tablepro_plugin_sdk::{
    API_VERSION,
    DriverConfig, DriverHandle,
    PluginMetadata, PluginVTable,
};

// ── Plugin entry points ───────────────────────────────────────────────────────

/// Called by the host to fill all function pointers in the vtable.
///
/// # Safety
/// `vtable` must be a valid, non-null pointer to a `PluginVTable` allocated by the host.
#[no_mangle]
pub unsafe extern "C" fn tablepro_plugin_init(vtable: *mut PluginVTable) {
    if vtable.is_null() { return; }
    let v = &mut *vtable;
    v.api_version       = API_VERSION;
    v.create_driver     = create_driver;
    v.destroy_driver    = destroy_driver;
    v.connect           = connect;
    v.disconnect        = disconnect;
    v.ping              = ping;
    v.execute           = execute;
    v.cancel            = cancel;
    v.fetch_tables      = fetch_tables;
    v.fetch_columns     = fetch_columns;
    v.fetch_indexes     = fetch_indexes;
    v.fetch_foreign_keys = fetch_foreign_keys;
    v.fetch_databases   = fetch_databases;
    v.fetch_ddl         = fetch_ddl;
    v.free_result       = free_fns::free_result;
    v.free_query_result = free_fns::free_query_result;
    v.free_table_list   = free_fns::free_table_list;
    v.free_column_list  = free_fns::free_column_list;
    v.free_index_list   = free_fns::free_index_list;
    v.free_foreign_key_list = free_fns::free_foreign_key_list;
    v.free_string_list  = free_fns::free_string_list;
    v.free_string       = free_fns::free_string;
}

/// Returns static metadata for this plugin.
#[no_mangle]
pub extern "C" fn tablepro_plugin_metadata() -> PluginMetadata {
    PluginMetadata {
        api_version:  API_VERSION,
        type_id:      string_to_ffi("postgres".to_string()),
        display_name: string_to_ffi("PostgreSQL".to_string()),
        default_port: 5432,
    }
}

// ── Driver lifecycle ──────────────────────────────────────────────────────────

unsafe extern "C" fn create_driver(config: *const DriverConfig) -> *mut DriverHandle {
    if config.is_null() { return std::ptr::null_mut(); }
    let cfg = &*config;
    let host     = cfg.host.as_str().to_owned();
    let user     = cfg.user.as_str().to_owned();
    let password = cfg.password.as_str().to_owned();
    let database = cfg.database.as_str().to_owned();
    let ssl_mode = cfg.ssl_mode.as_str().to_owned();
    let port     = cfg.port;

    match PostgresDriver::new(host, port, user, password, database, ssl_mode) {
        Ok(boxed) => Box::into_raw(boxed) as *mut DriverHandle,
        Err(_)    => std::ptr::null_mut(),
    }
}

unsafe extern "C" fn destroy_driver(handle: *mut DriverHandle) {
    if !handle.is_null() {
        drop(Box::from_raw(handle as *mut PostgresDriver));
    }
}

// ── Connection ────────────────────────────────────────────────────────────────

unsafe extern "C" fn connect(handle: *mut DriverHandle) -> tablepro_plugin_sdk::FfiResult {
    if handle.is_null() { return err_result("Null handle".to_string()); }
    ops_basic::connect(handle)
}

unsafe extern "C" fn disconnect(handle: *mut DriverHandle) {
    if handle.is_null() { return; }
    ops_basic::disconnect(handle);
}

unsafe extern "C" fn ping(handle: *mut DriverHandle) -> tablepro_plugin_sdk::FfiResult {
    if handle.is_null() { return err_result("Null handle".to_string()); }
    ops_basic::ping(handle)
}

// ── Query ─────────────────────────────────────────────────────────────────────

unsafe extern "C" fn execute(
    handle: *mut DriverHandle,
    sql: tablepro_plugin_sdk::FfiStr,
) -> tablepro_plugin_sdk::FfiQueryResult {
    if handle.is_null() {
        return ffi_helpers::err_query_result("Null handle".to_string());
    }
    ops_basic::execute(handle, sql)
}

unsafe extern "C" fn cancel(handle: *mut DriverHandle) -> tablepro_plugin_sdk::FfiResult {
    if handle.is_null() { return err_result("Null handle".to_string()); }
    ops_basic::cancel(handle)
}

// ── Schema ────────────────────────────────────────────────────────────────────

unsafe extern "C" fn fetch_tables(
    handle: *mut DriverHandle,
) -> tablepro_plugin_sdk::FfiTableList {
    if handle.is_null() {
        return tablepro_plugin_sdk::FfiTableList {
            items: std::ptr::null_mut(), count: 0,
            error: string_to_ffi("Null handle".to_string()),
        };
    }
    ops_basic::fetch_tables(handle)
}

unsafe extern "C" fn fetch_columns(
    handle: *mut DriverHandle,
    table: tablepro_plugin_sdk::FfiStr,
    schema: tablepro_plugin_sdk::FfiStr,
) -> tablepro_plugin_sdk::FfiColumnList {
    if handle.is_null() {
        return tablepro_plugin_sdk::FfiColumnList {
            items: std::ptr::null_mut(), count: 0,
            error: string_to_ffi("Null handle".to_string()),
        };
    }
    ops_schema::fetch_columns(handle, table, schema)
}

unsafe extern "C" fn fetch_indexes(
    handle: *mut DriverHandle,
    table: tablepro_plugin_sdk::FfiStr,
    schema: tablepro_plugin_sdk::FfiStr,
) -> tablepro_plugin_sdk::FfiIndexList {
    if handle.is_null() {
        return tablepro_plugin_sdk::FfiIndexList {
            items: std::ptr::null_mut(), count: 0,
            error: string_to_ffi("Null handle".to_string()),
        };
    }
    ops_schema::fetch_indexes(handle, table, schema)
}

unsafe extern "C" fn fetch_foreign_keys(
    handle: *mut DriverHandle,
    table: tablepro_plugin_sdk::FfiStr,
    schema: tablepro_plugin_sdk::FfiStr,
) -> tablepro_plugin_sdk::FfiForeignKeyList {
    if handle.is_null() {
        return tablepro_plugin_sdk::FfiForeignKeyList {
            items: std::ptr::null_mut(), count: 0,
            error: string_to_ffi("Null handle".to_string()),
        };
    }
    ops_schema::fetch_foreign_keys(handle, table, schema)
}

unsafe extern "C" fn fetch_databases(
    handle: *mut DriverHandle,
) -> tablepro_plugin_sdk::FfiStringList {
    if handle.is_null() {
        return tablepro_plugin_sdk::FfiStringList {
            items: std::ptr::null_mut(), count: 0,
            error: string_to_ffi("Null handle".to_string()),
        };
    }
    ops_schema::fetch_databases(handle)
}

unsafe extern "C" fn fetch_ddl(
    handle: *mut DriverHandle,
    table: tablepro_plugin_sdk::FfiStr,
    schema: tablepro_plugin_sdk::FfiStr,
) -> tablepro_plugin_sdk::FfiString {
    if handle.is_null() { return string_to_ffi("ERROR: Null handle".to_string()); }
    ops_schema::fetch_ddl(handle, table, schema)
}
