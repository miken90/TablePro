//! Dialect-aware pagination for a query the app builds itself.
//!
//! `LIMIT … OFFSET …` is not portable — SQL Server spells it
//! `OFFSET … ROWS FETCH NEXT … ROWS ONLY` and additionally requires an
//! `ORDER BY`. Dialect selection reuses
//! [`Dialect`](crate::services::sql_generator::Dialect) rather than
//! introducing a second engine switch.
//!
//! Wrapping an *arbitrary user* query in `LIMIT`/`OFFSET` is deliberately not
//! offered: without an order the query itself defines, no engine here promises
//! the same row order across executions, so consecutive pages can skip and
//! repeat rows. Export runs the user's query once instead.

use crate::services::sql_generator::Dialect;

/// How a dialect can page through a wrapped user query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaginationStyle {
    /// `LIMIT n OFFSET m` — PostgreSQL, MySQL/MariaDB, SQLite.
    LimitOffset,
    /// `OFFSET … ROWS FETCH NEXT … ROWS ONLY`, and only after an `ORDER BY` —
    /// SQL Server. A caller with no ordering gets `None` rather than an
    /// arbitrary order under which pages repeat or skip rows.
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
