//! Free functions — plugin frees its own allocations.

use tablepro_plugin_sdk::{
    FfiColumnList, FfiForeignKeyList, FfiIndexList, FfiQueryResult, FfiResult, FfiString,
    FfiStringList, FfiTableList,
};

use crate::ffi::drop_ffi_string;

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
        let cells = Vec::from_raw_parts(
            result.cells,
            result.row_count * result.column_count,
            result.row_count * result.column_count,
        );
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
                for col in cols {
                    drop_ffi_string(col);
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
        for item in items {
            drop_ffi_string(item);
        }
    }
    drop_ffi_string(list.error);
}

pub unsafe extern "C" fn free_string(s: FfiString) {
    drop_ffi_string(s);
}
