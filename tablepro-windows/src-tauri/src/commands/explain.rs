use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::drivers::DatabaseDriver;
use crate::services::ConnectionManager;

// ── Result models ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainResult {
    /// "json" | "xml" | "table"
    pub format: String,
    /// Raw output from the engine (JSON string, XML string, or tabular text).
    pub raw: String,
    /// Parsed plan tree (best-effort — empty if parsing fails).
    pub nodes: Vec<ExplainNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainNode {
    pub operation: String,
    pub detail: String,
    pub cost: Option<f64>,
    pub rows: Option<i64>,
    pub children: Vec<ExplainNode>,
}

// ── SQL validation ───────────────────────────────────────────────────────────

/// DDL / DML keywords that EXPLAIN must never wrap.
const FORBIDDEN_KEYWORDS: &[&str] = &[
    "DROP", "ALTER", "CREATE", "TRUNCATE", "INSERT", "UPDATE", "DELETE",
    "GRANT", "REVOKE",
];

/// Strip content inside string literals (single-quoted) so that semicolons or
/// keywords embedded in literal values do not trigger false positives.
fn strip_string_literals(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    let mut in_single = false;
    let mut chars = sql.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\'' {
            if in_single {
                // Check for escaped quote ''
                if chars.peek() == Some(&'\'') {
                    chars.next();
                    continue;
                }
                in_single = false;
            } else {
                in_single = true;
            }
            continue;
        }
        if !in_single {
            out.push(ch);
        }
    }
    out
}

/// Validate that `sql` is a single, read-only statement suitable for EXPLAIN.
fn validate_explain_input(sql: &str) -> Result<(), AppError> {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err(AppError::DatabaseError(
            "Empty query cannot be explained".to_string(),
        ));
    }

    let stripped = strip_string_literals(trimmed);

    // Reject multiple statements (semicolons outside string literals).
    if stripped.contains(';') {
        return Err(AppError::DatabaseError(
            "EXPLAIN only supports a single statement".to_string(),
        ));
    }

    // Reject forbidden DDL/DML keywords (word-boundary match).
    let upper = stripped.to_uppercase();
    for kw in FORBIDDEN_KEYWORDS {
        if is_keyword_present(&upper, kw) {
            return Err(AppError::DatabaseError(format!(
                "EXPLAIN does not support {kw} statements"
            )));
        }
    }

    Ok(())
}

/// Check if `keyword` appears as a standalone word in `haystack`.
fn is_keyword_present(haystack: &str, keyword: &str) -> bool {
    let kw_with_space = format!("{keyword} ");
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(&kw_with_space) {
        let abs_pos = start + pos;
        if abs_pos == 0 || !haystack.as_bytes()[abs_pos - 1].is_ascii_alphanumeric() {
            return true;
        }
        start = abs_pos + 1;
    }
    false
}

// ── Engine-specific EXPLAIN execution ────────────────────────────────────────

async fn explain_postgres(
    driver: &Arc<dyn DatabaseDriver>,
    sql: &str,
) -> Result<ExplainResult, AppError> {
    let explain_sql = format!("EXPLAIN (FORMAT JSON) {sql}");
    let result = driver.execute(&explain_sql).await?;

    // PostgreSQL returns the JSON plan in the first column of the first row.
    let raw = result
        .rows
        .iter()
        .filter_map(|row| row.first().and_then(|v| v.as_deref()))
        .collect::<Vec<_>>()
        .join("\n");

    let nodes = parse_postgres_plan(&raw);

    Ok(ExplainResult {
        format: "json".to_string(),
        raw,
        nodes,
    })
}

async fn explain_mysql(
    driver: &Arc<dyn DatabaseDriver>,
    sql: &str,
) -> Result<ExplainResult, AppError> {
    let explain_sql = format!("EXPLAIN FORMAT=JSON {sql}");
    let result = driver.execute(&explain_sql).await?;

    let raw = result
        .rows
        .first()
        .and_then(|row| row.first().and_then(|v| v.as_deref()))
        .unwrap_or("")
        .to_string();

    let nodes = parse_mysql_plan(&raw);

    Ok(ExplainResult {
        format: "json".to_string(),
        raw,
        nodes,
    })
}

