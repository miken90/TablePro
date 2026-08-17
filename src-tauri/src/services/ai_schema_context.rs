use std::collections::HashMap;
use std::fmt;

use crate::models::{ColumnInfo, ForeignKeyInfo, TableInfo};

/// Which kind of AI prompt to generate.
#[derive(Debug, Clone, Copy)]
pub enum PromptTemplate {
    Chat,
    ExplainQuery,
    OptimizeQuery,
    FixError,
}

impl PromptTemplate {
    /// Parse from a camelCase string sent by the frontend.
    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s {
            "chat" => Some(Self::Chat),
            "explainQuery" => Some(Self::ExplainQuery),
            "optimizeQuery" => Some(Self::OptimizeQuery),
            "fixError" => Some(Self::FixError),
            _ => None,
        }
    }
}

impl fmt::Display for PromptTemplate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Chat => write!(f, "chat"),
            Self::ExplainQuery => write!(f, "explainQuery"),
            Self::OptimizeQuery => write!(f, "optimizeQuery"),
            Self::FixError => write!(f, "fixError"),
        }
    }
}

/// Build a system prompt with database schema context for AI features.
pub fn build_system_prompt(
    db_type: &str,
    db_name: &str,
    tables: &[TableInfo],
    columns_by_table: &HashMap<String, Vec<ColumnInfo>>,
    foreign_keys: &HashMap<String, Vec<ForeignKeyInfo>>,
    template: PromptTemplate,
    max_tables: usize,
) -> String {
    let schema_section = build_schema_section(tables, columns_by_table, foreign_keys, max_tables);
    let instructions = template_instructions(template);

    let mut prompt = format!(
        "You are a SQL assistant for a {db_type} database named \"{db_name}\"."
    );

    if !schema_section.is_empty() {
        prompt.push_str("\n\n## Database Schema\n\n");
        prompt.push_str(&schema_section);
    }

    prompt.push_str("\n\n## Instructions\n\n");
    prompt.push_str(instructions);

    prompt
}

fn build_schema_section(
    tables: &[TableInfo],
    columns_by_table: &HashMap<String, Vec<ColumnInfo>>,
    foreign_keys: &HashMap<String, Vec<ForeignKeyInfo>>,
    max_tables: usize,
) -> String {
    if tables.is_empty() {
        return String::new();
    }

    let selected = &tables[..tables.len().min(max_tables)];
    let mut lines: Vec<String> = Vec::new();

    for table in selected {
        let mut header = format!("- \"{}\"", table.name);
        if let Some(count) = table.row_count_estimate {
            header.push_str(&format!(" (~{count} rows)"));
        }
        lines.push(header);

        // Columns
        if let Some(cols) = columns_by_table.get(&table.name) {
            for col in cols {
                let mut desc = format!("  - {} {}", col.name, col.type_name);
                if col.is_primary_key {
                    desc.push_str(" [PK]");
                }
                if !col.nullable {
                    desc.push_str(" [NOT NULL]");
                }
                lines.push(desc);
            }
        }

        // Foreign keys
        if let Some(fks) = foreign_keys.get(&table.name) {
            for fk in fks {
                lines.push(format!(
                    "  FK: {} → {}.{}",
                    fk.column, fk.referenced_table, fk.referenced_column
                ));
            }
        }
    }

    if tables.len() > max_tables {
        lines.push(format!(
            "\n... and {} more tables (not shown)",
            tables.len() - max_tables
        ));
    }

    lines.join("\n")
}

