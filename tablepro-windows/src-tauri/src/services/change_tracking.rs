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
