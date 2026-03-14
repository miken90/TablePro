use serde::{Deserialize, Serialize};

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

fn escape_value(v: &Option<String>) -> String {
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

fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s)
}

fn qualified_table(table: &str, schema: &Option<String>) -> String {
    match schema {
        Some(s) => format!("{}.{}", quote_ident(s), quote_ident(table)),
        None => quote_ident(table),
    }
}

fn build_where_clause(
    columns: &[String],
    primary_keys: &[String],
    original_row: &[Option<String>],
) -> String {
    primary_keys
        .iter()
        .filter_map(|pk| {
            columns.iter().position(|c| c == pk).map(|idx| {
                let val = original_row.get(idx).cloned().flatten();
                format!("{}={}", quote_ident(pk), escape_value(&val))
            })
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

pub fn generate_statements(payload: &SavePayload) -> Vec<String> {
    let tbl = qualified_table(&payload.table, &payload.schema);

    payload
        .changes
        .iter()
        .filter_map(|row_change| match row_change.change_type {
            ChangeType::Insert => {
                if row_change.cell_changes.is_empty() {
                    return None;
                }
                let cols: Vec<String> = row_change
                    .cell_changes
                    .iter()
                    .map(|c| quote_ident(&c.column_name))
                    .collect();
                let vals: Vec<String> = row_change
                    .cell_changes
                    .iter()
                    .map(|c| escape_value(&c.new_value))
                    .collect();
                Some(format!(
                    "INSERT INTO {} ({}) VALUES ({})",
                    tbl,
                    cols.join(","),
                    vals.join(",")
                ))
            }
            ChangeType::Update => {
                if row_change.cell_changes.is_empty() {
                    return None;
                }
                let set_clause: Vec<String> = row_change
                    .cell_changes
                    .iter()
                    .map(|c| {
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
                    tbl,
                    set_clause.join(", "),
                    where_clause
                ))
            }
            ChangeType::Delete => {
                let where_clause = build_where_clause(
                    &payload.columns,
                    &payload.primary_keys,
                    &row_change.original_row,
                );
                if where_clause.is_empty() {
                    return None;
                }
                Some(format!("DELETE FROM {} WHERE {}", tbl, where_clause))
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_quote_ident() {
        assert_eq!(quote_ident("my_table"), r#""my_table""#);
    }

    #[test]
    fn test_qualified_table_with_schema() {
        assert_eq!(
            qualified_table("users", &Some("public".to_string())),
            r#""public"."users""#
        );
    }

    #[test]
    fn test_qualified_table_without_schema() {
        assert_eq!(qualified_table("users", &None), r#""users""#);
    }
}
