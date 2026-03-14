use std::panic::catch_unwind;

use async_trait::async_trait;
use tablepro_plugin_sdk::{DriverConfig, DriverHandle, FfiStr, PluginVTable};

use crate::models::{AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo};
use crate::plugin::DatabaseDriver;

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

        let ffi_config = DriverConfig { host, port: config.port, user, password, database, ssl_mode };

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

        Ok(Self { vtable, handle, type_id: type_id.to_string() })
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

// ── FFI conversion helpers ────────────────────────────────────────────────────

fn ffi_result_to_rust(
    vtable: &PluginVTable,
    result: tablepro_plugin_sdk::FfiResult,
) -> Result<(), AppError> {
    let success = result.success;
    let msg = if !success && !result.error.is_null() {
        unsafe { result.error.to_string_copy() }
    } else {
        String::new()
    };
    unsafe { (vtable.free_result)(result) };
    if success {
        Ok(())
    } else {
        Err(AppError::DatabaseError(msg))
    }
}

fn ffi_string_to_rust(vtable: &PluginVTable, s: tablepro_plugin_sdk::FfiString) -> String {
    let out = unsafe { s.to_string_copy() };
    unsafe { (vtable.free_string)(s) };
    out
}

fn convert_query_result(
    vtable: &PluginVTable,
    ffi: tablepro_plugin_sdk::FfiQueryResult,
) -> Result<QueryResult, AppError> {
    // Check error first
    if !ffi.error.is_null() {
        let msg = unsafe { ffi.error.to_string_copy() };
        unsafe { (vtable.free_query_result)(ffi) };
        return Err(AppError::DatabaseError(msg));
    }

    let col_count = ffi.column_count;
    let row_count = ffi.row_count;

    // Build columns
    let columns: Vec<ColumnInfo> = if ffi.columns.is_null() {
        vec![]
    } else {
        (0..col_count)
            .map(|i| unsafe {
                let c = &*ffi.columns.add(i);
                ColumnInfo {
                    name: c.name.to_string_copy(),
                    type_name: c.type_name.to_string_copy(),
                    nullable: c.nullable,
                    is_primary_key: c.is_primary_key,
                }
            })
            .collect()
    };

    // Build rows (row-major flat cells array)
    let rows: Vec<Vec<Option<String>>> = if ffi.cells.is_null() || row_count == 0 {
        vec![]
    } else {
        (0..row_count)
            .map(|r| {
                (0..col_count)
                    .map(|c| unsafe {
                        let cell = &*ffi.cells.add(r * col_count + c);
                        if cell.ptr.is_null() {
                            None
                        } else {
                            Some(cell.to_string_copy())
                        }
                    })
                    .collect()
            })
            .collect()
    };

    let affected_rows = ffi.affected_rows;
    unsafe { (vtable.free_query_result)(ffi) };

    Ok(QueryResult { columns, rows, affected_rows, execution_time_ms: 0.0 })
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
        let ffi = catch_unwind(|| unsafe { (vtable.execute)(handle, sql) })
            .map_err(|_| AppError::PluginError("panic in execute".to_string()))?;
        convert_query_result(vtable, ffi)
    }

    async fn fetch_tables(&self) -> Result<Vec<TableInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_tables)(handle) })
            .map_err(|_| AppError::PluginError("panic in fetch_tables".to_string()))?;

        if !ffi.error.is_null() {
            let msg = unsafe { ffi.error.to_string_copy() };
            unsafe { (vtable.free_table_list)(ffi) };
            return Err(AppError::DatabaseError(msg));
        }

        let tables: Vec<TableInfo> = if ffi.items.is_null() {
            vec![]
        } else {
            (0..ffi.count)
                .map(|i| unsafe {
                    let t = &*ffi.items.add(i);
                    TableInfo {
                        name: t.name.to_string_copy(),
                        schema: if t.schema.is_null() { None } else { Some(t.schema.to_string_copy()) },
                        table_type: t.table_type.to_string_copy(),
                        row_count_estimate: if t.has_row_count { Some(t.row_count_estimate) } else { None },
                    }
                })
                .collect()
        };
        unsafe { (vtable.free_table_list)(ffi) };
        Ok(tables)
    }

    async fn fetch_columns(&self, table: &str, schema: Option<&str>) -> Result<Vec<ColumnInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let t = FfiStr::from(table);
        let s = FfiStr::from(schema.unwrap_or(""));
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_columns)(handle, t, s) })
            .map_err(|_| AppError::PluginError("panic in fetch_columns".to_string()))?;

        if !ffi.error.is_null() {
            let msg = unsafe { ffi.error.to_string_copy() };
            unsafe { (vtable.free_column_list)(ffi) };
            return Err(AppError::DatabaseError(msg));
        }

        let cols: Vec<ColumnInfo> = if ffi.items.is_null() {
            vec![]
        } else {
            (0..ffi.count)
                .map(|i| unsafe {
                    let c = &*ffi.items.add(i);
                    ColumnInfo {
                        name: c.name.to_string_copy(),
                        type_name: c.type_name.to_string_copy(),
                        nullable: c.nullable,
                        is_primary_key: c.is_primary_key,
                    }
                })
                .collect()
        };
        unsafe { (vtable.free_column_list)(ffi) };
        Ok(cols)
    }

    async fn fetch_indexes(&self, table: &str, schema: Option<&str>) -> Result<Vec<IndexInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let t = FfiStr::from(table);
        let s = FfiStr::from(schema.unwrap_or(""));
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_indexes)(handle, t, s) })
            .map_err(|_| AppError::PluginError("panic in fetch_indexes".to_string()))?;

        if !ffi.error.is_null() {
            let msg = unsafe { ffi.error.to_string_copy() };
            unsafe { (vtable.free_index_list)(ffi) };
            return Err(AppError::DatabaseError(msg));
        }

        let indexes: Vec<IndexInfo> = if ffi.items.is_null() {
            vec![]
        } else {
            (0..ffi.count)
                .map(|i| unsafe {
                    let idx = &*ffi.items.add(i);
                    let col_names: Vec<String> = if idx.columns.is_null() {
                        vec![]
                    } else {
                        (0..idx.column_count)
                            .map(|j| (*idx.columns.add(j)).to_string_copy())
                            .collect()
                    };
                    IndexInfo {
                        name: idx.name.to_string_copy(),
                        columns: col_names,
                        is_unique: idx.is_unique,
                        index_type: idx.index_type.to_string_copy(),
                    }
                })
                .collect()
        };
        unsafe { (vtable.free_index_list)(ffi) };
        Ok(indexes)
    }

    async fn fetch_foreign_keys(&self, table: &str, schema: Option<&str>) -> Result<Vec<ForeignKeyInfo>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let t = FfiStr::from(table);
        let s = FfiStr::from(schema.unwrap_or(""));
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_foreign_keys)(handle, t, s) })
            .map_err(|_| AppError::PluginError("panic in fetch_foreign_keys".to_string()))?;

        if !ffi.error.is_null() {
            let msg = unsafe { ffi.error.to_string_copy() };
            unsafe { (vtable.free_foreign_key_list)(ffi) };
            return Err(AppError::DatabaseError(msg));
        }

        let fks: Vec<ForeignKeyInfo> = if ffi.items.is_null() {
            vec![]
        } else {
            (0..ffi.count)
                .map(|i| unsafe {
                    let fk = &*ffi.items.add(i);
                    ForeignKeyInfo {
                        name: fk.name.to_string_copy(),
                        column: fk.column.to_string_copy(),
                        referenced_table: fk.referenced_table.to_string_copy(),
                        referenced_column: fk.referenced_column.to_string_copy(),
                    }
                })
                .collect()
        };
        unsafe { (vtable.free_foreign_key_list)(ffi) };
        Ok(fks)
    }

    async fn fetch_databases(&self) -> Result<Vec<String>, AppError> {
        let vtable = self.vtable();
        let handle = self.handle;
        let ffi = catch_unwind(|| unsafe { (vtable.fetch_databases)(handle) })
            .map_err(|_| AppError::PluginError("panic in fetch_databases".to_string()))?;

        if !ffi.error.is_null() {
            let msg = unsafe { ffi.error.to_string_copy() };
            unsafe { (vtable.free_string_list)(ffi) };
            return Err(AppError::DatabaseError(msg));
        }

        let dbs: Vec<String> = if ffi.items.is_null() {
            vec![]
        } else {
            (0..ffi.count)
                .map(|i| unsafe { (*ffi.items.add(i)).to_string_copy() })
                .collect()
        };
        unsafe { (vtable.free_string_list)(ffi) };
        Ok(dbs)
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
