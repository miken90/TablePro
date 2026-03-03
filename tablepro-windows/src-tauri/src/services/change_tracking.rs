use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::database::escaping::escape_string_literal;
use crate::models::DatabaseType;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellChange {
    pub row_index: usize,
    pub column: String,
    pub original_value: Option<String>,
    pub new_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RowInsert {
    pub values: HashMap<String, Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RowDelete {
    pub primary_key_values: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeSet {
    pub updates: Vec<CellChange>,
    pub inserts: Vec<RowInsert>,
    pub deletes: Vec<RowDelete>,
    pub primary_key_columns: Vec<String>,
    pub primary_key_values: HashMap<usize, HashMap<String, String>>,
}

fn format_value(value: &Option<String>, db_type: &DatabaseType) -> String {
    match value {
        None => "NULL".to_string(),
        Some(v) if v.is_empty() => "''".to_string(),
        Some(v) => format!("'{}'", escape_string_literal(v, db_type)),
    }
}

pub struct SqlStatementGenerator;

impl SqlStatementGenerator {
    pub fn generate_updates(
        table: &str,
        db_type: &DatabaseType,
        changes: &[CellChange],
        pk_columns: &[String],
        pk_values: &HashMap<usize, HashMap<String, String>>,
    ) -> Vec<String> {
        let mut grouped: HashMap<usize, Vec<&CellChange>> = HashMap::new();
        for change in changes {
            grouped.entry(change.row_index).or_default().push(change);
        }

        let mut statements = Vec::new();
        for (row_idx, row_changes) in &grouped {
            let pks = match pk_values.get(row_idx) {
                Some(pks) if !pks.is_empty() => pks,
                _ => continue,
            };

            let set_clauses: Vec<String> = row_changes
                .iter()
                .map(|c| {
                    format!(
                        "{} = {}",
                        db_type.quote_identifier(&c.column),
                        format_value(&c.new_value, db_type)
                    )
                })
                .collect();

            let where_clauses: Vec<String> = pk_columns
                .iter()
                .filter_map(|pk| {
                    pks.get(pk).map(|val| {
                        format!(
                            "{} = '{}'",
                            db_type.quote_identifier(pk),
                            escape_string_literal(val, db_type)
                        )
                    })
                })
                .collect();

            if !set_clauses.is_empty() && !where_clauses.is_empty() {
                statements.push(format!(
                    "UPDATE {} SET {} WHERE {}",
                    db_type.quote_identifier(table),
                    set_clauses.join(", "),
                    where_clauses.join(" AND ")
                ));
            }
        }
        statements
    }

    pub fn generate_inserts(
        table: &str,
        db_type: &DatabaseType,
        inserts: &[RowInsert],
    ) -> Vec<String> {
        inserts
            .iter()
            .filter(|ins| !ins.values.is_empty())
            .map(|ins| {
                let columns: Vec<String> = ins
                    .values
                    .keys()
                    .map(|k| db_type.quote_identifier(k))
                    .collect();
                let values: Vec<String> = ins
                    .values
                    .values()
                    .map(|v| format_value(v, db_type))
                    .collect();
                format!(
                    "INSERT INTO {} ({}) VALUES ({})",
                    db_type.quote_identifier(table),
                    columns.join(", "),
                    values.join(", ")
                )
            })
            .collect()
    }

    pub fn generate_deletes(
        table: &str,
        db_type: &DatabaseType,
        deletes: &[RowDelete],
    ) -> Vec<String> {
        deletes
            .iter()
            .filter(|del| !del.primary_key_values.is_empty())
            .map(|del| {
                let where_clauses: Vec<String> = del
                    .primary_key_values
                    .iter()
                    .map(|(col, val)| {
                        format!(
                            "{} = '{}'",
                            db_type.quote_identifier(col),
                            escape_string_literal(val, db_type)
                        )
                    })
                    .collect();
                format!(
                    "DELETE FROM {} WHERE {}",
                    db_type.quote_identifier(table),
                    where_clauses.join(" AND ")
                )
            })
            .collect()
    }

    pub fn generate_all(
        table: &str,
        db_type: &DatabaseType,
        change_set: &ChangeSet,
    ) -> Vec<String> {
        let mut stmts = Vec::new();
        stmts.extend(Self::generate_updates(
            table,
            db_type,
            &change_set.updates,
            &change_set.primary_key_columns,
            &change_set.primary_key_values,
        ));
        stmts.extend(Self::generate_inserts(table, db_type, &change_set.inserts));
        stmts.extend(Self::generate_deletes(table, db_type, &change_set.deletes));
        stmts
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use crate::models::DatabaseType;

    #[test]
    fn generate_updates_single_cell_mysql() {
        let changes = vec![CellChange {
            row_index: 0,
            column: "col".into(),
            original_value: Some("old".into()),
            new_value: Some("val".into()),
        }];
        let pk_columns = vec!["id".to_string()];
        let mut pk_values = HashMap::new();
        pk_values.insert(0, HashMap::from([("id".to_string(), "1".to_string())]));

        let stmts = SqlStatementGenerator::generate_updates(
            "table", &DatabaseType::Mysql, &changes, &pk_columns, &pk_values,
        );
        assert_eq!(stmts.len(), 1);
        assert_eq!(stmts[0], "UPDATE `table` SET `col` = 'val' WHERE `id` = '1'");
    }

    #[test]
    fn generate_updates_multiple_cells_same_row() {
        let changes = vec![
            CellChange { row_index: 0, column: "a".into(), original_value: None, new_value: Some("1".into()) },
            CellChange { row_index: 0, column: "b".into(), original_value: None, new_value: Some("2".into()) },
        ];
        let pk_columns = vec!["id".to_string()];
        let mut pk_values = HashMap::new();
        pk_values.insert(0, HashMap::from([("id".to_string(), "1".to_string())]));

        let stmts = SqlStatementGenerator::generate_updates(
            "t", &DatabaseType::Mysql, &changes, &pk_columns, &pk_values,
        );
        assert_eq!(stmts.len(), 1);
        assert!(stmts[0].starts_with("UPDATE `t` SET "));
        assert!(stmts[0].contains("`a` = '1'"));
        assert!(stmts[0].contains("`b` = '2'"));
        assert!(stmts[0].contains("WHERE `id` = '1'"));
    }

    #[test]
    fn generate_updates_no_pk_values_returns_empty() {
        let changes = vec![CellChange {
            row_index: 0,
            column: "col".into(),
            original_value: None,
            new_value: Some("v".into()),
        }];
        let stmts = SqlStatementGenerator::generate_updates(
            "t", &DatabaseType::Mysql, &changes, &["id".to_string()], &HashMap::new(),
        );
        assert!(stmts.is_empty());
    }

    #[test]
    fn generate_inserts_single_mysql() {
        let inserts = vec![RowInsert {
            values: HashMap::from([("col".to_string(), Some("val".to_string()))]),
        }];
        let stmts = SqlStatementGenerator::generate_inserts("table", &DatabaseType::Mysql, &inserts);
        assert_eq!(stmts.len(), 1);
        assert_eq!(stmts[0], "INSERT INTO `table` (`col`) VALUES ('val')");
    }

    #[test]
    fn generate_inserts_null_value() {
        let inserts = vec![RowInsert {
            values: HashMap::from([("col".to_string(), None)]),
        }];
        let stmts = SqlStatementGenerator::generate_inserts("t", &DatabaseType::Mysql, &inserts);
        assert_eq!(stmts.len(), 1);
        assert!(stmts[0].contains("NULL"));
    }

    #[test]
    fn generate_inserts_empty_values_skipped() {
        let inserts = vec![RowInsert { values: HashMap::new() }];
        let stmts = SqlStatementGenerator::generate_inserts("t", &DatabaseType::Mysql, &inserts);
        assert!(stmts.is_empty());
    }

    #[test]
    fn generate_deletes_single_mysql() {
        let deletes = vec![RowDelete {
            primary_key_values: HashMap::from([("id".to_string(), "1".to_string())]),
        }];
        let stmts = SqlStatementGenerator::generate_deletes("table", &DatabaseType::Mysql, &deletes);
        assert_eq!(stmts.len(), 1);
        assert_eq!(stmts[0], "DELETE FROM `table` WHERE `id` = '1'");
    }

    #[test]
    fn generate_deletes_empty_pk_skipped() {
        let deletes = vec![RowDelete { primary_key_values: HashMap::new() }];
        let stmts = SqlStatementGenerator::generate_deletes("t", &DatabaseType::Mysql, &deletes);
        assert!(stmts.is_empty());
    }

    #[test]
    fn generate_all_combines_all_types() {
        let change_set = ChangeSet {
            updates: vec![CellChange {
                row_index: 0, column: "c".into(), original_value: None, new_value: Some("v".into()),
            }],
            inserts: vec![RowInsert {
                values: HashMap::from([("c".to_string(), Some("v".to_string()))]),
            }],
            deletes: vec![RowDelete {
                primary_key_values: HashMap::from([("id".to_string(), "1".to_string())]),
            }],
            primary_key_columns: vec!["id".to_string()],
            primary_key_values: HashMap::from([(0, HashMap::from([("id".to_string(), "1".to_string())]))]),
        };
        let stmts = SqlStatementGenerator::generate_all("t", &DatabaseType::Mysql, &change_set);
        assert_eq!(stmts.len(), 3);
        assert!(stmts[0].starts_with("UPDATE"));
        assert!(stmts[1].starts_with("INSERT"));
        assert!(stmts[2].starts_with("DELETE"));
    }

    #[test]
    fn postgresql_uses_double_quotes() {
        let deletes = vec![RowDelete {
            primary_key_values: HashMap::from([("id".to_string(), "1".to_string())]),
        }];
        let stmts = SqlStatementGenerator::generate_deletes("table", &DatabaseType::Postgresql, &deletes);
        assert_eq!(stmts[0], r#"DELETE FROM "table" WHERE "id" = '1'"#);
    }

    #[test]
    fn value_with_single_quote_escaped() {
        let changes = vec![CellChange {
            row_index: 0, column: "c".into(), original_value: None, new_value: Some("it's".into()),
        }];
        let pk_columns = vec!["id".to_string()];
        let pk_values = HashMap::from([(0, HashMap::from([("id".to_string(), "1".to_string())]))]);

        let stmts = SqlStatementGenerator::generate_updates(
            "t", &DatabaseType::Mysql, &changes, &pk_columns, &pk_values,
        );
        assert_eq!(stmts.len(), 1);
        assert!(stmts[0].contains("it''s") || stmts[0].contains("it\\'s"));
    }

    #[test]
    fn format_value_cases() {
        assert_eq!(format_value(&None, &DatabaseType::Mysql), "NULL");
        assert_eq!(format_value(&Some("".into()), &DatabaseType::Mysql), "''");
        assert_eq!(format_value(&Some("hello".into()), &DatabaseType::Mysql), "'hello'");
    }
}
