//! Query execution: extended (typed) vs simple (multi-statement) protocol.

use driver_common::{ColumnInfo, DriverError, QueryResult};
use tokio_postgres::{Client, SimpleQueryMessage};

/// Check if SQL is a single statement (no semicolons outside quotes/comments).
/// Conservative: returns false if uncertain — caller falls back to simple_query.
fn is_single_statement(sql: &str) -> bool {
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut semicolons = 0u32;
    let chars: Vec<char> = sql.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        let ch = chars[i];
        if in_line_comment {
            if ch == '\n' {
                in_line_comment = false;
            }
            i += 1;
        } else if in_block_comment {
            if ch == '*' && i + 1 < len && chars[i + 1] == '/' {
                in_block_comment = false;
                i += 2;
            } else {
                i += 1;
            }
        } else if in_single_quote {
            if ch == '\'' {
                if i + 1 < len && chars[i + 1] == '\'' {
                    i += 2;
                } else {
                    in_single_quote = false;
                    i += 1;
                }
            } else {
                i += 1;
            }
        } else if in_double_quote {
            if ch == '"' {
                in_double_quote = false;
            }
            i += 1;
        } else {
            match ch {
                '-' if i + 1 < len && chars[i + 1] == '-' => {
                    in_line_comment = true;
                    i += 2;
                }
                '/' if i + 1 < len && chars[i + 1] == '*' => {
                    in_block_comment = true;
                    i += 2;
                }
                '\'' => {
                    in_single_quote = true;
                    i += 1;
                }
                '"' => {
                    in_double_quote = true;
                    i += 1;
                }
                ';' => {
                    semicolons += 1;
                    i += 1;
                }
                _ => {
                    i += 1;
                }
            }
        }
    }

    semicolons <= 1
}

/// Build a `QueryResult` from raw column tuples and rows.
fn build_result(
    columns: Vec<(String, String, bool, bool)>,
    rows: Vec<Vec<Option<String>>>,
    affected: i64,
) -> QueryResult {
    QueryResult {
        columns: columns
            .into_iter()
            .map(|(name, type_name, nullable, is_primary_key)| ColumnInfo {
                name,
                type_name,
                nullable,
                is_primary_key,
            })
            .collect(),
        rows,
        affected_rows: affected,
        execution_time_ms: 0.0,
        truncated: false,
        total_row_count: None,
    }
}

pub async fn execute(client: &Client, sql: &str) -> Result<QueryResult, DriverError> {
    if is_single_statement(sql) {
        execute_extended(client, sql).await
    } else {
        execute_simple(client, sql).await
    }
}

/// Extended protocol: prepare → typed columns → simple_query for text values.
async fn execute_extended(client: &Client, sql: &str) -> Result<QueryResult, DriverError> {
    let stmt = match client.prepare(sql).await {
        Ok(s) => s,
        Err(_) => {
            // Fall back to simple_query for statements `prepare` rejects
            // (e.g. multi-statement, server-side transactions).
            return execute_simple(client, sql).await;
        }
    };

    let typed_columns: Vec<(String, String)> = stmt
        .columns()
        .iter()
        .map(|c| (c.name().to_string(), c.type_().name().to_string()))
        .collect();

    if typed_columns.is_empty() {
        // Non-row statement (INSERT/UPDATE/DELETE/CREATE/etc.)
        let n = client
            .execute(&stmt, &[])
            .await
            .map_err(|e| DriverError::Query(e.to_string()))?;
        return Ok(build_result(vec![], vec![], n as i64));
    }

    // Row-returning: use simple_query for text values, typed_columns for metadata.
    let messages = client
        .simple_query(sql)
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let columns: Vec<(String, String, bool, bool)> = typed_columns
        .into_iter()
        .map(|(name, type_name)| (name, type_name, true, false))
        .collect();
    let col_count = columns.len();
    let mut data_rows: Vec<Vec<Option<String>>> = vec![];

    for msg in &messages {
        if let SimpleQueryMessage::Row(row) = msg {
            let cells: Vec<Option<String>> = (0..col_count)
                .map(|i| row.get(i).map(|s| s.to_string()))
                .collect();
            data_rows.push(cells);
        }
    }

    Ok(build_result(columns, data_rows, 0))
}

/// Simple query protocol — multi-statement, all types as "text".
async fn execute_simple(client: &Client, sql: &str) -> Result<QueryResult, DriverError> {
    let messages = client
        .simple_query(sql)
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    let mut columns: Vec<(String, String, bool, bool)> = vec![];
    let mut data_rows: Vec<Vec<Option<String>>> = vec![];
    let mut affected: i64 = 0;
    let mut has_columns = false;

    for msg in &messages {
        match msg {
            SimpleQueryMessage::RowDescription(cols) => {
                if !has_columns {
                    columns = cols
                        .iter()
                        .map(|c| (c.name().to_string(), "text".to_string(), true, false))
                        .collect();
                    has_columns = true;
                }
            }
            SimpleQueryMessage::Row(row) => {
                let col_count = if has_columns { columns.len() } else { row.len() };
                if !has_columns {
                    columns = (0..col_count)
                        .map(|i| {
                            (
                                row.columns()[i].name().to_string(),
                                "text".to_string(),
                                true,
                                false,
                            )
                        })
                        .collect();
                    has_columns = true;
                }
                let cells: Vec<Option<String>> = (0..col_count)
                    .map(|i| row.get(i).map(|s| s.to_string()))
                    .collect();
                data_rows.push(cells);
            }
            SimpleQueryMessage::CommandComplete(n) => {
                affected = *n as i64;
            }
            _ => {}
        }
    }

    Ok(build_result(columns, data_rows, affected))
}
