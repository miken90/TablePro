use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::AppError;

use super::sql_generator_ops::{
    build_delete_statement, build_insert_statement, build_update_statement, qualified_table,
};
use super::sql_value_kind::{classify_column_type, ValueKind};
use crate::services::sql_quoting::quote_identifier;

/// Target SQL dialect for ChangeTracker statement generation.
///
/// Maps to the host `db_type` string via [`Dialect::from_db_type`]. Used to
/// pick correct boolean literals and identifier quoting per engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Postgres,
    MySql,
    Mssql,
    Sqlite,
    Mongo,
    Redis,
}

impl Dialect {
    /// Map a host `db_type` string (case-insensitive, accepts common aliases)
    /// to a [`Dialect`]. Unknown engines fall back to `Postgres` (ANSI).
    pub fn from_db_type(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "postgres" | "postgresql" => Self::Postgres,
            "mysql" | "mariadb" => Self::MySql,
            "mssql" | "sqlserver" | "sql_server" => Self::Mssql,
            "sqlite" => Self::Sqlite,
            "mongodb" | "mongo" => Self::Mongo,
            "redis" => Self::Redis,
            _ => Self::Postgres,
        }
    }

    /// Canonical lowercase id used when delegating to `sql_quoting`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Postgres => "postgres",
            Self::MySql => "mysql",
            Self::Mssql => "mssql",
            Self::Sqlite => "sqlite",
            Self::Mongo => "mongodb",
            Self::Redis => "redis",
        }
    }

    /// Per-dialect boolean literal.
    ///
    /// - PG / SQLite: `TRUE` / `FALSE`
    /// - MSSQL (`bit`), MySQL (`tinyint(1)`): `1` / `0`
    /// - Mongo / Redis: not SQL — use `TRUE`/`FALSE` so any SQL pasted in a
    ///   raw editor still parses.
    pub fn bool_literal(self, b: bool) -> &'static str {
        match (self, b) {
            (Self::Mssql | Self::MySql, true) => "1",
            (Self::Mssql | Self::MySql, false) => "0",
            (_, true) => "TRUE",
            (_, false) => "FALSE",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum ChangeType {
    Insert,
    Update,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellChange {
    pub column_name: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowChange {
    pub change_type: ChangeType,
    pub original_row: Vec<Option<String>>,
    pub cell_changes: Vec<CellChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePayload {
    pub table: String,
    pub schema: Option<String>,
    pub columns: Vec<String>,
    /// Declared type of each column, positionally aligned with `columns`.
    ///
    /// Optional on the wire: an older frontend, or a driver that reports no
    /// type name (SQL Server's ad-hoc result sets), simply sends nothing and
    /// every value is then quoted as text — the safe direction.
    #[serde(default)]
    pub column_types: Vec<Option<String>>,
    pub primary_keys: Vec<String>,
    pub changes: Vec<RowChange>,
}

impl SavePayload {
    /// How values of `column_name` must be written, from its declared type.
    /// Unknown column or missing metadata → [`ValueKind::Text`].
    pub(crate) fn value_kind_of(&self, column_name: &str) -> ValueKind {
        let declared = self
            .columns
            .iter()
            .position(|c| c == column_name)
            .and_then(|idx| self.column_types.get(idx))
            .and_then(|t| t.as_deref());
        classify_column_type(declared)
    }
}

pub fn generate_statements(payload: &SavePayload, dialect: Dialect) -> Vec<String> {
    let table = qualified_table(&payload.table, &payload.schema, dialect);

    payload
        .changes
        .iter()
        .filter_map(|row_change| match row_change.change_type {
            ChangeType::Insert => build_insert_statement(&table, payload, row_change, dialect),
            ChangeType::Update => build_update_statement(&table, payload, row_change, dialect),
            ChangeType::Delete => build_delete_statement(&table, payload, row_change, dialect),
        })
        .collect()
}

fn sql_literal(value: &Value, dialect: Dialect) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::Bool(b) => dialect.bool_literal(*b).to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        Value::Array(_) | Value::Object(_) => {
            let json = value.to_string().replace('\'', "''");
            format!("'{json}'")
        }
    }
}

fn quote_qualified_table(table: &str, schema: Option<&str>, driver_type: &str) -> String {
    match schema {
        Some(s) if !s.is_empty() => format!(
            "{}.{}",
            quote_identifier(s, driver_type),
            quote_identifier(table, driver_type)
        ),
        _ => quote_identifier(table, driver_type),
    }
}

pub fn generate_insert_sql(
    table: &str,
    schema: Option<&str>,
    columns: &[String],
    rows: &[Vec<Value>],
    driver_type: &str,
) -> String {
    if rows.is_empty() || columns.is_empty() {
        return String::new();
    }

    let quoted_table = quote_qualified_table(table, schema, driver_type);
    let quoted_columns = columns
        .iter()
        .map(|c| quote_identifier(c, driver_type))
        .collect::<Vec<_>>()
        .join(", ");

    let dialect = Dialect::from_db_type(driver_type);
    rows.iter()
        .map(|row| {
            let values = row
                .iter()
                .map(|v| sql_literal(v, dialect))
                .collect::<Vec<_>>()
                .join(", ");
            format!("INSERT INTO {quoted_table} ({quoted_columns}) VALUES ({values});")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Build `UPDATE` statements for "copy as SQL".
///
/// Refuses when the rows cannot be addressed by a primary key. The grid's save
/// path already declines to update a row it cannot target
/// ([`build_update_statement`](super::sql_generator_ops::build_update_statement)
/// returns `None`); emitting a WHERE-less `UPDATE` here would hand the user a
/// statement that rewrites every row in the table the moment it is pasted.
pub fn generate_update_sql(
    table: &str,
    schema: Option<&str>,
    columns: &[String],
    rows: &[Vec<Value>],
    primary_keys: &[String],
    driver_type: &str,
) -> Result<String, AppError> {
    if rows.is_empty() || columns.is_empty() {
        return Ok(String::new());
    }

    let addressable = primary_keys
        .iter()
        .any(|pk| columns.iter().any(|col| col == pk));
    if !addressable {
        return Err(AppError::DatabaseError(format!(
            "Cannot generate UPDATE for '{table}': no primary key column is present in the selection, so every row in the table would be rewritten"
        )));
    }

    let quoted_table = quote_qualified_table(table, schema, driver_type);

    let col_index = columns
        .iter()
        .enumerate()
        .map(|(idx, col)| (col.as_str(), idx))
        .collect::<std::collections::HashMap<_, _>>();

    let dialect = Dialect::from_db_type(driver_type);
    Ok(rows
        .iter()
        .filter_map(|row| {
            let set_clause = columns
                .iter()
                .enumerate()
                .filter(|(_, col)| !primary_keys.contains(col))
                .map(|(idx, col)| {
                    let value = row.get(idx).unwrap_or(&Value::Null);
                    format!(
                        "{}={}",
                        quote_identifier(col, driver_type),
                        sql_literal(value, dialect)
                    )
                })
                .collect::<Vec<_>>()
                .join(", ");

            if set_clause.is_empty() {
                return None;
            }

            let where_clause = primary_keys
                .iter()
                .filter_map(|pk| {
                    col_index.get(pk.as_str()).map(|idx| {
                        let value = row.get(*idx).unwrap_or(&Value::Null);
                        format!(
                            "{}={}",
                            quote_identifier(pk, driver_type),
                            sql_literal(value, dialect)
                        )
                    })
                })
                .collect::<Vec<_>>()
                .join(" AND ");

            // Unreachable while `addressable` holds, but a row that still
            // yields no predicate is skipped rather than widened to the whole
            // table.
            if where_clause.is_empty() {
                return None;
            }
            Some(format!("UPDATE {quoted_table} SET {set_clause} WHERE {where_clause};"))
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::sql_generator_ops::{escape_value, qualified_table as qt, quote_ident};
    use crate::services::sql_value_kind::ValueKind;

    fn make_payload() -> SavePayload {
        SavePayload {
            table: "users".to_string(),
            schema: Some("public".to_string()),
            columns: vec!["id".to_string(), "name".to_string(), "age".to_string()],
            column_types: vec![
                Some("integer".to_string()),
                Some("varchar(50)".to_string()),
                Some("integer".to_string()),
            ],
            primary_keys: vec!["id".to_string()],
            changes: vec![],
        }
    }

    #[test]
    fn test_insert() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Insert,
            original_row: vec![],
            cell_changes: vec![
                CellChange {
                    column_name: "name".to_string(),
                    old_value: None,
                    new_value: Some("Alice".to_string()),
                },
                CellChange {
                    column_name: "age".to_string(),
                    old_value: None,
                    new_value: Some("30".to_string()),
                },
            ],
        }];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert_eq!(stmts.len(), 1);
        assert_eq!(
            stmts[0],
            r#"INSERT INTO "public"."users" ("name","age") VALUES ('Alice',30)"#
        );
    }

    #[test]
    fn test_update() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Update,
            original_row: vec![
                Some("1".to_string()),
                Some("Bob".to_string()),
                Some("25".to_string()),
            ],
            cell_changes: vec![CellChange {
                column_name: "name".to_string(),
                old_value: Some("Bob".to_string()),
                new_value: Some("Charlie".to_string()),
            }],
        }];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert_eq!(stmts.len(), 1);
        assert_eq!(
            stmts[0],
            r#"UPDATE "public"."users" SET "name"='Charlie' WHERE "id"=1"#
        );
    }

    #[test]
    fn test_delete() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Delete,
            original_row: vec![
                Some("42".to_string()),
                Some("Dave".to_string()),
                Some("20".to_string()),
            ],
            cell_changes: vec![],
        }];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert_eq!(stmts.len(), 1);
        assert_eq!(stmts[0], r#"DELETE FROM "public"."users" WHERE "id"=42"#);
    }

    #[test]
    fn test_escape_null() {
        assert_eq!(escape_value(&None, ValueKind::Text, Dialect::Postgres), "NULL");
    }

    #[test]
    fn test_escape_numeric() {
        // Unquoted only because the column is numeric.
        assert_eq!(
            escape_value(&Some("3.14".to_string()), ValueKind::Numeric, Dialect::Postgres),
            "3.14"
        );
        // The same value in a text column keeps its quotes.
        assert_eq!(
            escape_value(&Some("3.14".to_string()), ValueKind::Text, Dialect::Postgres),
            "'3.14'"
        );
    }

    #[test]
    fn test_escape_string_with_quote() {
        assert_eq!(escape_value(&Some("it's".to_string()), ValueKind::Text, Dialect::Postgres), "'it''s'");
    }

    #[test]
    fn test_no_schema_qualified_table() {
        let mut p = make_payload();
        p.schema = None;
        p.changes = vec![RowChange {
            change_type: ChangeType::Delete,
            original_row: vec![
                Some("1".to_string()),
                Some("a".to_string()),
                Some("10".to_string()),
            ],
            cell_changes: vec![],
        }];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert_eq!(stmts[0], r#"DELETE FROM "users" WHERE "id"=1"#);
    }

    #[test]
    fn test_empty_payload_returns_empty() {
        let p = make_payload();
        assert!(generate_statements(&p, Dialect::Postgres).is_empty());
    }

    #[test]
    fn test_insert_empty_changes_skipped() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Insert,
            original_row: vec![],
            cell_changes: vec![],
        }];
        assert!(generate_statements(&p, Dialect::Postgres).is_empty());
    }

    #[test]
    fn test_update_empty_changes_skipped() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Update,
            original_row: vec![
                Some("1".to_string()),
                Some("x".to_string()),
                Some("5".to_string()),
            ],
            cell_changes: vec![],
        }];
        assert!(generate_statements(&p, Dialect::Postgres).is_empty());
    }

    #[test]
    fn test_update_no_primary_key_skipped() {
        let mut p = make_payload();
        p.primary_keys = vec![];
        p.changes = vec![RowChange {
            change_type: ChangeType::Update,
            original_row: vec![
                Some("1".to_string()),
                Some("x".to_string()),
                Some("5".to_string()),
            ],
            cell_changes: vec![CellChange {
                column_name: "name".to_string(),
                old_value: Some("x".to_string()),
                new_value: Some("y".to_string()),
            }],
        }];
        assert!(generate_statements(&p, Dialect::Postgres).is_empty());
    }

    #[test]
    fn test_delete_no_primary_key_skipped() {
        let mut p = make_payload();
        p.primary_keys = vec![];
        p.changes = vec![RowChange {
            change_type: ChangeType::Delete,
            original_row: vec![Some("1".to_string())],
            cell_changes: vec![],
        }];
        assert!(generate_statements(&p, Dialect::Postgres).is_empty());
    }

    #[test]
    fn test_multiple_primary_keys() {
        let p = SavePayload {
            table: "order_items".to_string(),
            schema: None,
            columns: vec![
                "order_id".to_string(),
                "item_id".to_string(),
                "qty".to_string(),
            ],
            column_types: vec![
                Some("bigint".to_string()),
                Some("bigint".to_string()),
                Some("int".to_string()),
            ],
            primary_keys: vec!["order_id".to_string(), "item_id".to_string()],
            changes: vec![RowChange {
                change_type: ChangeType::Delete,
                original_row: vec![
                    Some("10".to_string()),
                    Some("20".to_string()),
                    Some("3".to_string()),
                ],
                cell_changes: vec![],
            }],
        };
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert_eq!(
            stmts[0],
            r#"DELETE FROM "order_items" WHERE "order_id"=10 AND "item_id"=20"#
        );
    }

    #[test]
    fn test_mixed_changes() {
        let mut p = make_payload();
        p.changes = vec![
            RowChange {
                change_type: ChangeType::Insert,
                original_row: vec![],
                cell_changes: vec![CellChange {
                    column_name: "name".to_string(),
                    old_value: None,
                    new_value: Some("New".to_string()),
                }],
            },
            RowChange {
                change_type: ChangeType::Update,
                original_row: vec![
                    Some("2".to_string()),
                    Some("Old".to_string()),
                    Some("30".to_string()),
                ],
                cell_changes: vec![CellChange {
                    column_name: "name".to_string(),
                    old_value: Some("Old".to_string()),
                    new_value: Some("Updated".to_string()),
                }],
            },
            RowChange {
                change_type: ChangeType::Delete,
                original_row: vec![
                    Some("3".to_string()),
                    Some("Gone".to_string()),
                    Some("40".to_string()),
                ],
                cell_changes: vec![],
            },
        ];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert_eq!(stmts.len(), 3);
        assert!(stmts[0].starts_with("INSERT"));
        assert!(stmts[1].starts_with("UPDATE"));
        assert!(stmts[2].starts_with("DELETE"));
    }

    #[test]
    fn test_sql_injection_single_quotes() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Insert,
            original_row: vec![],
            cell_changes: vec![CellChange {
                column_name: "name".to_string(),
                old_value: None,
                new_value: Some("Robert'; DROP TABLE users;--".to_string()),
            }],
        }];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert!(stmts[0].contains("Robert''; DROP TABLE users;--"));
    }

    #[test]
    fn test_null_in_where_clause() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Delete,
            original_row: vec![None, Some("x".to_string()), Some("5".to_string())],
            cell_changes: vec![],
        }];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert_eq!(stmts[0], r#"DELETE FROM "public"."users" WHERE "id" IS NULL"#);
    }

    #[test]
    fn test_escape_negative_number() {
        assert_eq!(
            escape_value(&Some("-1".to_string()), ValueKind::Numeric, Dialect::Postgres),
            "-1"
        );
    }

    #[test]
    fn test_escape_scientific_notation() {
        assert_eq!(
            escape_value(&Some("1e10".to_string()), ValueKind::Numeric, Dialect::Postgres),
            "1e10"
        );
    }

    #[test]
    fn test_escape_non_numeric_string() {
        // Not a numeric literal even though the column claims to be numeric:
        // quote it and let the engine coerce or reject it.
        assert_eq!(
            escape_value(&Some("123abc".to_string()), ValueKind::Numeric, Dialect::Postgres),
            "'123abc'"
        );
        assert_eq!(
            escape_value(&Some("123abc".to_string()), ValueKind::Text, Dialect::Postgres),
            "'123abc'"
        );
    }

    #[test]
    fn test_escape_empty_string() {
        assert_eq!(escape_value(&Some(String::new()), ValueKind::Text, Dialect::Postgres), "''");
    }

    #[test]
    fn test_insert_null_value() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Insert,
            original_row: vec![],
            cell_changes: vec![CellChange {
                column_name: "name".to_string(),
                old_value: None,
                new_value: None,
            }],
        }];
        let stmts = generate_statements(&p, Dialect::Postgres);
        assert!(stmts[0].contains("NULL"));
    }

    #[test]
    fn test_generate_insert_sql_uses_driver_quoting() {
        let sql = generate_insert_sql(
            "my]table",
            Some("dbo"),
            &["id".to_string(), "na]me".to_string()],
            &[vec![Value::from(1), Value::from("A'B")]],
            "mssql",
        );
        assert_eq!(
            sql,
            "INSERT INTO [dbo].[my]]table] ([id], [na]]me]) VALUES (1, 'A''B');"
        );
    }

    #[test]
    fn test_generate_update_sql_uses_primary_key_where() {
        let sql = generate_update_sql(
            "users",
            Some("public"),
            &["id".to_string(), "name".to_string()],
            &[vec![Value::from(7), Value::from("Neo")]],
            &["id".to_string()],
            "postgres",
        )
        .unwrap();
        assert_eq!(
            sql,
            "UPDATE \"public\".\"users\" SET \"name\"='Neo' WHERE \"id\"=7;"
        );
    }

    #[test]
    fn test_generate_insert_sql_handles_null_bool_json() {
        let sql = generate_insert_sql(
            "flags",
            None,
            &["ok".to_string(), "payload".to_string(), "meta".to_string()],
            &[vec![
                Value::Bool(true),
                Value::Null,
                serde_json::json!({"a": 1, "b": "x"}),
            ]],
            "mysql",
        );
        assert_eq!(
            sql,
            "INSERT INTO `flags` (`ok`, `payload`, `meta`) VALUES (1, NULL, '{\"a\":1,\"b\":\"x\"}');"
        );
    }

    #[test]
    fn test_quote_ident() {
        assert_eq!(quote_ident("my_table", Dialect::Postgres), r#""my_table""#);
    }

    #[test]
    fn test_qualified_table_with_schema() {
        assert_eq!(
            qt("users", &Some("public".to_string()), Dialect::Postgres),
            r#""public"."users""#
        );
    }

    #[test]
    fn test_qualified_table_without_schema() {
        assert_eq!(qt("users", &None, Dialect::Postgres), r#""users""#);
    }

    // ── Dialect coverage (Phase 3 Item 1) ──────────────────────────────────

    #[test]
    fn test_dialect_from_db_type_aliases() {
        assert_eq!(Dialect::from_db_type("postgres"), Dialect::Postgres);
        assert_eq!(Dialect::from_db_type("PostgreSQL"), Dialect::Postgres);
        assert_eq!(Dialect::from_db_type("mysql"), Dialect::MySql);
        assert_eq!(Dialect::from_db_type("mariadb"), Dialect::MySql);
        assert_eq!(Dialect::from_db_type("mssql"), Dialect::Mssql);
        assert_eq!(Dialect::from_db_type("sqlserver"), Dialect::Mssql);
        assert_eq!(Dialect::from_db_type("sqlite"), Dialect::Sqlite);
        assert_eq!(Dialect::from_db_type("mongo"), Dialect::Mongo);
        assert_eq!(Dialect::from_db_type("redis"), Dialect::Redis);
        // Unknown → ANSI / Postgres fallback
        assert_eq!(Dialect::from_db_type("oracle"), Dialect::Postgres);
    }

    #[test]
    fn test_bool_literal_per_dialect() {
        assert_eq!(Dialect::Postgres.bool_literal(true), "TRUE");
        assert_eq!(Dialect::Postgres.bool_literal(false), "FALSE");
        assert_eq!(Dialect::Sqlite.bool_literal(true), "TRUE");
        assert_eq!(Dialect::MySql.bool_literal(true), "1");
        assert_eq!(Dialect::MySql.bool_literal(false), "0");
        assert_eq!(Dialect::Mssql.bool_literal(true), "1");
        assert_eq!(Dialect::Mssql.bool_literal(false), "0");
        assert_eq!(Dialect::Mongo.bool_literal(true), "TRUE");
        assert_eq!(Dialect::Redis.bool_literal(false), "FALSE");
    }

    #[test]
    fn test_escape_value_bool_string_dialect_aware() {
        // A boolean *column* renders the dialect's boolean literal.
        assert_eq!(
            escape_value(&Some("true".to_string()), ValueKind::Boolean, Dialect::Postgres),
            "TRUE"
        );
        assert_eq!(
            escape_value(&Some("FALSE".to_string()), ValueKind::Boolean, Dialect::Postgres),
            "FALSE"
        );
        assert_eq!(
            escape_value(&Some("true".to_string()), ValueKind::Boolean, Dialect::MySql),
            "1"
        );
        assert_eq!(
            escape_value(&Some("false".to_string()), ValueKind::Boolean, Dialect::Mssql),
            "0"
        );
        assert_eq!(
            escape_value(&Some("True".to_string()), ValueKind::Boolean, Dialect::Sqlite),
            "TRUE"
        );
        // PostgreSQL renders `boolean` as t/f in the grid; it must round-trip.
        assert_eq!(
            escape_value(&Some("t".to_string()), ValueKind::Boolean, Dialect::Postgres),
            "TRUE"
        );
        // The literal word in a text column stays a string.
        assert_eq!(
            escape_value(&Some("true".to_string()), ValueKind::Text, Dialect::MySql),
            "'true'"
        );
    }

    // ── Column-type-driven quoting (defect: value-shape guessing) ──────────

    /// Build a payload whose single column has the given declared type.
    fn typed_insert(column: &str, declared_type: Option<&str>, value: &str) -> Vec<String> {
        let payload = SavePayload {
            table: "t".to_string(),
            schema: None,
            columns: vec![column.to_string()],
            column_types: vec![declared_type.map(str::to_string)],
            primary_keys: vec![],
            changes: vec![RowChange {
                change_type: ChangeType::Insert,
                original_row: vec![],
                cell_changes: vec![CellChange {
                    column_name: column.to_string(),
                    old_value: None,
                    new_value: Some(value.to_string()),
                }],
            }],
        };
        generate_statements(&payload, Dialect::Postgres)
    }

    #[test]
    fn text_column_keeps_a_leading_zero_postcode() {
        // The defect: "007" parsed as f64 and was stored as 7.
        assert_eq!(
            typed_insert("postcode", Some("varchar(10)"), "007")[0],
            r#"INSERT INTO "t" ("postcode") VALUES ('007')"#
        );
    }

    #[test]
    fn text_column_keeps_values_that_merely_look_numeric() {
        for value in ["+5", "NaN", "inf", "infinity", "1e10", "-0"] {
            let stmt = typed_insert("code", Some("text"), value).remove(0);
            assert!(
                stmt.contains(&format!("('{value}')")),
                "{value} must stay quoted: {stmt}"
            );
        }
    }

    #[test]
    fn text_column_keeps_the_literal_words_true_and_false() {
        assert_eq!(
            typed_insert("label", Some("varchar(10)"), "true")[0],
            r#"INSERT INTO "t" ("label") VALUES ('true')"#
        );
        assert_eq!(
            typed_insert("label", Some("varchar(10)"), "false")[0],
            r#"INSERT INTO "t" ("label") VALUES ('false')"#
        );
    }

    #[test]
    fn numeric_column_still_emits_bare_numbers() {
        assert_eq!(
            typed_insert("qty", Some("integer"), "42")[0],
            r#"INSERT INTO "t" ("qty") VALUES (42)"#
        );
        assert_eq!(
            typed_insert("ratio", Some("numeric(10,2)"), "-3.50")[0],
            r#"INSERT INTO "t" ("ratio") VALUES (-3.50)"#
        );
    }

    #[test]
    fn numeric_column_quotes_a_value_that_is_not_a_numeric_literal() {
        // `NaN` is not a bare literal on any of these engines; quoted, the
        // engine can coerce it (`'NaN'::numeric`) or reject it clearly.
        assert_eq!(
            typed_insert("ratio", Some("double precision"), "NaN")[0],
            r#"INSERT INTO "t" ("ratio") VALUES ('NaN')"#
        );
    }

    #[test]
    fn missing_type_metadata_falls_back_to_quoting() {
        // Older payloads carry no types at all — quoting is the safe direction.
        assert_eq!(
            typed_insert("anything", None, "007")[0],
            r#"INSERT INTO "t" ("anything") VALUES ('007')"#
        );
        assert_eq!(
            typed_insert("anything", None, "42")[0],
            r#"INSERT INTO "t" ("anything") VALUES ('42')"#
        );
    }

    #[test]
    fn null_stays_null_whatever_the_column_type() {
        for declared in [Some("integer"), Some("varchar(4)"), Some("boolean"), None] {
            let payload = SavePayload {
                table: "t".to_string(),
                schema: None,
                columns: vec!["c".to_string()],
                column_types: vec![declared.map(str::to_string)],
                primary_keys: vec![],
                changes: vec![RowChange {
                    change_type: ChangeType::Insert,
                    original_row: vec![],
                    cell_changes: vec![CellChange {
                        column_name: "c".to_string(),
                        old_value: None,
                        new_value: None,
                    }],
                }],
            };
            assert_eq!(
                generate_statements(&payload, Dialect::Postgres)[0],
                r#"INSERT INTO "t" ("c") VALUES (NULL)"#
            );
        }
    }

    #[test]
    fn where_clause_quotes_a_text_primary_key() {
        let payload = SavePayload {
            table: "t".to_string(),
            schema: None,
            columns: vec!["code".to_string(), "note".to_string()],
            column_types: vec![Some("varchar(8)".to_string()), Some("text".to_string())],
            primary_keys: vec!["code".to_string()],
            changes: vec![RowChange {
                change_type: ChangeType::Delete,
                original_row: vec![Some("007".to_string()), Some("x".to_string())],
                cell_changes: vec![],
            }],
        };
        assert_eq!(
            generate_statements(&payload, Dialect::Postgres)[0],
            r#"DELETE FROM "t" WHERE "code"='007'"#
        );
    }

    #[test]
    fn test_generate_statements_mysql_identifier_quoting() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Update,
            original_row: vec![
                Some("1".to_string()),
                Some("Bob".to_string()),
                Some("25".to_string()),
            ],
            cell_changes: vec![CellChange {
                column_name: "name".to_string(),
                old_value: Some("Bob".to_string()),
                new_value: Some("Charlie".to_string()),
            }],
        }];
        let stmts = generate_statements(&p, Dialect::MySql);
        assert_eq!(
            stmts[0],
            "UPDATE `public`.`users` SET `name`='Charlie' WHERE `id`=1"
        );
    }

    #[test]
    fn test_generate_statements_mssql_identifier_quoting_and_bool() {
        let mut p = make_payload();
        // `active` is a bit column, so "true" renders as this dialect's
        // boolean literal rather than as the string it would be in a varchar.
        p.columns.push("active".to_string());
        p.column_types.push(Some("bit".to_string()));
        p.changes = vec![RowChange {
            change_type: ChangeType::Insert,
            original_row: vec![],
            cell_changes: vec![
                CellChange {
                    column_name: "name".to_string(),
                    old_value: None,
                    new_value: Some("Alice".to_string()),
                },
                CellChange {
                    column_name: "active".to_string(),
                    old_value: None,
                    new_value: Some("true".to_string()),
                },
            ],
        }];
        let stmts = generate_statements(&p, Dialect::Mssql);
        assert_eq!(
            stmts[0],
            "INSERT INTO [public].[users] ([name],[active]) VALUES ('Alice',1)"
        );
    }

    #[test]
    fn test_generate_statements_sqlite_uses_ansi_quotes() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Delete,
            original_row: vec![
                Some("7".to_string()),
                Some("X".to_string()),
                Some("1".to_string()),
            ],
            cell_changes: vec![],
        }];
        let stmts = generate_statements(&p, Dialect::Sqlite);
        assert_eq!(stmts[0], r#"DELETE FROM "public"."users" WHERE "id"=7"#);
    }

    #[test]
    fn test_generate_insert_sql_mysql_bool_uses_1_0() {
        let sql = generate_insert_sql(
            "flags",
            None,
            &["ok".to_string()],
            &[vec![Value::Bool(true)], vec![Value::Bool(false)]],
            "mysql",
        );
        assert!(sql.contains("VALUES (1)"));
        assert!(sql.contains("VALUES (0)"));
    }

    #[test]
    fn test_generate_insert_sql_postgres_bool_uses_true_false() {
        let sql = generate_insert_sql(
            "flags",
            None,
            &["ok".to_string()],
            &[vec![Value::Bool(true)]],
            "postgres",
        );
        assert!(sql.contains("VALUES (TRUE)"));
    }

    #[test]
    fn test_generate_update_sql_excludes_primary_keys() {
        let sql = generate_update_sql(
            "users",
            None,
            &["id".to_string(), "name".to_string(), "age".to_string()],
            &[vec![Value::from(1), Value::from("Bob"), Value::from(25)]],
            &["id".to_string()],
            "postgres",
        )
        .unwrap();
        // "id" is primary key, so it should not be in SET clause, but should be in WHERE clause
        assert_eq!(
            sql,
            "UPDATE \"users\" SET \"name\"='Bob', \"age\"=25 WHERE \"id\"=1;"
        );
    }

    #[test]
    fn test_generate_update_sql_empty_set_skipped() {
        let sql = generate_update_sql(
            "users",
            None,
            &["id".to_string()],
            &[vec![Value::from(1)]],
            &["id".to_string()],
            "postgres",
        )
        .unwrap();
        // No non-primary key columns, so it should generate an empty string
        assert_eq!(sql, "");
    }

    #[test]
    fn copy_as_update_refuses_when_no_primary_key_is_available() {
        // The defect: this returned `UPDATE "users" SET "name"='Bob';` — a
        // full-table rewrite waiting on the clipboard.
        let err = generate_update_sql(
            "users",
            None,
            &["name".to_string()],
            &[vec![Value::from("Bob")]],
            &[],
            "postgres",
        )
        .unwrap_err();
        assert!(err.to_string().contains("no primary key column"));

        // Primary key declared but not part of the copied selection: same.
        assert!(generate_update_sql(
            "users",
            None,
            &["name".to_string()],
            &[vec![Value::from("Bob")]],
            &["id".to_string()],
            "postgres",
        )
        .is_err());
    }
}

