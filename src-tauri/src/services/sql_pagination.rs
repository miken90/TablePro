//! Dialect-aware pagination for wrapping an arbitrary user query.
//!
//! Export streams a user-supplied `SELECT` in chunks by wrapping it as a
//! derived table. `LIMIT … OFFSET …` is not portable — SQL Server spells it
//! `OFFSET … ROWS FETCH NEXT … ROWS ONLY` and additionally requires an
//! `ORDER BY` on the paginating query. Dialect selection reuses
//! [`Dialect`](crate::services::sql_generator::Dialect) rather than
//! introducing a second engine switch.

use crate::services::sql_generator::Dialect;

/// How a dialect can page through a wrapped user query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaginationStyle {
    /// `LIMIT n OFFSET m` — PostgreSQL, MySQL/MariaDB, SQLite.
    LimitOffset,
    /// Cannot page a wrapped arbitrary query safely; run it in one pass.
    ///
    /// SQL Server rejects `ORDER BY` inside a derived table unless that
    /// subquery is itself limited, so wrapping a user query that ends in
    /// `ORDER BY` is a syntax error before pagination is even considered.
    /// `OFFSET/FETCH` then needs its own `ORDER BY`, and the only ordering we
    /// could synthesise without knowing the projected columns is
    /// `ORDER BY (SELECT NULL)` — an explicitly unspecified order, under which
    /// consecutive pages may repeat or skip rows and produce a silently
    /// corrupt export. Exporting in a single pass is correct instead.
    SinglePass,
    /// Engine is not SQL at all.
    NotSql,
}

/// Pagination style for a dialect.
pub fn pagination_style(dialect: Dialect) -> PaginationStyle {
    match dialect {
        Dialect::Postgres | Dialect::MySql | Dialect::Sqlite => PaginationStyle::LimitOffset,
        Dialect::Mssql => PaginationStyle::SinglePass,
        Dialect::Mongo | Dialect::Redis => PaginationStyle::NotSql,
    }
}

/// Wrap `inner_sql` as a derived table selecting one chunk of rows.
///
/// Returns `None` when the dialect cannot page a wrapped query — the caller
/// must then execute `inner_sql` once and consume the whole result.
pub fn paginated_subquery(
    inner_sql: &str,
    alias: &str,
    limit: u64,
    offset: u64,
    dialect: Dialect,
) -> Option<String> {
    match pagination_style(dialect) {
        PaginationStyle::LimitOffset => Some(format!(
            "SELECT * FROM ({inner_sql}) AS {alias} LIMIT {limit} OFFSET {offset}"
        )),
        PaginationStyle::SinglePass | PaginationStyle::NotSql => None,
    }
}

/// Wrap `inner_sql` as a derived table counting its rows.
///
/// Returns `None` when the dialect cannot count a wrapped query safely — the
/// caller should then derive the total from the rows it actually read rather
/// than reporting a fabricated `0`.
pub fn count_subquery(inner_sql: &str, alias: &str, dialect: Dialect) -> Option<String> {
    match pagination_style(dialect) {
        PaginationStyle::LimitOffset => {
            Some(format!("SELECT COUNT(*) FROM ({inner_sql}) AS {alias}"))
        }
        PaginationStyle::SinglePass | PaginationStyle::NotSql => None,
    }
}

