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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    use crate::models::{ColumnInfo, TableInfo, TableType};

    fn make_table(name: &str, row_count: Option<i64>) -> TableInfo {
        TableInfo {
            name: name.to_string(),
            table_type: TableType::Table,
            row_count,
        }
    }

    fn make_column(name: &str, data_type: &str, is_primary_key: bool, is_nullable: bool) -> ColumnInfo {
        ColumnInfo {
            name: name.to_string(),
            data_type: data_type.to_string(),
            is_nullable,
            is_primary_key,
            default_value: None,
            extra: None,
            charset: None,
            collation: None,
            comment: None,
        }
    }

    #[test]
    fn empty_tables_returns_empty_string() {
        let result = build_schema_context(&[], &HashMap::new());
        assert!(result.is_empty());
    }

    #[test]
    fn single_table_with_columns() {
        let tables = vec![make_table("users", Some(100))];
        let mut cols = HashMap::new();
        cols.insert(
            "users".to_string(),
            vec![
                make_column("id", "int", true, false),
                make_column("name", "varchar", false, true),
            ],
        );

        let result = build_schema_context(&tables, &cols);
        assert!(result.contains("Database Schema:"));
        assert!(result.contains("Table: users"));
        assert!(result.contains("id int PK NOT NULL"));
        assert!(result.contains("name varchar"));
    }

    #[test]
    fn table_with_row_count() {
        let tables = vec![make_table("orders", Some(42))];
        let result = build_schema_context(&tables, &HashMap::new());
        assert!(result.contains("(~42 rows)"));
    }

    #[test]
    fn table_without_row_count() {
        let tables = vec![make_table("orders", None)];
        let result = build_schema_context(&tables, &HashMap::new());
        assert!(!result.contains("rows"));
    }

    #[test]
    fn column_primary_key() {
        let tables = vec![make_table("t", None)];
        let mut cols = HashMap::new();
        cols.insert("t".to_string(), vec![make_column("id", "int", true, true)]);

        let result = build_schema_context(&tables, &cols);
        assert!(result.contains("id int PK"));
    }

    #[test]
    fn column_not_nullable() {
        let tables = vec![make_table("t", None)];
        let mut cols = HashMap::new();
        cols.insert("t".to_string(), vec![make_column("val", "text", false, false)]);

        let result = build_schema_context(&tables, &cols);
        assert!(result.contains("val text NOT NULL"));
    }

    #[test]
    fn multiple_tables() {
        let tables = vec![
            make_table("users", Some(10)),
            make_table("orders", Some(20)),
        ];
        let result = build_schema_context(&tables, &HashMap::new());
        assert!(result.contains("Table: users"));
        assert!(result.contains("Table: orders"));
    }
}
