//! Resolve a stable `ORDER BY` for browsing a table page by page.
//!
//! Only SQL Server reaches this: `OFFSET … ROWS FETCH NEXT … ROWS ONLY` is the
//! only pagination form it has and it is illegal without an `ORDER BY`, while
//! PostgreSQL, MySQL and SQLite page with bare `LIMIT`/`OFFSET`.
//!
//! Ordering by *every* column — the previous fallback — is both slow (a full
//! sort per page on an unindexed key set) and, on SQL Server, frequently
//! illegal: `text`, `ntext`, `image`, `xml`, `geography`, `geometry` and
//! `hierarchyid` cannot appear in `ORDER BY` (Msg 306/305), so browsing such a
//! table failed outright.

use crate::models::{AppError, ColumnInfo, IndexInfo};
use crate::services::sql_quoting::quote_identifier;

/// Columns SQL Server refuses to sort by.
const MSSQL_UNORDERABLE_TYPES: &[&str] = &[
    "text",
    "ntext",
    "image",
    "xml",
    "geography",
    "geometry",
    "hierarchyid",
];

/// SQL Server's physical row locator. Every rowstore row has one, it needs no
/// metadata lookup, and it gives a total order within a single scan — the last
/// resort before failing the browse entirely.
pub const MSSQL_PHYSLOC: &str = "%%physloc%%";

/// Where an ordering came from, so the caller can log it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderingSource {
    PrimaryKey,
    UniqueIndex,
    IdentityColumn,
    PhysicalLocator,
    AllColumns,
}

/// The ordering to append after `ORDER BY`, and where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowseOrdering {
    pub clause: String,
    pub source: OrderingSource,
}

fn is_orderable(column: &ColumnInfo, driver_type: &str) -> bool {
    if Dialectish::from(driver_type) != Dialectish::Mssql {
        return true;
    }
    let base = column
        .type_name
        .trim()
        .to_ascii_lowercase()
        .split('(')
        .next()
        .unwrap_or("")
        .to_string();
    !MSSQL_UNORDERABLE_TYPES.contains(&base.as_str())
}

/// Minimal engine discriminator — this module only needs "is it SQL Server".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Dialectish {
    Mssql,
    Other,
}

impl Dialectish {
    fn from(driver_type: &str) -> Self {
        match driver_type.to_ascii_lowercase().as_str() {
            "mssql" | "sqlserver" | "sql_server" => Self::Mssql,
            _ => Self::Other,
        }
    }
}

/// Pick the ordering key: primary key → unique index → identity column →
/// `%%physloc%%` (SQL Server) or every column (other engines).
///
/// `identity_column` is resolved by the caller because it needs a query; it is
/// only looked up when the first two options come up empty.
pub fn resolve_browse_ordering(
    table: &str,
    columns: &[ColumnInfo],
    indexes: &[IndexInfo],
    identity_column: Option<&str>,
    driver_type: &str,
) -> Result<BrowseOrdering, AppError> {
    if columns.is_empty() {
        return Err(AppError::DatabaseError(format!(
            "No columns found for '{table}'; cannot order rows for pagination"
        )));
    }

    let quote_all = |names: &[String]| -> String {
        names
            .iter()
            .map(|n| quote_identifier(n, driver_type))
            .collect::<Vec<_>>()
            .join(", ")
    };

    let primary_keys: Vec<String> = columns
        .iter()
        .filter(|c| c.is_primary_key)
        .map(|c| c.name.clone())
        .collect();
    if !primary_keys.is_empty() {
        return Ok(BrowseOrdering {
            clause: quote_all(&primary_keys),
            source: OrderingSource::PrimaryKey,
        });
    }

    // A unique index is as good a row addressee as a primary key, as long as
    // every column in it is one this engine can sort by.
    let unique = indexes.iter().find(|idx| {
        idx.is_unique
            && !idx.columns.is_empty()
            && idx.columns.iter().all(|name| {
                columns
                    .iter()
                    .find(|c| &c.name == name)
                    .is_some_and(|c| is_orderable(c, driver_type))
            })
    });
    if let Some(index) = unique {
        return Ok(BrowseOrdering {
            clause: quote_all(&index.columns),
            source: OrderingSource::UniqueIndex,
        });
    }

    if let Some(identity) = identity_column.filter(|name| !name.trim().is_empty()) {
        return Ok(BrowseOrdering {
            clause: quote_identifier(identity, driver_type),
            source: OrderingSource::IdentityColumn,
        });
    }

    if Dialectish::from(driver_type) == Dialectish::Mssql {
        return Ok(BrowseOrdering {
            clause: MSSQL_PHYSLOC.to_string(),
            source: OrderingSource::PhysicalLocator,
        });
    }

    // Other engines: ordering by every column keeps pagination stable in
    // content terms — rows can only tie when they are identical everywhere,
    // and swapping identical rows between pages is unobservable.
    let orderable: Vec<String> = columns
        .iter()
        .filter(|c| is_orderable(c, driver_type))
        .map(|c| c.name.clone())
        .collect();
    if orderable.is_empty() {
        return Err(AppError::DatabaseError(format!(
            "'{table}' has no primary key, unique index, or sortable column; cannot page through it"
        )));
    }
    Ok(BrowseOrdering {
        clause: quote_all(&orderable),
        source: OrderingSource::AllColumns,
    })
}

