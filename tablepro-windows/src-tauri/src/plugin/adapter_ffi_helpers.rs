use tablepro_plugin_sdk::PluginVTable;

use crate::models::{AppError, ColumnInfo, QueryResult};

pub(super) fn ffi_result_to_rust(
    vtable: &PluginVTable,
    result: tablepro_plugin_sdk::FfiResult,
) -> Result<(), AppError> {
    let success = result.success;
    let msg = if !success && !result.error.is_null() {
        // SAFETY: error pointer belongs to result and is valid until free_result.
        unsafe { result.error.to_string_copy() }
    } else {
        String::new()
    };

    // SAFETY: plugin owns this result; host must free via vtable callback.
    unsafe { (vtable.free_result)(result) };

    if success {
        Ok(())
    } else {
        Err(AppError::DatabaseError(msg))
    }
}

pub(super) fn ffi_string_to_rust(
    vtable: &PluginVTable,
    s: tablepro_plugin_sdk::FfiString,
) -> String {
    // SAFETY: ffi string is plugin-owned and valid for conversion.
    let out = unsafe { s.to_string_copy() };
    // SAFETY: free with plugin-provided callback.
    unsafe { (vtable.free_string)(s) };
    out
}

pub(super) fn convert_query_result(
    vtable: &PluginVTable,
    ffi: tablepro_plugin_sdk::FfiQueryResult,
) -> Result<QueryResult, AppError> {
    if !ffi.error.is_null() {
        // SAFETY: error pointer valid until free_query_result call.
        let msg = unsafe { ffi.error.to_string_copy() };
        // SAFETY: free FFI query result via callback.
        unsafe { (vtable.free_query_result)(ffi) };
        return Err(AppError::DatabaseError(msg));
    }

    let col_count = ffi.column_count;
    let row_count = ffi.row_count;

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
    // SAFETY: plugin expects host to free query result.
    unsafe { (vtable.free_query_result)(ffi) };

    Ok(QueryResult {
        columns,
        rows,
        affected_rows,
        execution_time_ms: 0.0,
        truncated: false,
        total_row_count: None,
    })
}
