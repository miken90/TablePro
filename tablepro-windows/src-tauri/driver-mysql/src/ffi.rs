/// FFI memory helpers: string allocation, free functions.
use tablepro_plugin_sdk::{
    FfiColumnList, FfiForeignKeyList, FfiIndexList, FfiQueryResult, FfiResult, FfiString,
    FfiStringList, FfiTableList,
};

// ── Allocation ───────────────────────────────────────────────────────────────

pub fn string_to_ffi(s: String) -> FfiString {
    let mut bytes = s.into_bytes();
    let ptr = bytes.as_mut_ptr();
    let len = bytes.len();
    let cap = bytes.capacity();
    std::mem::forget(bytes);
    FfiString {
        ptr,
        len,
        capacity: cap,
    }
}

pub fn ffi_error(msg: String) -> FfiString {
    string_to_ffi(msg)
}

pub fn ok_result() -> FfiResult {
    FfiResult {
        success: true,
        error: FfiString::null(),
    }
}

pub fn err_result(msg: String) -> FfiResult {
    FfiResult {
        success: false,
        error: ffi_error(msg),
    }
}

// ── Free functions ───────────────────────────────────────────────────────────

/// Reconstitute and drop an FfiString's heap buffer.
pub unsafe fn drop_ffi_string(s: FfiString) {
    if !s.ptr.is_null() && s.capacity > 0 {
        drop(Vec::from_raw_parts(s.ptr, s.len, s.capacity));
    }
}

pub unsafe extern "C" fn free_string(s: FfiString) {
    drop_ffi_string(s);
}

pub unsafe extern "C" fn free_result(result: FfiResult) {
    drop_ffi_string(result.error);
}

pub unsafe extern "C" fn free_query_result(result: FfiQueryResult) {
    if !result.columns.is_null() {
        let cols = Vec::from_raw_parts(result.columns, result.column_count, result.column_count);
        for col in cols {
            drop_ffi_string(col.name);
            drop_ffi_string(col.type_name);
        }
    }
    if !result.cells.is_null() {
        let total = result.row_count * result.column_count;
        let cells = Vec::from_raw_parts(result.cells, total, total);
        for cell in cells {
            drop_ffi_string(cell);
        }
    }
    drop_ffi_string(result.error);
}

pub unsafe extern "C" fn free_table_list(list: FfiTableList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            drop_ffi_string(item.name);
            drop_ffi_string(item.schema);
            drop_ffi_string(item.table_type);
        }
    }
    drop_ffi_string(list.error);
}

pub unsafe extern "C" fn free_column_list(list: FfiColumnList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            drop_ffi_string(item.name);
            drop_ffi_string(item.type_name);
        }
    }
    drop_ffi_string(list.error);
}

pub unsafe extern "C" fn free_index_list(list: FfiIndexList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            drop_ffi_string(item.name);
            drop_ffi_string(item.index_type);
            if !item.columns.is_null() {
                let cols = Vec::from_raw_parts(item.columns, item.column_count, item.column_count);
                for c in cols {
                    drop_ffi_string(c);
                }
            }
        }
    }
    drop_ffi_string(list.error);
}

pub unsafe extern "C" fn free_foreign_key_list(list: FfiForeignKeyList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            drop_ffi_string(item.name);
            drop_ffi_string(item.column);
            drop_ffi_string(item.referenced_table);
            drop_ffi_string(item.referenced_column);
        }
    }
    drop_ffi_string(list.error);
}

pub unsafe extern "C" fn free_string_list(list: FfiStringList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for s in items {
            drop_ffi_string(s);
        }
    }
    drop_ffi_string(list.error);
}

// ── Vec → raw pointer helpers ────────────────────────────────────────────────

pub fn vec_into_raw<T>(mut v: Vec<T>) -> (*mut T, usize) {
    let ptr = v.as_mut_ptr();
    let len = v.len();
    std::mem::forget(v);
    (ptr, len)
}

// ── Error list constructors ──────────────────────────────────────────────────

pub fn table_list_error(msg: String) -> FfiTableList {
    FfiTableList {
        items: std::ptr::null_mut(),
        count: 0,
        error: ffi_error(msg),
    }
}

pub fn column_list_error(msg: String) -> FfiColumnList {
    FfiColumnList {
        items: std::ptr::null_mut(),
        count: 0,
        error: ffi_error(msg),
    }
}

pub fn index_list_error(msg: String) -> FfiIndexList {
    FfiIndexList {
        items: std::ptr::null_mut(),
        count: 0,
        error: ffi_error(msg),
    }
}

pub fn fk_list_error(msg: String) -> FfiForeignKeyList {
    FfiForeignKeyList {
        items: std::ptr::null_mut(),
        count: 0,
        error: ffi_error(msg),
    }
}

pub fn string_list_error(msg: String) -> FfiStringList {
    FfiStringList {
        items: std::ptr::null_mut(),
        count: 0,
        error: ffi_error(msg),
    }
}

pub fn query_result_error(msg: String) -> FfiQueryResult {
    FfiQueryResult {
        columns: std::ptr::null_mut(),
        column_count: 0,
        cells: std::ptr::null_mut(),
        row_count: 0,
        affected_rows: 0,
        error: ffi_error(msg),
    }
}