/// Golden masters for [`generate_statements`].
///
/// Written before the save path was refactored to run through a single
/// generation seam, against the generator exactly as it stood. Every expected
/// value here is a snapshot of what the app was already writing to real
/// databases — a diff in any of them is a behaviour change, not a test to
/// update.
#[cfg(test)]
mod golden_masters {
    use super::*;

    fn cell(column: &str, new: Option<&str>) -> CellChange {
        CellChange {
            column_name: column.to_string(),
            old_value: None,
            new_value: new.map(str::to_string),
        }
    }

    fn row(values: &[Option<&str>]) -> Vec<Option<String>> {
        values.iter().map(|v| v.map(str::to_string)).collect()
    }

    /// `id int4` (PK), `name varchar(20)`, `score numeric`, `active bool`.
    fn payload(primary_keys: &[&str], changes: Vec<RowChange>) -> SavePayload {
        SavePayload {
            table: "users".to_string(),
            schema: Some("public".to_string()),
            columns: vec![
                "id".to_string(),
                "name".to_string(),
                "score".to_string(),
                "active".to_string(),
            ],
            column_types: vec![
                Some("int4".to_string()),
                Some("varchar(20)".to_string()),
                Some("numeric".to_string()),
                Some("bool".to_string()),
            ],
            primary_keys: primary_keys.iter().map(|k| k.to_string()).collect(),
            changes,
        }
    }

