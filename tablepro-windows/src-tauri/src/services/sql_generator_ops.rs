use super::sql_generator::{CellChange, RowChange, SavePayload};

pub(crate) fn escape_value(v: &Option<String>) -> String {
    match v {
        None => "NULL".to_string(),
        Some(s) => {
            if s.parse::<f64>().is_ok() {
                s.clone()
            } else {
                format!("'{}'", s.replace('\'', "''"))
            }
        }
    }
}

pub(crate) fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s)
}

pub(crate) fn qualified_table(table: &str, schema: &Option<String>) -> String {
    match schema {
        Some(s) => format!("{}.{}", quote_ident(s), quote_ident(table)),
        None => quote_ident(table),
    }
}

pub(crate) fn build_where_clause(
    columns: &[String],
    primary_keys: &[String],
    original_row: &[Option<String>],
) -> String {
    primary_keys
        .iter()
        .filter_map(|pk| {
            columns.iter().position(|c| c == pk).map(|idx| {
                let val = original_row.get(idx).cloned().flatten();
                match val {
                    Some(value) => format!("{}={}", quote_ident(pk), escape_value(&Some(value))),
                    None => format!("{} IS NULL", quote_ident(pk)),
                }
            })
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

/// Generate an INSERT statement for a row change.
pub(crate) fn build_insert_statement(table: &str, row_change: &RowChange) -> Option<String> {
    if row_change.cell_changes.is_empty() {
        return None;
    }

    let cols: Vec<String> = row_change
        .cell_changes
        .iter()
        .map(|c: &CellChange| quote_ident(&c.column_name))
        .collect();
    let vals: Vec<String> = row_change
        .cell_changes
        .iter()
        .map(|c: &CellChange| escape_value(&c.new_value))
        .collect();

    Some(format!(
        "INSERT INTO {} ({}) VALUES ({})",
        table,
        cols.join(","),
        vals.join(",")
    ))
}

/// Generate an UPDATE statement for a row change.
pub(crate) fn build_update_statement(
    table: &str,
    payload: &SavePayload,
    row_change: &RowChange,
) -> Option<String> {
    if row_change.cell_changes.is_empty() {
        return None;
    }

    let set_clause: Vec<String> = row_change
        .cell_changes
        .iter()
        .map(|c: &CellChange| {
            format!(
                "{}={}",
                quote_ident(&c.column_name),
                escape_value(&c.new_value)
            )
        })
        .collect();

    let where_clause = build_where_clause(
        &payload.columns,
        &payload.primary_keys,
        &row_change.original_row,
    );
    if where_clause.is_empty() {
        return None;
    }

    Some(format!(
        "UPDATE {} SET {} WHERE {}",
        table,
        set_clause.join(", "),
        where_clause
    ))
}

/// Generate a DELETE statement for a row change.
pub(crate) fn build_delete_statement(
    table: &str,
    payload: &SavePayload,
    row_change: &RowChange,
) -> Option<String> {
    let where_clause = build_where_clause(
        &payload.columns,
        &payload.primary_keys,
        &row_change.original_row,
    );
    if where_clause.is_empty() {
        return None;
    }

    Some(format!("DELETE FROM {} WHERE {}", table, where_clause))
}
