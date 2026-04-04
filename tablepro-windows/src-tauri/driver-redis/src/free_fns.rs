use tablepro_plugin_sdk::{
    FfiColumnInfo, FfiColumnList, FfiForeignKeyInfo, FfiForeignKeyList, FfiIndexInfo, FfiIndexList,
    FfiQueryResult, FfiResult, FfiString, FfiStringList, FfiTableInfo, FfiTableList,
};

/// Free an FfiResult (its error string).
pub unsafe extern "C" fn free_result(result: FfiResult) {
    free_string(result.error);
}

/// Free an FfiQueryResult — columns array, cells array, and error.
pub unsafe extern "C" fn free_query_result(result: FfiQueryResult) {
    if !result.columns.is_null() {
        let cols = Vec::from_raw_parts(result.columns, result.column_count, result.column_count);
        for col in cols {
            free_column_info(col);
        }
    }
    if !result.cells.is_null() {
        let total = result.row_count * result.column_count;
        let cells = Vec::from_raw_parts(result.cells, total, total);
        for cell in cells {
            free_string(cell);
        }
    }
    free_string(result.error);
}

/// Free an FfiTableList.
pub unsafe extern "C" fn free_table_list(list: FfiTableList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            free_table_info(item);
        }
    }
    free_string(list.error);
}

/// Free an FfiColumnList.
pub unsafe extern "C" fn free_column_list(list: FfiColumnList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            free_column_info(item);
        }
    }
    free_string(list.error);
}

/// Free an FfiIndexList.
pub unsafe extern "C" fn free_index_list(list: FfiIndexList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            free_index_info(item);
        }
    }
    free_string(list.error);
}

/// Free an FfiForeignKeyList.
pub unsafe extern "C" fn free_foreign_key_list(list: FfiForeignKeyList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            free_foreign_key_info(item);
        }
    }
    free_string(list.error);
}

/// Free an FfiStringList.
pub unsafe extern "C" fn free_string_list(list: FfiStringList) {
    if !list.items.is_null() {
        let items = Vec::from_raw_parts(list.items, list.count, list.count);
        for item in items {
            free_string(item);
        }
    }
    free_string(list.error);
}

/// Free a single FfiString.
pub unsafe extern "C" fn free_string(s: FfiString) {
    if !s.ptr.is_null() {
        drop(Vec::from_raw_parts(s.ptr, s.len, s.capacity));
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

unsafe fn free_table_info(item: FfiTableInfo) {
    free_string(item.name);
    free_string(item.schema);
    free_string(item.table_type);
}

unsafe fn free_column_info(item: FfiColumnInfo) {
    free_string(item.name);
    free_string(item.type_name);
}

unsafe fn free_index_info(item: FfiIndexInfo) {
    if !item.columns.is_null() {
        let cols = Vec::from_raw_parts(item.columns, item.column_count, item.column_count);
        for c in cols {
            free_string(c);
        }
    }
    free_string(item.name);
    free_string(item.index_type);
}

unsafe fn free_foreign_key_info(item: FfiForeignKeyInfo) {
    free_string(item.name);
    free_string(item.column);
    free_string(item.referenced_table);
    free_string(item.referenced_column);
}