/// MSSQL EXPLAIN using a dedicated short-lived connection.
async fn explain_mssql_impl(
    sql: &str,
    config: &crate::models::ConnectionConfig,
    driver_registry: &Arc<crate::drivers::DriverRegistry>,
) -> Result<ExplainResult, AppError> {
    let temp_driver: Arc<dyn DatabaseDriver> =
        Arc::from(driver_registry.create_driver(&config.db_type, config)?);
    temp_driver.connect().await?;

    // Execute with guaranteed cleanup of SHOWPLAN_XML.
    let plan_result = async {
        temp_driver.execute("SET SHOWPLAN_XML ON").await?;
        let result = temp_driver.execute(sql).await;
        // Best-effort cleanup — must always attempt OFF.
        let _ = temp_driver.execute("SET SHOWPLAN_XML OFF").await;
        result
    }
    .await;

    temp_driver.disconnect();

    let result = plan_result?;

    let raw = result
        .rows
        .first()
        .and_then(|row| row.first().and_then(|v| v.as_deref()))
        .unwrap_or("")
        .to_string();

    let nodes = parse_mssql_xml_plan(&raw);

    Ok(ExplainResult {
        format: "xml".to_string(),
        raw,
        nodes,
    })
}

async fn explain_sqlite(
    driver: &Arc<dyn DatabaseDriver>,
    sql: &str,
) -> Result<ExplainResult, AppError> {
    let explain_sql = format!("EXPLAIN QUERY PLAN {sql}");
    let result = driver.execute(&explain_sql).await?;

    // SQLite EXPLAIN QUERY PLAN returns tabular output:
    // columns: id, parent, notused, detail
    let mut lines = Vec::new();
    for row in &result.rows {
        let detail = row
            .get(3)
            .and_then(|v| v.as_deref())
            .unwrap_or("");
        lines.push(detail.to_string());
    }
    let raw = lines.join("\n");

    let nodes = parse_sqlite_plan(&result.rows);

    Ok(ExplainResult {
        format: "table".to_string(),
        raw,
        nodes,
    })
}

// ── Plan parsers ─────────────────────────────────────────────────────────────

fn parse_postgres_plan(raw: &str) -> Vec<ExplainNode> {
    // PostgreSQL EXPLAIN (FORMAT JSON) returns an array with a single object
    // containing a "Plan" key.
    let parsed: Result<Vec<serde_json::Value>, _> = serde_json::from_str(raw);
    let Ok(arr) = parsed else {
        return vec![];
    };
    let Some(plan_obj) = arr.first().and_then(|v| v.get("Plan")) else {
        return vec![];
    };
    vec![pg_node_from_json(plan_obj)]
}

fn pg_node_from_json(val: &serde_json::Value) -> ExplainNode {
    let operation = val
        .get("Node Type")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();

    let mut details = Vec::new();
    if let Some(rel) = val.get("Relation Name").and_then(|v| v.as_str()) {
        details.push(format!("on {rel}"));
    }
    if let Some(idx) = val.get("Index Name").and_then(|v| v.as_str()) {
        details.push(format!("using {idx}"));
    }
    if let Some(filter) = val.get("Filter").and_then(|v| v.as_str()) {
        details.push(format!("filter: {filter}"));
    }
    if let Some(join_type) = val.get("Join Type").and_then(|v| v.as_str()) {
        details.push(format!("join: {join_type}"));
    }
    let detail = details.join(", ");

    let cost = val
        .get("Total Cost")
        .and_then(|v| v.as_f64());
    let rows = val
        .get("Plan Rows")
        .and_then(|v| v.as_i64());

    let children = val
        .get("Plans")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(pg_node_from_json).collect())
        .unwrap_or_default();

    ExplainNode {
        operation,
        detail,
        cost,
        rows,
        children,
    }
}