    fn update(original: &[Option<&str>], cells: Vec<CellChange>) -> RowChange {
        RowChange {
            change_type: ChangeType::Update,
            original_row: row(original),
            cell_changes: cells,
        }
    }

    fn delete(original: &[Option<&str>]) -> RowChange {
        RowChange {
            change_type: ChangeType::Delete,
            original_row: row(original),
            cell_changes: vec![],
        }
    }

    fn insert(cells: Vec<CellChange>) -> RowChange {
        RowChange {
            change_type: ChangeType::Insert,
            original_row: vec![],
            cell_changes: cells,
        }
    }

    const ORIGINAL: &[Option<&str>] = &[Some("7"), Some("ann"), Some("1.5"), Some("true")];

    #[test]
    fn golden_update_on_primary_key() {
        let p = payload(&["id"], vec![update(ORIGINAL, vec![cell("name", Some("bea"))])]);
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![r#"UPDATE "public"."users" SET "name"='bea' WHERE "id"=7"#]
        );
    }

    #[test]
    fn golden_update_value_with_quote_is_doubled() {
        let p = payload(
            &["id"],
            vec![update(ORIGINAL, vec![cell("name", Some("o'brien"))])],
        );
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![r#"UPDATE "public"."users" SET "name"='o''brien' WHERE "id"=7"#]
        );
    }

