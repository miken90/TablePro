use tablepro_plugin_sdk::PluginVTable;

use crate::models::{AppError, ColumnInfo, ForeignKeyInfo, IndexInfo, TableInfo};

pub(super) fn convert_table_list(
    vtable: &PluginVTable,
    ffi: tablepro_plugin_sdk::FfiTableList,
) -> Result<Vec<TableInfo>, AppError> {
    if !ffi.error.is_null() {
        // SAFETY: error pointer valid until free_table_list.
        let msg = unsafe { ffi.error.to_string_copy() };
        // SAFETY: free plugin list via callback.
        unsafe { (vtable.free_table_list)(ffi) };
        return Err(AppError::DatabaseError(msg));
    }

    let tables = if ffi.items.is_null() {
        vec![]
    } else {
        (0..ffi.count)
            .map(|i| unsafe {
                let t = &*ffi.items.add(i);
                TableInfo {
                    name: t.name.to_string_copy(),
                    schema: if t.schema.is_null() {
                        None
                    } else {
                        Some(t.schema.to_string_copy())
                    },
                    table_type: t.table_type.to_string_copy(),
                    row_count_estimate: if t.has_row_count {
                        Some(t.row_count_estimate)
                    } else {
                        None
                    },
                }
            })
            .collect()
    };

    // SAFETY: release plugin-owned table list.
    unsafe { (vtable.free_table_list)(ffi) };
    Ok(tables)
}

pub(super) fn convert_column_list(
    vtable: &PluginVTable,
    ffi: tablepro_plugin_sdk::FfiColumnList,
) -> Result<Vec<ColumnInfo>, AppError> {
    if !ffi.error.is_null() {
        // SAFETY: error pointer valid until free_column_list.
        let msg = unsafe { ffi.error.to_string_copy() };
        // SAFETY: release plugin-owned list.
        unsafe { (vtable.free_column_list)(ffi) };
        return Err(AppError::DatabaseError(msg));
    }

    let cols = if ffi.items.is_null() {
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

    // SAFETY: release plugin-owned list.
    unsafe { (vtable.free_column_list)(ffi) };
    Ok(cols)
}

pub(super) fn convert_index_list(
    vtable: &PluginVTable,
    ffi: tablepro_plugin_sdk::FfiIndexList,
) -> Result<Vec<IndexInfo>, AppError> {
    if !ffi.error.is_null() {
        // SAFETY: error pointer valid until free_index_list.
        let msg = unsafe { ffi.error.to_string_copy() };
        // SAFETY: release plugin-owned list.
        unsafe { (vtable.free_index_list)(ffi) };
        return Err(AppError::DatabaseError(msg));
    }

    let indexes = if ffi.items.is_null() {
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

    // SAFETY: release plugin-owned list.
    unsafe { (vtable.free_index_list)(ffi) };
    Ok(indexes)
}

pub(super) fn convert_foreign_key_list(
    vtable: &PluginVTable,
    ffi: tablepro_plugin_sdk::FfiForeignKeyList,
) -> Result<Vec<ForeignKeyInfo>, AppError> {
    if !ffi.error.is_null() {
        // SAFETY: error pointer valid until free_foreign_key_list.
        let msg = unsafe { ffi.error.to_string_copy() };
        // SAFETY: release plugin-owned list.
        unsafe { (vtable.free_foreign_key_list)(ffi) };
        return Err(AppError::DatabaseError(msg));
    }

    let fks = if ffi.items.is_null() {
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

    // SAFETY: release plugin-owned list.
    unsafe { (vtable.free_foreign_key_list)(ffi) };
    Ok(fks)
}

pub(super) fn convert_string_list(
    vtable: &PluginVTable,
    ffi: tablepro_plugin_sdk::FfiStringList,
) -> Result<Vec<String>, AppError> {
    if !ffi.error.is_null() {
        // SAFETY: error pointer valid until free_string_list.
        let msg = unsafe { ffi.error.to_string_copy() };
        // SAFETY: release plugin-owned list.
        unsafe { (vtable.free_string_list)(ffi) };
        return Err(AppError::DatabaseError(msg));
    }

    let strings = if ffi.items.is_null() {
        vec![]
    } else {
        (0..ffi.count)
            .map(|i| unsafe { (*ffi.items.add(i)).to_string_copy() })
            .collect()
    };

    // SAFETY: release plugin-owned list.
    unsafe { (vtable.free_string_list)(ffi) };
    Ok(strings)
}