/// `sys.identity_columns` lookup for a SQL Server table.
///
/// Returns `None` for every other engine — identity is the SQL Server spelling
/// and the other engines never reach this fallback.
pub fn identity_column_query(table: &str, schema: Option<&str>, driver_type: &str) -> Option<String> {
    if Dialectish::from(driver_type) != Dialectish::Mssql {
        return None;
    }
    let qualified = match schema.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => format!("{}.{}", quote_identifier(s, driver_type), quote_identifier(table, driver_type)),
        None => quote_identifier(table, driver_type),
    };
    // OBJECT_ID takes the name as a string literal, so the quoted identifier
    // is embedded with its single quotes doubled.
    Some(format!(
        "SELECT TOP 1 name FROM sys.identity_columns WHERE object_id = OBJECT_ID('{}')",
        qualified.replace('\'', "''")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn col(name: &str, type_name: &str, pk: bool) -> ColumnInfo {
        ColumnInfo {
            name: name.to_string(),
            type_name: type_name.to_string(),
            nullable: false,
            is_primary_key: pk,
        }
    }

    fn index(name: &str, columns: &[&str], unique: bool) -> IndexInfo {
        IndexInfo {
            name: name.to_string(),
            columns: columns.iter().map(|c| c.to_string()).collect(),
            is_unique: unique,
            index_type: "BTREE".to_string(),
        }
    }

    #[test]
    fn primary_key_wins() {
        let ordering = resolve_browse_ordering(
            "t",
            &[col("id", "int", true), col("body", "text", false)],
            &[index("ix", &["body"], true)],
            Some("id"),
            "mssql",
        )
        .unwrap();
        assert_eq!(ordering.clause, "[id]");
        assert_eq!(ordering.source, OrderingSource::PrimaryKey);
    }

    #[test]
    fn unique_index_is_used_when_there_is_no_primary_key() {
        let ordering = resolve_browse_ordering(
            "t",
            &[col("a", "int", false), col("b", "int", false)],
            &[index("ix_nonunique", &["a"], false), index("ix", &["a", "b"], true)],
            None,
            "mssql",
        )
        .unwrap();
        assert_eq!(ordering.clause, "[a], [b]");
        assert_eq!(ordering.source, OrderingSource::UniqueIndex);
    }

    #[test]
    fn a_unique_index_over_an_unsortable_column_is_rejected() {
        // SQL Server cannot ORDER BY a `text` column (Msg 306).
        let ordering = resolve_browse_ordering(
            "t",
            &[col("body", "text", false)],
            &[index("ix", &["body"], true)],
            Some("seq"),
            "mssql",
        )
        .unwrap();
        assert_eq!(ordering.source, OrderingSource::IdentityColumn);
        assert_eq!(ordering.clause, "[seq]");
    }

    #[test]
    fn physloc_is_the_last_resort_on_sql_server() {
        // No key of any kind, and every column is unsortable.
        let ordering = resolve_browse_ordering(
            "t",
            &[col("body", "text", false), col("doc", "xml", false)],
            &[],
            None,
            "mssql",
        )
        .unwrap();
        assert_eq!(ordering.clause, MSSQL_PHYSLOC);
        assert_eq!(ordering.source, OrderingSource::PhysicalLocator);
        // The whole point: no unsortable column ends up in the clause.
        assert!(!ordering.clause.contains("body"));
        assert!(!ordering.clause.contains("doc"));
    }

    #[test]
    fn other_engines_keep_ordering_by_every_column() {
        let ordering = resolve_browse_ordering(
            "t",
            &[col("a", "text", false), col("b", "int", false)],
            &[],
            None,
            "postgres",
        )
        .unwrap();
        assert_eq!(ordering.clause, "\"a\", \"b\"");
        assert_eq!(ordering.source, OrderingSource::AllColumns);
    }

    #[test]
    fn no_columns_is_an_error() {
        assert!(resolve_browse_ordering("t", &[], &[], None, "mssql").is_err());
    }

    #[test]
    fn identity_lookup_is_sql_server_only_and_escapes_the_name() {
        assert_eq!(
            identity_column_query("orders", Some("dbo"), "mssql").unwrap(),
            "SELECT TOP 1 name FROM sys.identity_columns WHERE object_id = OBJECT_ID('[dbo].[orders]')"
        );
        assert!(identity_column_query("orders", None, "postgres").is_none());
        assert!(identity_column_query("o'x", None, "mssql")
            .unwrap()
            .contains("[o''x]"));
    }
}
