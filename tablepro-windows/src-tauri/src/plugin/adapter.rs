use std::panic::catch_unwind;

#[path = "adapter_ffi_helpers.rs"]
mod adapter_ffi_helpers;
#[path = "adapter_ffi_list_converters.rs"]
mod adapter_ffi_list_converters;

use async_trait::async_trait;
use tablepro_plugin_sdk::{DriverConfig, DriverHandle, FfiStr, PluginVTable};

use crate::models::{AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo};
use crate::plugin::DatabaseDriver;
use adapter_ffi_helpers::{convert_query_result, ffi_result_to_rust, ffi_string_to_rust};
use adapter_ffi_list_converters::{
    convert_column_list, convert_foreign_key_list, convert_index_list, convert_string_list,
    convert_table_list,
};

/// Wraps a plugin vtable + DriverHandle into the DatabaseDriver trait.
///
/// # Safety contract
/// - `vtable` pointer must outlive this adapter (owned by PluginManager)
/// - `handle` is created/owned by the plugin; freed via `destroy_driver` in Drop
pub struct PluginDriverAdapter {
    vtable: *const PluginVTable,
    handle: *mut DriverHandle,
    type_id: String,
}

// SAFETY: PluginDriverAdapter is used exclusively through &self async methods
// behind a tokio spawn_blocking / Mutex boundary.
unsafe impl Send for PluginDriverAdapter {}
unsafe impl Sync for PluginDriverAdapter {}

impl PluginDriverAdapter {
    /// Create a new adapter — calls `vtable.create_driver`.
    ///
    /// # Safety
    /// `vtable` must point to a fully-initialised `PluginVTable` that remains
    /// valid for the lifetime of this adapter.
    pub unsafe fn new(
        vtable: *mut PluginVTable,
        config: &crate::models::ConnectionConfig,
        type_id: &str,
    ) -> Result<Self, AppError> {
        let host = FfiStr::from(config.host.as_str());
        let user = FfiStr::from(config.user.as_str());
        let password = FfiStr::from(config.password.as_str());
        let database = FfiStr::from(config.database.as_str());
        let ssl_mode = FfiStr::from(config.ssl_mode.as_str());

        let ffi_config = DriverConfig {
            host,
            port: config.port,
            user,
            password,
            database,
            ssl_mode,
        };

        // SAFETY: vtable was fully initialised by the plugin's tablepro_plugin_init.
        let handle = unsafe {
            catch_unwind(|| ((*vtable).create_driver)(&ffi_config))
                .map_err(|_| AppError::PluginError("panic in create_driver".to_string()))?
        };

        if handle.is_null() {
            return Err(AppError::PluginError(format!(
                "Plugin create_driver returned null for type '{type_id}'"
            )));
        }

        Ok(Self {
            vtable,
            handle,
            type_id: type_id.to_string(),
        })
    }

    fn vtable(&self) -> &PluginVTable {
        // SAFETY: vtable lives as long as PluginManager which outlives all adapters.
        unsafe { &*self.vtable }
    }
}

impl Drop for PluginDriverAdapter {
    fn drop(&mut self) {
        let vtable = self.vtable();
        // SAFETY: handle is valid; we own it.
        let _ = catch_unwind(|| unsafe { (vtable.destroy_driver)(self.handle) });
    }
}

// ── DatabaseDriver impl ───────────────────────────────────────────────────────

#[async_trait]
impl DatabaseDriver for PluginDriverAdapter {
    async fn connect(&self) -> Result<(), AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let result = catch_unwind(|| unsafe { (vtable.connect)(handle) })
            .map_err(|_| AppError::PluginError("panic in connect".to_string()))?;
        ffi_result_to_rust(vtable, result)
    }

    fn disconnect(&self) {
        let vtable = self.vtable();
        let _ = catch_unwind(|| unsafe { (vtable.disconnect)(self.handle) });
    }

    async fn ping(&self) -> Result<(), AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let result = catch_unwind(|| unsafe { (vtable.ping)(handle) })
            .map_err(|_| AppError::PluginError("panic in ping".to_string()))?;
        ffi_result_to_rust(vtable, result)
    }

    async fn execute(&self, query: &str) -> Result<QueryResult, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let sql = FfiStr::from(query);
        tracing::debug!(type_id = %self.type_id, "FFI: execute enter");
        let ffi = catch_unwind(|| unsafe { (vtable.execute)(handle, sql) })
            .map_err(|_| AppError::PluginError("panic in execute".to_string()))?;
        tracing::debug!(type_id = %self.type_id, "FFI: execute returned");
        convert_query_result(vtable, ffi)
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        tracing::debug!(type_id = %self.type_id, "FFI: fetch_tables enter");
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_tables)(handle) })
            .map_err(|_| AppError::PluginError("panic in fetch_tables".to_string()))?;
        tracing::debug!(type_id = %self.type_id, "FFI: fetch_tables returned");

        convert_table_list(vtable, ffi)
    }

    async fn fetch_columns(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ColumnInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let t = FfiStr::from(table);
        let s = FfiStr::from(schema.unwrap_or(""));
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_columns)(handle, t, s) })
            .map_err(|_| AppError::PluginError("panic in fetch_columns".to_string()))?;

        convert_column_list(vtable, ffi)
    }

    async fn fetch_indexes(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<IndexInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let t = FfiStr::from(table);
        let s = FfiStr::from(schema.unwrap_or(""));
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_indexes)(handle, t, s) })
            .map_err(|_| AppError::PluginError("panic in fetch_indexes".to_string()))?;

        convert_index_list(vtable, ffi)
    }

    async fn fetch_foreign_keys(
        &self,
        table: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ForeignKeyInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let t = FfiStr::from(table);
        let s = FfiStr::from(schema.unwrap_or(""));
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_foreign_keys)(handle, t, s) })
            .map_err(|_| AppError::PluginError("panic in fetch_foreign_keys".to_string()))?;

        convert_foreign_key_list(vtable, ffi)
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        tracing::debug!(type_id = %self.type_id, "FFI: fetch_databases enter");
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_databases)(handle) })
            .map_err(|_| AppError::PluginError("panic in fetch_databases".to_string()))?;
        tracing::debug!(type_id = %self.type_id, "FFI: fetch_databases returned");

        convert_string_list(vtable, ffi)
    }

    async fn fetch_ddl(&self, table: &str, schema: Option<&str>) -> Result<String, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let t = FfiStr::from(table);
        let s = FfiStr::from(schema.unwrap_or(""));
        let ffi_str = catch_unwind(|| unsafe { (vtable.fetch_ddl)(handle, t, s) })
            .map_err(|_| AppError::PluginError("panic in fetch_ddl".to_string()))?;
        Ok(ffi_string_to_rust(vtable, ffi_str))
    }

    fn cancel_query(&self) -> Result<(), AppError> {
        let vtable = self.vtable();
        let result = catch_unwind(|| unsafe { (vtable.cancel)(self.handle) })
            .map_err(|_| AppError::PluginError("panic in cancel".to_string()))?;
        ffi_result_to_rust(vtable, result)
    }

    fn supports_schemas(&self) -> bool {
        // Determined at runtime from type_id convention; override when needed.
        matches!(self.type_id.as_str(), "postgres" | "mssql")
    }

    fn supports_transactions(&self) -> bool {
        true
    }

    fn database_type_id(&self) -> &str {
        &self.type_id
    }
}