    #[test]
    fn golden_update_to_null() {
        let p = payload(&["id"], vec![update(ORIGINAL, vec![cell("score", None)])]);
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![r#"UPDATE "public"."users" SET "score"=NULL WHERE "id"=7"#]
        );
    }

    #[test]
    fn golden_update_numeric_and_boolean_columns() {
        let p = payload(
            &["id"],
            vec![update(
                ORIGINAL,
                vec![cell("score", Some("2.25")), cell("active", Some("false"))],
            )],
        );
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![r#"UPDATE "public"."users" SET "score"=2.25, "active"=FALSE WHERE "id"=7"#]
        );
    }

    #[test]
    fn golden_delete_on_primary_key() {
        let p = payload(&["id"], vec![delete(ORIGINAL)]);
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![r#"DELETE FROM "public"."users" WHERE "id"=7"#]
        );
    }

    #[test]
    fn golden_insert_writes_only_the_supplied_cells() {
        let p = payload(
            &["id"],
            vec![insert(vec![
                cell("id", Some("9")),
                cell("name", Some("cyd")),
                cell("score", None),
            ])],
        );
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![r#"INSERT INTO "public"."users" ("id","name","score") VALUES (9,'cyd',NULL)"#]
        );
    }

    /// No primary key detected: the frontend substitutes every column as the
    /// key set, so the WHERE names all four and a NULL original becomes
    /// `IS NULL`.
    #[test]
    fn golden_pk_less_table_keys_on_all_columns() {
        let p = payload(
            &["id", "name", "score", "active"],
            vec![delete(&[Some("7"), Some("ann"), None, Some("true")])],
        );
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![
                r#"DELETE FROM "public"."users" WHERE "id"=7 AND "name"='ann' AND "score" IS NULL AND "active"=TRUE"#
            ]
        );
    }

    #[test]
    fn golden_statement_order_follows_the_payload() {
        let p = payload(
            &["id"],
            vec![
                update(ORIGINAL, vec![cell("name", Some("bea"))]),
                update(
                    &[Some("8"), Some("cyd"), Some("0"), Some("false")],
                    vec![cell("score", Some("3"))],
                ),
                delete(&[Some("9"), Some("dee"), Some("1"), Some("true")]),
            ],
        );
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![
                r#"UPDATE "public"."users" SET "name"='bea' WHERE "id"=7"#,
                r#"UPDATE "public"."users" SET "score"=3 WHERE "id"=8"#,
                r#"DELETE FROM "public"."users" WHERE "id"=9"#,
            ]
        );
    }

    #[test]
    fn golden_mysql_backticks_and_bit_booleans() {
        let p = payload(
            &["id"],
            vec![update(ORIGINAL, vec![cell("active", Some("false"))])],
        );
        assert_eq!(
            generate_statements(&p, Dialect::MySql),
            vec!["UPDATE `public`.`users` SET `active`=0 WHERE `id`=7"]
        );
    }

    #[test]
    fn golden_mssql_brackets_and_bit_booleans() {
        let p = payload(
            &["id"],
            vec![update(ORIGINAL, vec![cell("active", Some("true"))])],
        );
        assert_eq!(
            generate_statements(&p, Dialect::Mssql),
            vec!["UPDATE [public].[users] SET [active]=1 WHERE [id]=7"]
        );
    }

    #[test]
    fn golden_sqlite_uses_ansi_quotes_and_word_booleans() {
        let p = payload(
            &["id"],
            vec![update(ORIGINAL, vec![cell("active", Some("true"))])],
        );
        assert_eq!(
            generate_statements(&p, Dialect::Sqlite),
            vec![r#"UPDATE "public"."users" SET "active"=TRUE WHERE "id"=7"#]
        );
    }

    #[test]
    fn golden_unschemad_table_is_not_qualified() {
        let mut p = payload(&["id"], vec![delete(ORIGINAL)]);
        p.schema = None;
        assert_eq!(
            generate_statements(&p, Dialect::Postgres),
            vec![r#"DELETE FROM "users" WHERE "id"=7"#]
        );
    }
}
