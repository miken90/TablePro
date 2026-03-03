//! Export data to CSV, JSON, SQL formats.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

use crate::database::escaping::escape_string_literal;
use crate::models::DatabaseType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Sql,
    Xlsx,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub file_path: String,
    pub table_name: Option<String>,
    pub include_headers: bool,
    pub delimiter: Option<String>,
    pub pretty: Option<bool>,
    pub db_type: Option<DatabaseType>,
}

pub fn export_to_csv(
    rows: &[Vec<Option<String>>],
    columns: &[String],
    options: &ExportOptions,
) -> Result<String, String> {
    let delimiter = options
        .delimiter
        .as_deref()
        .unwrap_or(",")
        .chars()
        .next()
        .unwrap_or(',');
    let path = Path::new(&options.file_path);

    let mut file = fs::File::create(path).map_err(|e| format!("Failed to create file: {e}"))?;

    if options.include_headers {
        let header_line: Vec<String> = columns.iter().map(|c| csv_escape(c, delimiter)).collect();
        writeln!(file, "{}", header_line.join(&delimiter.to_string()))
            .map_err(|e| format!("Write error: {e}"))?;
    }

    for row in rows {
        let line: Vec<String> = row
            .iter()
            .map(|cell| match cell {
                Some(v) => csv_escape(v, delimiter),
                None => String::new(),
            })
            .collect();
        writeln!(file, "{}", line.join(&delimiter.to_string()))
            .map_err(|e| format!("Write error: {e}"))?;
    }

    Ok(options.file_path.clone())
}

pub fn export_to_json(
    rows: &[Vec<Option<String>>],
    columns: &[String],
    options: &ExportOptions,
) -> Result<String, String> {
    let path = Path::new(&options.file_path);
    let pretty = options.pretty.unwrap_or(true);

    let objects: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let mut map = serde_json::Map::new();
            for (i, col) in columns.iter().enumerate() {
                let val = row
                    .get(i)
                    .and_then(|v| v.as_ref())
                    .map(|v| serde_json::Value::String(v.clone()))
                    .unwrap_or(serde_json::Value::Null);
                map.insert(col.clone(), val);
            }
            serde_json::Value::Object(map)
        })
        .collect();

    let json_str = if pretty {
        serde_json::to_string_pretty(&objects)
    } else {
        serde_json::to_string(&objects)
    }
    .map_err(|e| format!("JSON serialization error: {e}"))?;

    fs::write(path, &json_str).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(options.file_path.clone())
}

pub fn export_to_sql(
    rows: &[Vec<Option<String>>],
    columns: &[String],
    options: &ExportOptions,
) -> Result<String, String> {
    let table_name = options
        .table_name
        .as_deref()
        .ok_or("Table name is required for SQL export")?;
    let db_type = options
        .db_type
        .as_ref()
        .unwrap_or(&DatabaseType::Mysql);
    let path = Path::new(&options.file_path);

    let mut file = fs::File::create(path).map_err(|e| format!("Failed to create file: {e}"))?;

    let quoted_table = db_type.quote_identifier(table_name);
    let quoted_cols: Vec<String> = columns.iter().map(|c| db_type.quote_identifier(c)).collect();
    let cols_str = quoted_cols.join(", ");

    for row in rows {
        let values: Vec<String> = row
            .iter()
            .map(|cell| match cell {
                Some(v) => format!("'{}'", escape_string_literal(v, db_type)),
                None => "NULL".to_string(),
            })
            .collect();
        writeln!(
            file,
            "INSERT INTO {quoted_table} ({cols_str}) VALUES ({});",
            values.join(", ")
        )
        .map_err(|e| format!("Write error: {e}"))?;
    }

    Ok(options.file_path.clone())
}

