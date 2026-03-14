//! driver-mssql — SQL Server driver plugin for TablePro.
//!
//! Exports `tablepro_plugin_init` and `tablepro_plugin_metadata` per the
//! PluginVTable contract (API version 1).

mod ddl;
mod driver;
mod ffi;
mod free;
mod handlers;
mod schema;
mod schema_indexes;

use tablepro_plugin_sdk::{PluginMetadata, PluginVTable, API_VERSION};

use ffi::string_to_ffi;

// ── Plugin entry points ────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn tablepro_plugin_metadata() -> PluginMetadata {
    PluginMetadata {
        api_version: API_VERSION,
        type_id: string_to_ffi("mssql".to_owned()),
        display_name: string_to_ffi("SQL Server".to_owned()),
        default_port: 1433,
    }
}

#[no_mangle]
/// Fill every function pointer in `vtable`.
///
/// # Safety
/// `vtable` must be a valid, non-null pointer to a `PluginVTable` allocated
/// by the host. The pointer must remain valid for the duration of this call.
pub unsafe extern "C" fn tablepro_plugin_init(vtable: *mut PluginVTable) {
    if vtable.is_null() {
        return;
    }
    (*vtable).api_version = API_VERSION;

    // Lifecycle
    (*vtable).create_driver = handlers::create_driver;
    (*vtable).destroy_driver = handlers::destroy_driver;

    // Connection
    (*vtable).connect = handlers::connect;
    (*vtable).disconnect = handlers::disconnect;
    (*vtable).ping = handlers::ping;

    // Query
    (*vtable).execute = handlers::execute;
    (*vtable).cancel = handlers::cancel;

    // Schema
    (*vtable).fetch_tables = handlers::fetch_tables;
    (*vtable).fetch_columns = handlers::fetch_columns;
    (*vtable).fetch_indexes = handlers::fetch_indexes;
    (*vtable).fetch_foreign_keys = handlers::fetch_foreign_keys;
    (*vtable).fetch_databases = handlers::fetch_databases;
    (*vtable).fetch_ddl = handlers::fetch_ddl;

    // Free
    (*vtable).free_result = free::free_result;
    (*vtable).free_query_result = free::free_query_result;
    (*vtable).free_table_list = free::free_table_list;
    (*vtable).free_column_list = free::free_column_list;
    (*vtable).free_index_list = free::free_index_list;
    (*vtable).free_foreign_key_list = free::free_foreign_key_list;
    (*vtable).free_string_list = free::free_string_list;
    (*vtable).free_string = free::free_string;
}