fn parse_mysql_plan(raw: &str) -> Vec<ExplainNode> {
    // MySQL EXPLAIN FORMAT=JSON returns {"query_block": {...}}
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(raw);
    let Ok(val) = parsed else {
        return vec![];
    };
    let Some(qb) = val.get("query_block") else {
        return vec![];
    };
    vec![mysql_node_from_json(qb)]
}

fn mysql_node_from_json(val: &serde_json::Value) -> ExplainNode {
    // MySQL JSON explain has varying structure. Extract what we can.
    let mut operation = "query_block".to_string();
    let mut detail = String::new();
    let mut cost: Option<f64> = None;
    let mut rows: Option<i64> = None;
    let mut children = Vec::new();

    if let Some(table_obj) = val.get("table") {
        operation = table_obj
            .get("access_type")
            .and_then(|v| v.as_str())
            .unwrap_or("table_scan")
            .to_string();
        if let Some(name) = table_obj.get("table_name").and_then(|v| v.as_str()) {
            detail = format!("on {name}");
        }
        cost = table_obj
            .get("cost_info")
            .and_then(|ci| ci.get("read_cost"))
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok());
        rows = table_obj
            .get("rows_examined_per_scan")
            .and_then(|v| v.as_i64());
    }

    if let Some(cost_info) = val.get("cost_info") {
        if cost.is_none() {
            cost = cost_info
                .get("query_cost")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<f64>().ok());
        }
    }

    // Nested tables in ordering_operation, grouping_operation, etc.
    for key in &[
        "ordering_operation",
        "grouping_operation",
        "duplicates_removal",
        "nested_loop",
    ] {
        if let Some(nested) = val.get(*key) {
            if let Some(arr) = nested.as_array() {
                for item in arr {
                    children.push(mysql_node_from_json(item));
                }
            } else {
                children.push(mysql_node_from_json(nested));
            }
        }
    }

    ExplainNode {
        operation,
        detail,
        cost,
        rows,
        children,
    }
}

fn parse_mssql_xml_plan(raw: &str) -> Vec<ExplainNode> {
    // Best-effort extraction from SHOWPLAN_XML. Full XML parsing would need
    // a dependency; we extract top-level operation info with simple string search.
    if raw.is_empty() {
        return vec![];
    }
    vec![ExplainNode {
        operation: "ShowPlanXML".to_string(),
        detail: "See raw XML for full plan".to_string(),
        cost: extract_xml_attr(raw, "EstimatedTotalSubtreeCost"),
        rows: extract_xml_attr(raw, "EstimateRows").map(|v| v as i64),
        children: vec![],
    }]
}

/// Extract a numeric attribute value from XML by name (best-effort, no XML parser).
fn extract_xml_attr(xml: &str, attr_name: &str) -> Option<f64> {
    let pattern = format!("{attr_name}=\"");
    let start = xml.find(&pattern)?;
    let value_start = start + pattern.len();
    let rest = &xml[value_start..];
    let end = rest.find('"')?;
    rest[..end].parse::<f64>().ok()
}

fn parse_sqlite_plan(rows: &[Vec<Option<String>>]) -> Vec<ExplainNode> {
    // SQLite EXPLAIN QUERY PLAN: columns are (id, parent, notused, detail)
    // Build flat list — parent references form the tree.
    struct RawNode {
        id: i64,
        parent: i64,
        detail: String,
    }

    let mut raw_nodes: Vec<RawNode> = Vec::new();
    for row in rows {
        let id = row
            .first()
            .and_then(|v| v.as_deref())
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let parent = row
            .get(1)
            .and_then(|v| v.as_deref())
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let detail = row
            .get(3)
            .and_then(|v| v.as_deref())
            .unwrap_or("")
            .to_string();
        raw_nodes.push(RawNode { id, parent, detail });
    }

    fn build_tree(nodes: &[RawNode], parent_id: i64) -> Vec<ExplainNode> {
        nodes
            .iter()
            .filter(|n| n.parent == parent_id && n.id != parent_id)
            .map(|n| ExplainNode {
                operation: n.detail.clone(),
                detail: String::new(),
                cost: None,
                rows: None,
                children: build_tree(nodes, n.id),
            })
            .collect()
    }

    // Root nodes have parent == 0 typically
    let roots = build_tree(&raw_nodes, 0);
    if roots.is_empty() {
        // Fallback: return all nodes flat
        raw_nodes
            .iter()
            .map(|n| ExplainNode {
                operation: n.detail.clone(),
                detail: String::new(),
                cost: None,
                rows: None,
                children: vec![],
            })
            .collect()
    } else {
        roots
    }
}