fn template_instructions(template: PromptTemplate) -> &'static str {
    match template {
        PromptTemplate::Chat => {
            "Help the user write SQL queries. Use the schema above for accurate table/column names.\n\
             Respond with SQL when appropriate. Explain your reasoning briefly."
        }
        PromptTemplate::ExplainQuery => {
            "Explain what the following SQL query does, step by step.\n\
             Reference the schema above for context on table relationships."
        }
        PromptTemplate::OptimizeQuery => {
            "Analyze the following SQL query for performance issues.\n\
             Suggest optimizations using the schema above (indexes, joins, subqueries)."
        }
        PromptTemplate::FixError => {
            "The user has a SQL error. Use the schema above to identify the issue \
             and provide a corrected query."
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tables() -> Vec<TableInfo> {
        vec![
            TableInfo {
                name: "users".to_string(),
                schema: Some("public".to_string()),
                table_type: "TABLE".to_string(),
                row_count_estimate: Some(1500),
            },
            TableInfo {
                name: "orders".to_string(),
                schema: Some("public".to_string()),
                table_type: "TABLE".to_string(),
                row_count_estimate: Some(5000),
            },
            TableInfo {
                name: "products".to_string(),
                schema: None,
                table_type: "TABLE".to_string(),
                row_count_estimate: None,
            },
        ]
    }

    fn sample_columns() -> HashMap<String, Vec<ColumnInfo>> {
        let mut map = HashMap::new();
        map.insert(
            "users".to_string(),
            vec![
                ColumnInfo {
                    name: "id".to_string(),
                    type_name: "INTEGER".to_string(),
                    nullable: false,
                    is_primary_key: true,
                },
                ColumnInfo {
                    name: "email".to_string(),
                    type_name: "VARCHAR(255)".to_string(),
                    nullable: false,
                    is_primary_key: false,
                },
            ],
        );
        map.insert(
            "orders".to_string(),
            vec![ColumnInfo {
                name: "user_id".to_string(),
                type_name: "INTEGER".to_string(),
                nullable: true,
                is_primary_key: false,
            }],
        );
        map
    }

    fn sample_fks() -> HashMap<String, Vec<ForeignKeyInfo>> {
        let mut map = HashMap::new();
        map.insert(
            "orders".to_string(),
            vec![ForeignKeyInfo {
                name: "fk_order_user".to_string(),
                column: "user_id".to_string(),
                referenced_table: "users".to_string(),
                referenced_column: "id".to_string(),
            }],
        );
        map
    }

    #[test]
    fn test_chat_prompt_includes_schema() {
        let prompt = build_system_prompt(
            "PostgreSQL",
            "mydb",
            &sample_tables(),
            &sample_columns(),
            &sample_fks(),
            PromptTemplate::Chat,
            10,
        );
        assert!(prompt.contains("PostgreSQL"));
        assert!(prompt.contains("\"mydb\""));
        assert!(prompt.contains("## Database Schema"));
        assert!(prompt.contains("- \"users\" (~1500 rows)"));
        assert!(prompt.contains("id INTEGER [PK] [NOT NULL]"));
        assert!(prompt.contains("FK: user_id → users.id"));
        assert!(prompt.contains("Help the user write SQL queries"));
    }

    #[test]
    fn test_max_tables_cap() {
        let tables = sample_tables(); // 3 tables
        let prompt = build_system_prompt(
            "MySQL",
            "testdb",
            &tables,
            &sample_columns(),
            &sample_fks(),
            PromptTemplate::Chat,
            2,
        );
        assert!(prompt.contains("- \"users\""));
        assert!(prompt.contains("- \"orders\""));
        assert!(!prompt.contains("- \"products\""));
        assert!(prompt.contains("... and 1 more tables (not shown)"));
    }

    #[test]
    fn test_empty_schema_handling() {
        let prompt = build_system_prompt(
            "SQLite",
            "empty.db",
            &[],
            &HashMap::new(),
            &HashMap::new(),
            PromptTemplate::ExplainQuery,
            10,
        );
        assert!(prompt.contains("SQLite"));
        assert!(prompt.contains("\"empty.db\""));
        assert!(!prompt.contains("## Database Schema"));
        assert!(prompt.contains("Explain what the following SQL query does"));
    }

    #[test]
    fn test_all_template_variants() {
        let tables = sample_tables();
        let cols = sample_columns();
        let fks = sample_fks();

        let explain = build_system_prompt("PG", "db", &tables, &cols, &fks, PromptTemplate::ExplainQuery, 10);
        assert!(explain.contains("Explain what the following SQL query does"));

        let optimize = build_system_prompt("PG", "db", &tables, &cols, &fks, PromptTemplate::OptimizeQuery, 10);
        assert!(optimize.contains("Analyze the following SQL query for performance"));

        let fix = build_system_prompt("PG", "db", &tables, &cols, &fks, PromptTemplate::FixError, 10);
        assert!(fix.contains("SQL error"));
    }

    #[test]
    fn test_prompt_template_from_str() {
        assert!(matches!(PromptTemplate::from_str_loose("chat"), Some(PromptTemplate::Chat)));
        assert!(matches!(PromptTemplate::from_str_loose("explainQuery"), Some(PromptTemplate::ExplainQuery)));
        assert!(matches!(PromptTemplate::from_str_loose("optimizeQuery"), Some(PromptTemplate::OptimizeQuery)));
        assert!(matches!(PromptTemplate::from_str_loose("fixError"), Some(PromptTemplate::FixError)));
        assert!(PromptTemplate::from_str_loose("unknown").is_none());
    }
}
