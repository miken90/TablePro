use crate::types::{
    DriverConfig, DriverHandle, FfiColumnList, FfiForeignKeyList, FfiIndexList, FfiQueryResult,
    FfiResult, FfiStr, FfiString, FfiStringList, FfiTableList,
};

/// Metadata exposed by a plugin describing the database type it handles.
#[repr(C)]
pub struct PluginMetadata {
    pub api_version: u32,
    pub type_id: FfiString,
    pub display_name: FfiString,
    pub default_port: u16,
}

unsafe impl Send for PluginMetadata {}
unsafe impl Sync for PluginMetadata {}

/// Function-pointer table exported by every plugin DLL.
///
/// The plugin exports `tablepro_plugin_init(vtable: *mut PluginVTable)` which
/// fills in every function pointer. The host validates `api_version` before use.
///
/// Memory contract:
/// - `create_driver` — plugin allocates the handle, host never frees it directly
/// - `destroy_driver` — plugin frees the handle
/// - All `FfiString` returns are plugin-allocated; host calls the matching `free_*` fn
/// - `FfiStr` inputs are borrowed — plugin must not store pointers beyond the call
#[repr(C)]
pub struct PluginVTable {
    pub api_version: u32,

    // ── Driver lifecycle ────────────────────────────────────────────────────
    /// Allocate and initialise a driver instance. Returns null on error.
    pub create_driver: unsafe extern "C" fn(config: *const DriverConfig) -> *mut DriverHandle,

    /// Destroy a driver instance created by `create_driver`.
    pub destroy_driver: unsafe extern "C" fn(handle: *mut DriverHandle),

    // ── Connection ──────────────────────────────────────────────────────────
    pub connect: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiResult,
    pub disconnect: unsafe extern "C" fn(handle: *mut DriverHandle),
    pub ping: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiResult,

    // ── Query ───────────────────────────────────────────────────────────────
    pub execute: unsafe extern "C" fn(handle: *mut DriverHandle, sql: FfiStr) -> FfiQueryResult,
    pub cancel: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiResult,

    // ── Schema ──────────────────────────────────────────────────────────────
    pub fetch_tables: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiTableList,
    pub fetch_columns: unsafe extern "C" fn(
        handle: *mut DriverHandle,
        table: FfiStr,
        schema: FfiStr,
    ) -> FfiColumnList,
    pub fetch_indexes: unsafe extern "C" fn(
        handle: *mut DriverHandle,
        table: FfiStr,
        schema: FfiStr,
    ) -> FfiIndexList,
    pub fetch_foreign_keys: unsafe extern "C" fn(
        handle: *mut DriverHandle,
        table: FfiStr,
        schema: FfiStr,
    ) -> FfiForeignKeyList,
    pub fetch_databases: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiStringList,
    pub fetch_ddl:
        unsafe extern "C" fn(handle: *mut DriverHandle, table: FfiStr, schema: FfiStr) -> FfiString,

    // ── Free functions (plugin frees its own allocations) ──────────────────
    pub free_result: unsafe extern "C" fn(result: FfiResult),
    pub free_query_result: unsafe extern "C" fn(result: FfiQueryResult),
    pub free_table_list: unsafe extern "C" fn(list: FfiTableList),
    pub free_column_list: unsafe extern "C" fn(list: FfiColumnList),
    pub free_index_list: unsafe extern "C" fn(list: FfiIndexList),
    pub free_foreign_key_list: unsafe extern "C" fn(list: FfiForeignKeyList),
    pub free_string_list: unsafe extern "C" fn(list: FfiStringList),
    pub free_string: unsafe extern "C" fn(s: FfiString),
}

unsafe impl Send for PluginVTable {}
unsafe impl Sync for PluginVTable {}
