use tablepro_plugin_sdk::{FfiColumnInfo, FfiQueryResult, FfiResult, FfiString};

/// Allocate an owned FfiString from a Rust String.
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

/// Construct a success FfiResult.
pub fn ok_result() -> FfiResult {
    FfiResult {
        success: true,
        error: FfiString::null(),
    }
}

/// Construct an error FfiResult with an owned message.
pub fn err_result(msg: String) -> FfiResult {
    FfiResult {
        success: false,
        error: string_to_ffi(msg),
    }
}

/// Build an FfiQueryResult from rows of string cells.
///
/// `columns` — (name, type_name, nullable, is_pk)
/// `rows` — row-major flat cells (Option<String>)
pub fn build_query_result(
    columns: Vec<(String, String, bool, bool)>,
    rows: Vec<Vec<Option<String>>>,
    affected_rows: i64,
) -> FfiQueryResult {
    let col_count = columns.len();
    let row_count = rows.len();

    // Build FfiColumnInfo array
    let mut col_infos: Vec<FfiColumnInfo> = columns
        .into_iter()
        .map(|(name, type_name, nullable, is_pk)| FfiColumnInfo {
            name: string_to_ffi(name),
            type_name: string_to_ffi(type_name),
            nullable,
            is_primary_key: is_pk,
        })
        .collect();

    let col_ptr = col_infos.as_mut_ptr();
    let col_len = col_infos.len();
    std::mem::forget(col_infos);

    // Build flat cells array
    let mut cells: Vec<FfiString> = rows
        .into_iter()
        .flat_map(|row| {
            let mut padded = row;
            padded.resize(col_count, None);
            padded
                .into_iter()
                .map(|cell| cell.map(string_to_ffi).unwrap_or_else(FfiString::null))
        })
        .collect();

    let cells_ptr = cells.as_mut_ptr();
    std::mem::forget(cells);

    FfiQueryResult {
        columns: col_ptr,
        column_count: col_len,
        cells: cells_ptr,
        row_count,
        affected_rows,
        error: FfiString::null(),
    }
}

/// Build an error FfiQueryResult.
pub fn err_query_result(msg: String) -> FfiQueryResult {
    FfiQueryResult {
        columns: std::ptr::null_mut(),
        column_count: 0,
        cells: std::ptr::null_mut(),
        row_count: 0,
        affected_rows: 0,
        error: string_to_ffi(msg),
    }
}