fn csv_escape(value: &str, delimiter: char) -> String {
    if value.contains(delimiter) || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(test_name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tablepro_export_test_{}", test_name));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn cleanup(dir: &PathBuf) {
        let _ = fs::remove_dir_all(dir);
    }

    fn make_options(file_path: String) -> ExportOptions {
        ExportOptions {
            format: ExportFormat::Csv,
            file_path,
            table_name: None,
            include_headers: true,
            delimiter: None,
            pretty: None,
            db_type: None,
        }
    }

    // --- csv_escape tests ---

    #[test]
    fn csv_escape_plain_value() {
        assert_eq!(csv_escape("hello", ','), "hello");
    }

    #[test]
    fn csv_escape_contains_delimiter() {
        assert_eq!(csv_escape("he,llo", ','), "\"he,llo\"");
    }

    #[test]
    fn csv_escape_contains_quote() {
        assert_eq!(csv_escape("he\"llo", ','), "\"he\"\"llo\"");
    }

    #[test]
    fn csv_escape_contains_newline() {
        assert_eq!(csv_escape("he\nllo", ','), "\"he\nllo\"");
    }

    #[test]
    fn csv_escape_plain_with_semicolon_delimiter() {
        assert_eq!(csv_escape("normal", ';'), "normal");
    }

    #[test]
    fn csv_escape_contains_semicolon_delimiter() {
        assert_eq!(csv_escape("semi;colon", ';'), "\"semi;colon\"");
    }

    // --- export_to_csv tests ---

    #[test]
    fn export_csv_with_headers() {
        let dir = temp_dir("csv_headers");
        let file_path = dir.join("out.csv").to_string_lossy().to_string();
        let opts = make_options(file_path.clone());
        let columns = vec!["name".into(), "age".into()];
        let rows = vec![
            vec![Some("Alice".into()), Some("30".into())],
            vec![Some("Bob".into()), Some("25".into())],
        ];

        let result = export_to_csv(&rows, &columns, &opts);
        assert!(result.is_ok());

        let content = fs::read_to_string(&file_path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines[0], "name,age");
        assert_eq!(lines[1], "Alice,30");
        assert_eq!(lines[2], "Bob,25");

        cleanup(&dir);
    }

    #[test]
    fn export_csv_without_headers() {
        let dir = temp_dir("csv_no_headers");
        let file_path = dir.join("out.csv").to_string_lossy().to_string();
        let mut opts = make_options(file_path.clone());
        opts.include_headers = false;
        let columns = vec!["name".into(), "age".into()];
        let rows = vec![vec![Some("Alice".into()), Some("30".into())]];

        export_to_csv(&rows, &columns, &opts).unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], "Alice,30");

        cleanup(&dir);
    }

    #[test]
    fn export_csv_custom_delimiter() {
        let dir = temp_dir("csv_delim");
        let file_path = dir.join("out.csv").to_string_lossy().to_string();
        let mut opts = make_options(file_path.clone());
        opts.delimiter = Some(";".into());
        let columns = vec!["a".into(), "b".into()];
        let rows = vec![vec![Some("1".into()), Some("2".into())]];

        export_to_csv(&rows, &columns, &opts).unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines[0], "a;b");
        assert_eq!(lines[1], "1;2");

        cleanup(&dir);
    }

    // --- export_to_json tests ---

    #[test]
    fn export_json_pretty() {
        let dir = temp_dir("json_pretty");
        let file_path = dir.join("out.json").to_string_lossy().to_string();
        let mut opts = make_options(file_path.clone());
        opts.format = ExportFormat::Json;
        opts.pretty = Some(true);
        let columns = vec!["id".into(), "val".into()];
        let rows = vec![vec![Some("1".into()), Some("hello".into())]];

        export_to_json(&rows, &columns, &opts).unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        let parsed: Vec<serde_json::Value> = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0]["id"], "1");
        assert_eq!(parsed[0]["val"], "hello");
        assert!(content.contains('\n'), "pretty output should contain newlines");

        cleanup(&dir);
    }

    #[test]
    fn export_json_compact() {
        let dir = temp_dir("json_compact");
        let file_path = dir.join("out.json").to_string_lossy().to_string();
        let mut opts = make_options(file_path.clone());
        opts.format = ExportFormat::Json;
        opts.pretty = Some(false);
        let columns = vec!["id".into()];
        let rows = vec![vec![Some("1".into())]];

        export_to_json(&rows, &columns, &opts).unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(!content.contains("  "), "compact output should not be indented");
        let parsed: Vec<serde_json::Value> = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed[0]["id"], "1");

        cleanup(&dir);
    }

    // --- export_to_sql tests ---

    #[test]
    fn export_sql_mysql_inserts() {
        let dir = temp_dir("sql_mysql");
        let file_path = dir.join("out.sql").to_string_lossy().to_string();
        let mut opts = make_options(file_path.clone());
        opts.format = ExportFormat::Sql;
        opts.table_name = Some("users".into());
        opts.db_type = Some(DatabaseType::Mysql);
        let columns = vec!["name".into(), "age".into()];
        let rows = vec![vec![Some("Alice".into()), Some("30".into())]];

        export_to_sql(&rows, &columns, &opts).unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("INSERT INTO `users`"));
        assert!(content.contains("`name`, `age`"));
        assert!(content.contains("'Alice'"));
        assert!(content.contains("'30'"));

        cleanup(&dir);
    }

    #[test]
    fn export_sql_null_handling() {
        let dir = temp_dir("sql_null");
        let file_path = dir.join("out.sql").to_string_lossy().to_string();
        let mut opts = make_options(file_path.clone());
        opts.format = ExportFormat::Sql;
        opts.table_name = Some("data".into());
        opts.db_type = Some(DatabaseType::Mysql);
        let columns = vec!["a".into(), "b".into()];
        let rows = vec![vec![Some("val".into()), None]];

        export_to_sql(&rows, &columns, &opts).unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("'val'"));
        assert!(content.contains("NULL"));

        cleanup(&dir);
    }
}