/// Build the ordering + pagination tail for a query the app constructs itself
/// (table browsing), as opposed to a wrapped user query.
///
/// This is the easier case: because we own the whole statement there is no
/// derived table, so SQL Server's ban on `ORDER BY` inside a subquery does not
/// apply and it can page properly with `OFFSET … ROWS FETCH NEXT … ROWS ONLY`.
/// That form still requires an `ORDER BY`, so `None` is returned when the
/// dialect needs one and the caller supplied none — the caller must then
/// resolve a deterministic ordering rather than let pages skip or repeat rows.
///
/// The returned string starts with a leading space and is appended directly to
/// `SELECT … FROM … [WHERE …]`.
pub fn paginate_owned_query(
    order_by: Option<&str>,
    limit: u64,
    offset: u64,
    dialect: Dialect,
) -> Option<String> {
    let order_clause = match order_by {
        Some(o) if !o.trim().is_empty() => format!(" ORDER BY {o}"),
        _ => String::new(),
    };

    match pagination_style(dialect) {
        // Mongo/Redis never reach table-browse SQL; keep their tail identical
        // to the previous behavior so this change cannot regress them.
        PaginationStyle::LimitOffset | PaginationStyle::NotSql => {
            Some(format!("{order_clause} LIMIT {limit} OFFSET {offset}"))
        }
        PaginationStyle::SinglePass if order_clause.is_empty() => None,
        PaginationStyle::SinglePass => Some(format!(
            "{order_clause} OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limit_offset_dialects_page_with_limit_offset() {
        for db in ["postgres", "mysql", "mariadb", "sqlite"] {
            let dialect = Dialect::from_db_type(db);
            let sql = paginated_subquery("SELECT * FROM t", "_export_data", 10, 20, dialect)
                .unwrap_or_else(|| panic!("{db} should paginate"));
            assert_eq!(
                sql, "SELECT * FROM (SELECT * FROM t) AS _export_data LIMIT 10 OFFSET 20",
                "{db}"
            );
        }
    }

    #[test]
    fn mssql_refuses_to_paginate_a_wrapped_query() {
        let dialect = Dialect::from_db_type("mssql");
        assert_eq!(pagination_style(dialect), PaginationStyle::SinglePass);
        assert!(paginated_subquery("SELECT * FROM t", "_export_data", 10, 20, dialect).is_none());
        assert!(count_subquery("SELECT * FROM t", "_export_count", dialect).is_none());
    }

    #[test]
    fn non_sql_engines_have_no_pagination_sql() {
        for db in ["mongodb", "redis"] {
            let dialect = Dialect::from_db_type(db);
            assert_eq!(pagination_style(dialect), PaginationStyle::NotSql, "{db}");
            assert!(paginated_subquery("x", "a", 1, 0, dialect).is_none(), "{db}");
        }
    }

    #[test]
    fn count_subquery_wraps_the_user_query() {
        let dialect = Dialect::from_db_type("postgres");
        assert_eq!(
            count_subquery("SELECT a FROM t ORDER BY a", "_export_count", dialect).unwrap(),
            "SELECT COUNT(*) FROM (SELECT a FROM t ORDER BY a) AS _export_count"
        );
    }

    #[test]
    fn owned_query_uses_limit_offset_on_ansi_dialects() {
        for db in ["postgres", "mysql", "sqlite"] {
            let dialect = Dialect::from_db_type(db);
            assert_eq!(
                paginate_owned_query(Some("\"id\" ASC"), 100, 200, dialect).unwrap(),
                " ORDER BY \"id\" ASC LIMIT 100 OFFSET 200",
                "{db}"
            );
            // No ordering is fine for LIMIT/OFFSET — unchanged from before.
            assert_eq!(
                paginate_owned_query(None, 100, 200, dialect).unwrap(),
                " LIMIT 100 OFFSET 200",
                "{db}"
            );
        }
    }

    #[test]
    fn owned_query_uses_offset_fetch_on_mssql() {
        let dialect = Dialect::from_db_type("mssql");
        assert_eq!(
            paginate_owned_query(Some("[id] ASC"), 100, 200, dialect).unwrap(),
            " ORDER BY [id] ASC OFFSET 200 ROWS FETCH NEXT 100 ROWS ONLY"
        );
    }

    #[test]
    fn owned_query_refuses_mssql_pagination_without_an_ordering() {
        let dialect = Dialect::from_db_type("mssql");
        // OFFSET/FETCH is only legal after ORDER BY, and an arbitrary order
        // would let pages skip or repeat rows.
        assert!(paginate_owned_query(None, 100, 0, dialect).is_none());
        assert!(paginate_owned_query(Some("   "), 100, 0, dialect).is_none());
    }

    #[test]
    fn owned_query_first_page_offsets_are_zero() {
        let mssql = Dialect::from_db_type("mssql");
        assert_eq!(
            paginate_owned_query(Some("[id]"), 50, 0, mssql).unwrap(),
            " ORDER BY [id] OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY"
        );
    }

    #[test]
    fn unknown_engine_falls_back_to_ansi_limit_offset() {
        // `Dialect::from_db_type` maps unknown engines to Postgres (ANSI).
        let dialect = Dialect::from_db_type("cockroach");
        assert_eq!(pagination_style(dialect), PaginationStyle::LimitOffset);
    }
}
