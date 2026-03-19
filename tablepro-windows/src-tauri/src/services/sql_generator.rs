use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::sql_generator_ops::{
    build_delete_statement, build_insert_statement, build_update_statement, qualified_table,
};
use crate::services::sql_quoting::quote_identifier;

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
    pub primary_keys: Vec<String>,
    pub changes: Vec<RowChange>,
}

pub fn generate_statements(payload: &SavePayload) -> Vec<String> {
    let table = qualified_table(&payload.table, &payload.schema);

    payload
        .changes
        .iter()
        .filter_map(|row_change| match row_change.change_type {
            ChangeType::Insert => build_insert_statement(&table, row_change),
            ChangeType::Update => build_update_statement(&table, payload, row_change),
            ChangeType::Delete => build_delete_statement(&table, payload, row_change),
        })
        .collect()
}

fn sql_literal(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::Bool(b) => {
            if *b {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
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

    rows.iter()
        .map(|row| {
            let values = row.iter().map(sql_literal).collect::<Vec<_>>().join(", ");
            format!("INSERT INTO {quoted_table} ({quoted_columns}) VALUES ({values});")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn generate_update_sql(
    table: &str,
    schema: Option<&str>,
    columns: &[String],
    rows: &[Vec<Value>],
    primary_keys: &[String],
    driver_type: &str,
) -> String {
    if rows.is_empty() || columns.is_empty() {
        return String::new();
    }

    let quoted_table = quote_qualified_table(table, schema, driver_type);

    let col_index = columns
        .iter()
        .enumerate()
        .map(|(idx, col)| (col.as_str(), idx))
        .collect::<std::collections::HashMap<_, _>>();

    rows.iter()
        .map(|row| {
            let set_clause = columns
                .iter()
                .enumerate()
                .map(|(idx, col)| {
                    let value = row.get(idx).unwrap_or(&Value::Null);
                    format!(
                        "{}={}",
                        quote_identifier(col, driver_type),
                        sql_literal(value)
                    )
                })
                .collect::<Vec<_>>()
                .join(", ");

            let where_clause = primary_keys
                .iter()
                .filter_map(|pk| {
                    col_index.get(pk.as_str()).map(|idx| {
                        let value = row.get(*idx).unwrap_or(&Value::Null);
                        format!(
                            "{}={}",
                            quote_identifier(pk, driver_type),
                            sql_literal(value)
                        )
                    })
                })
                .collect::<Vec<_>>()
                .join(" AND ");

            if where_clause.is_empty() {
                format!("UPDATE {quoted_table} SET {set_clause};")
            } else {
                format!("UPDATE {quoted_table} SET {set_clause} WHERE {where_clause};")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::sql_generator_ops::{escape_value, qualified_table as qt, quote_ident};

    fn make_payload() -> SavePayload {
        SavePayload {
            table: "users".to_string(),
            schema: Some("public".to_string()),
            columns: vec!["id".to_string(), "name".to_string(), "age".to_string()],
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
        let stmts = generate_statements(&p);
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
        let stmts = generate_statements(&p);
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
        let stmts = generate_statements(&p);
        assert_eq!(stmts.len(), 1);
        assert_eq!(stmts[0], r#"DELETE FROM "public"."users" WHERE "id"=42"#);
    }

    #[test]
    fn test_escape_null() {
        assert_eq!(escape_value(&None), "NULL");
    }

    #[test]
    fn test_escape_numeric() {
        assert_eq!(escape_value(&Some("3.14".to_string())), "3.14");
    }

    #[test]
    fn test_escape_string_with_quote() {
        assert_eq!(escape_value(&Some("it's".to_string())), "'it''s'");
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
        let stmts = generate_statements(&p);
        assert_eq!(stmts[0], r#"DELETE FROM "users" WHERE "id"=1"#);
    }

    #[test]
    fn test_empty_payload_returns_empty() {
        let p = make_payload();
        assert!(generate_statements(&p).is_empty());
    }

    #[test]
    fn test_insert_empty_changes_skipped() {
        let mut p = make_payload();
        p.changes = vec![RowChange {
            change_type: ChangeType::Insert,
            original_row: vec![],
            cell_changes: vec![],
        }];
        assert!(generate_statements(&p).is_empty());
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
        assert!(generate_statements(&p).is_empty());
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
        assert!(generate_statements(&p).is_empty());
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
        assert!(generate_statements(&p).is_empty());
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
        let stmts = generate_statements(&p);
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
        let stmts = generate_statements(&p);
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
        let stmts = generate_statements(&p);
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
        let stmts = generate_statements(&p);
        assert_eq!(stmts[0], r#"DELETE FROM "public"."users" WHERE "id"=NULL"#);
    }

    #[test]
    fn test_escape_negative_number() {
        assert_eq!(escape_value(&Some("-1".to_string())), "-1");
    }

    #[test]
    fn test_escape_scientific_notation() {
        assert_eq!(escape_value(&Some("1e10".to_string())), "1e10");
    }

    #[test]
    fn test_escape_non_numeric_string() {
        assert_eq!(escape_value(&Some("123abc".to_string())), "'123abc'");
    }

    #[test]
    fn test_escape_empty_string() {
        assert_eq!(escape_value(&Some(String::new())), "''");
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
        let stmts = generate_statements(&p);
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
        );
        assert_eq!(
            sql,
            "UPDATE \"public\".\"users\" SET \"id\"=7, \"name\"='Neo' WHERE \"id\"=7;"
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
            "INSERT INTO `flags` (`ok`, `payload`, `meta`) VALUES (TRUE, NULL, '{\"a\":1,\"b\":\"x\"}');"
        );
    }

    #[test]
    fn test_quote_ident() {
        assert_eq!(quote_ident("my_table"), r#""my_table""#);
    }

    #[test]
    fn test_qualified_table_with_schema() {
        assert_eq!(
            qt("users", &Some("public".to_string())),
            r#""public"."users""#
        );
    }

    #[test]
    fn test_qualified_table_without_schema() {
        assert_eq!(qt("users", &None), r#""users""#);
    }
}