// ── Tauri command ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn explain_query(
    session_id: String,
    sql: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<ExplainResult, AppError> {
    validate_explain_input(&sql)?;

    let (driver, db_type, config) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id)?.clone();
        let db_type = config.db_type.clone();
        (driver, db_type, config)
    };

    tracing::info!(session_id = %session_id, db_type = %db_type, "explain_query");

    match db_type.as_str() {
        "postgresql" | "postgres" => explain_postgres(&driver, &sql).await,
        "mysql" | "mariadb" => explain_mysql(&driver, &sql).await,
        "mssql" | "sqlserver" => {
            let driver_registry = {
                let mgr = manager.lock().await;
                mgr.driver_registry()
            };
            explain_mssql_impl(&sql, &config, &driver_registry).await
        }
        "sqlite" => explain_sqlite(&driver, &sql).await,
        _ => Ok(ExplainResult {
            format: "table".to_string(),
            raw: format!("EXPLAIN is not supported for {db_type} connections"),
            nodes: vec![],
        }),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Validation tests ─────────────────────────────────────────────────

    #[test]
    fn test_validate_empty_query() {
        assert!(validate_explain_input("").is_err());
        assert!(validate_explain_input("   ").is_err());
    }

    #[test]
    fn test_validate_simple_select() {
        assert!(validate_explain_input("SELECT * FROM users").is_ok());
        assert!(validate_explain_input("SELECT id, name FROM orders WHERE id = 1").is_ok());
    }

    #[test]
    fn test_validate_reject_multiple_statements() {
        assert!(validate_explain_input("SELECT 1; SELECT 2").is_err());
        assert!(validate_explain_input("SELECT 1; DROP TABLE users").is_err());
    }

    #[test]
    fn test_validate_semicolon_in_string_literal() {
        // Semicolons inside string literals should be stripped, so this is safe.
        assert!(validate_explain_input("SELECT * FROM t WHERE name = 'a;b'").is_ok());
    }

    #[test]
    fn test_validate_reject_ddl_keywords() {
        assert!(validate_explain_input("DROP TABLE users").is_err());
        assert!(validate_explain_input("ALTER TABLE users ADD COLUMN x INT").is_err());
        assert!(validate_explain_input("CREATE TABLE t (id INT)").is_err());
        assert!(validate_explain_input("TRUNCATE TABLE users").is_err());
        assert!(validate_explain_input("INSERT INTO users VALUES (1)").is_err());
        assert!(validate_explain_input("UPDATE users SET name = 'x'").is_err());
        assert!(validate_explain_input("DELETE FROM users").is_err());
        assert!(validate_explain_input("GRANT SELECT ON users TO role").is_err());
        assert!(validate_explain_input("REVOKE SELECT ON users FROM role").is_err());
    }

    #[test]
    fn test_validate_keyword_in_column_name() {
        // Column names containing keywords should not trigger rejection.
        assert!(validate_explain_input("SELECT drop_reason FROM logs").is_ok());
        assert!(validate_explain_input("SELECT deleted_at FROM records").is_ok());
        assert!(validate_explain_input("SELECT create_date FROM events").is_ok());
    }

    #[test]
    fn test_validate_keyword_case_insensitive() {
        assert!(validate_explain_input("drop table users").is_err());
        assert!(validate_explain_input("Delete from users").is_err());
    }

    // ── String literal stripping ─────────────────────────────────────────

    #[test]
    fn test_strip_string_literals() {
        assert_eq!(
            strip_string_literals("SELECT * WHERE x = 'hello'"),
            "SELECT * WHERE x = "
        );
        assert_eq!(
            strip_string_literals("SELECT * WHERE x = 'a;b' AND y = 1"),
            "SELECT * WHERE x =  AND y = 1"
        );
    }

    #[test]
    fn test_strip_escaped_quotes() {
        // Escaped single quotes ('') inside a string literal
        assert_eq!(
            strip_string_literals("SELECT * WHERE x = 'it''s'"),
            "SELECT * WHERE x = "
        );
    }

    // ── Parser tests ─────────────────────────────────────────────────────

    #[test]
    fn test_parse_postgres_plan() {
        let raw = r#"[{"Plan": {"Node Type": "Seq Scan", "Relation Name": "users", "Total Cost": 10.5, "Plan Rows": 100}}]"#;
        let nodes = parse_postgres_plan(raw);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].operation, "Seq Scan");
        assert!(nodes[0].detail.contains("users"));
        assert_eq!(nodes[0].cost, Some(10.5));
        assert_eq!(nodes[0].rows, Some(100));
    }

    #[test]
    fn test_parse_postgres_plan_with_children() {
        let raw = r#"[{"Plan": {"Node Type": "Hash Join", "Join Type": "Inner", "Total Cost": 50.0, "Plan Rows": 200, "Plans": [{"Node Type": "Seq Scan", "Relation Name": "orders", "Total Cost": 20.0, "Plan Rows": 50}, {"Node Type": "Hash", "Total Cost": 10.0, "Plan Rows": 100}]}}]"#;
        let nodes = parse_postgres_plan(raw);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].operation, "Hash Join");
        assert_eq!(nodes[0].children.len(), 2);
        assert_eq!(nodes[0].children[0].operation, "Seq Scan");
    }

    #[test]
    fn test_parse_postgres_plan_invalid_json() {
        let nodes = parse_postgres_plan("not json");
        assert!(nodes.is_empty());
    }

    #[test]
    fn test_parse_mysql_plan() {
        let raw = r#"{"query_block": {"cost_info": {"query_cost": "1.20"}, "table": {"table_name": "users", "access_type": "ALL", "rows_examined_per_scan": 100}}}"#;
        let nodes = parse_mysql_plan(raw);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].operation, "ALL");
        assert!(nodes[0].detail.contains("users"));
        assert_eq!(nodes[0].rows, Some(100));
    }

    #[test]
    fn test_parse_mysql_plan_invalid_json() {
        let nodes = parse_mysql_plan("bad json");
        assert!(nodes.is_empty());
    }

    #[test]
    fn test_parse_mssql_xml_plan() {
        let xml = r#"<ShowPlanXML EstimatedTotalSubtreeCost="0.123" EstimateRows="42.0"/>"#;
        let nodes = parse_mssql_xml_plan(xml);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].cost, Some(0.123));
        assert_eq!(nodes[0].rows, Some(42));
    }

    #[test]
    fn test_parse_mssql_xml_plan_empty() {
        let nodes = parse_mssql_xml_plan("");
        assert!(nodes.is_empty());
    }

    #[test]
    fn test_parse_sqlite_plan() {
        let rows = vec![
            vec![
                Some("2".to_string()),
                Some("0".to_string()),
                Some("0".to_string()),
                Some("SCAN users".to_string()),
            ],
            vec![
                Some("3".to_string()),
                Some("0".to_string()),
                Some("0".to_string()),
                Some("SEARCH orders USING INDEX idx_user_id".to_string()),
            ],
        ];
        let nodes = parse_sqlite_plan(&rows);
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].operation, "SCAN users");
    }

    #[test]
    fn test_extract_xml_attr() {
        let xml = r#"<Foo Cost="12.34" Rows="56"/>"#;
        assert_eq!(extract_xml_attr(xml, "Cost"), Some(12.34));
        assert_eq!(extract_xml_attr(xml, "Rows"), Some(56.0));
        assert_eq!(extract_xml_attr(xml, "Missing"), None);
    }
}
