use super::sql_generator::{CellChange, Dialect, RowChange, SavePayload};
use super::sql_quoting::quote_identifier;
use super::sql_value_kind::{is_numeric_literal, parse_boolean, ValueKind};

/// Escape a cell value (received as an optional string from the frontend) into
/// a SQL literal for the given dialect.
///
/// `kind` comes from the column's declared type (see
/// [`sql_value_kind`](super::sql_value_kind)), never from the value itself:
/// - `None` → `NULL`
/// - numeric column holding a numeric literal → unquoted
/// - boolean column holding a boolean → dialect-specific boolean literal
/// - everything else → ANSI single-quoted with `''` escape (works for all
///   dialects; MySQL also accepts this)
pub(crate) fn escape_value(v: &Option<String>, kind: ValueKind, dialect: Dialect) -> String {
    match v {
        None => "NULL".to_string(),
        Some(s) => match kind {
            // A numeric column can still hold something that is not a numeric
            // literal (`NaN`, an empty cell). Quote it and let the engine
            // coerce or reject it instead of emitting a bare token that is a
            // syntax error.
            ValueKind::Numeric if is_numeric_literal(s) => s.clone(),
            ValueKind::Boolean => match parse_boolean(s) {
                Some(b) => dialect.bool_literal(b).to_string(),
                None => quote_literal(s),
            },
            ValueKind::Numeric | ValueKind::Text => quote_literal(s),
        },
    }
}

fn quote_literal(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

pub(crate) fn quote_ident(s: &str, dialect: Dialect) -> String {
    quote_identifier(s, dialect.as_str())
}

pub(crate) fn qualified_table(table: &str, schema: &Option<String>, dialect: Dialect) -> String {
    match schema {
        Some(s) if !s.is_empty() => format!(
            "{}.{}",
            quote_ident(s, dialect),
            quote_ident(table, dialect)
        ),
        _ => quote_ident(table, dialect),
    }
}

pub(crate) fn build_where_clause(
    payload: &SavePayload,
    original_row: &[Option<String>],
    dialect: Dialect,
) -> String {
    payload
        .primary_keys
        .iter()
        .filter_map(|pk| {
            payload.columns.iter().position(|c| c == pk).map(|idx| {
                let val = original_row.get(idx).cloned().flatten();
                match val {
                    Some(value) => format!(
                        "{}={}",
                        quote_ident(pk, dialect),
                        escape_value(&Some(value), payload.value_kind_of(pk), dialect)
                    ),
                    None => format!("{} IS NULL", quote_ident(pk, dialect)),
                }
            })
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

/// Generate an INSERT statement for a row change.
pub(crate) fn build_insert_statement(
    table: &str,
    payload: &SavePayload,
    row_change: &RowChange,
    dialect: Dialect,
) -> Option<String> {
    if row_change.cell_changes.is_empty() {
        return None;
    }

    let cols: Vec<String> = row_change
        .cell_changes
        .iter()
        .map(|c: &CellChange| quote_ident(&c.column_name, dialect))
        .collect();
    let vals: Vec<String> = row_change
        .cell_changes
        .iter()
        .map(|c: &CellChange| {
            escape_value(&c.new_value, payload.value_kind_of(&c.column_name), dialect)
        })
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
    dialect: Dialect,
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
                quote_ident(&c.column_name, dialect),
                escape_value(&c.new_value, payload.value_kind_of(&c.column_name), dialect)
            )
        })
        .collect();

    let where_clause = build_where_clause(payload, &row_change.original_row, dialect);
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
    dialect: Dialect,
) -> Option<String> {
    let where_clause = build_where_clause(payload, &row_change.original_row, dialect);
    if where_clause.is_empty() {
        return None;
    }

    Some(format!("DELETE FROM {} WHERE {}", table, where_clause))
}
