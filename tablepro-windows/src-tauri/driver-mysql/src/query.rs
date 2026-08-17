//! Query execution.
use mysql_async::prelude::Queryable;
use mysql_async::{Conn, Row};

use driver_common::{ColumnInfo, DriverError, QueryResult};

/// Run a SQL statement and return a `QueryResult`.
pub async fn execute(conn: &mut Conn, sql: &str) -> Result<QueryResult, DriverError> {
    let started = std::time::Instant::now();

    let mut result = conn
        .query_iter(sql)
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let col_names: Vec<String> = result
        .columns()
        .as_deref()
        .map(|cols| cols.iter().map(|c| c.name_str().into_owned()).collect())
        .unwrap_or_default();

    let col_types: Vec<String> = result
        .columns()
        .as_deref()
        .map(|cols| cols.iter().map(|c| format!("{:?}", c.column_type())).collect())
        .unwrap_or_default();

    let column_count = col_names.len();

    let mut raw_rows: Vec<Row> = Vec::new();
    result
        .for_each(|row| raw_rows.push(row))
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let affected = result.affected_rows() as i64;

    let columns: Vec<ColumnInfo> = col_names
        .into_iter()
        .zip(col_types)
        .map(|(name, type_name)| ColumnInfo {
            name,
            type_name,
            nullable: true,
            is_primary_key: false,
        })
        .collect();

    let mut rows: Vec<Vec<Option<String>>> = Vec::with_capacity(raw_rows.len());
    for row in &raw_rows {
        let mut out: Vec<Option<String>> = Vec::with_capacity(column_count);
        for i in 0..column_count {
            let val: Option<String> = row.get_opt(i).and_then(|r| r.ok()).unwrap_or(None);
            out.push(val);
        }
        rows.push(out);
    }

    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;

    Ok(QueryResult {
        columns,
        rows,
        affected_rows: affected,
        execution_time_ms: elapsed_ms,
        truncated: false,
        total_row_count: None,
    })
}
