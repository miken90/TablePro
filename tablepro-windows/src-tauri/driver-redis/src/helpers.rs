//! Small helpers for building `QueryResult` values used across redis ops.

use driver_common::{ColumnInfo, QueryResult};

/// Build a `QueryResult` from column descriptors and row cells.
///
/// `columns` items: `(name, type_name, nullable, is_pk)`.
pub fn build_query_result<S: Into<String>>(
    columns: Vec<(S, S, bool, bool)>,
    rows: Vec<Vec<Option<String>>>,
    affected_rows: i64,
) -> QueryResult {
    let cols: Vec<ColumnInfo> = columns
        .into_iter()
        .map(|(name, type_name, nullable, is_pk)| ColumnInfo {
            name: name.into(),
            type_name: type_name.into(),
            nullable,
            is_primary_key: is_pk,
        })
        .collect();

    QueryResult {
        columns: cols,
        rows,
        affected_rows,
        execution_time_ms: 0.0,
        truncated: false,
        total_row_count: None,
    }
}

/// Single-row, single-column "Result" message.
pub fn message_result(msg: &str) -> QueryResult {
    build_query_result(
        vec![("Result", "string", false, false)],
        vec![vec![Some(msg.to_string())]],
        0,
    )
}
