use std::collections::HashMap;

use crate::models::{ColumnInfo, TableInfo};

pub fn build_schema_context(
    tables: &[TableInfo],
    columns_by_table: &HashMap<String, Vec<ColumnInfo>>,
) -> String {
    if tables.is_empty() {
        return String::new();
    }

    let mut lines = vec!["Database Schema:".to_string()];

    for table in tables {
        let cols = columns_by_table
            .get(&table.name)
            .map(|cols| {
                cols.iter()
                    .map(|c| {
                        let mut desc = format!("{} {}", c.name, c.data_type);
                        if c.is_primary_key {
                            desc.push_str(" PK");
                        }
                        if !c.is_nullable {
                            desc.push_str(" NOT NULL");
                        }
                        desc
                    })
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();

        let row_info = table
            .row_count
            .map(|c| format!(" (~{} rows)", c))
            .unwrap_or_default();

        lines.push(format!(
            "Table: {}{} (columns: {})",
            table.name, row_info, cols
        ));
    }

    lines.join("\n")
}
