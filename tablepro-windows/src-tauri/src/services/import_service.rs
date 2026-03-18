use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::models::AppError;

// Re-export parser functions for external callers
pub use super::import_parser::scan_statements;

// Use streaming helpers from import_streamer module
pub(crate) use super::import_streamer::stream_statements_buffered;
use super::import_streamer::count_statements_buffered;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub statement_count: usize,
    pub file_size_bytes: u64,
    pub first_statements: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub statements_executed: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    pub wrap_in_transaction: bool,
    pub disable_fk_checks: bool,
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/// Return a preview of the SQL file: statement count, file size, first statements.
pub fn preview(path: &str) -> Result<ImportPreview, AppError> {
    let metadata = std::fs::metadata(path)?;
    let file_size_bytes = metadata.len();

    const MAX_PREVIEW_STMTS: usize = 50;
    const MAX_STMT_CHARS: usize = 200;

    let mut statement_count = 0usize;
    let mut first_statements = Vec::with_capacity(MAX_PREVIEW_STMTS);

    stream_statements_buffered(path, |stmt| {
        statement_count += 1;

        if first_statements.len() < MAX_PREVIEW_STMTS {
            if stmt.len() > MAX_STMT_CHARS {
                first_statements.push(format!("{}…", &stmt[..MAX_STMT_CHARS]));
            } else {
                first_statements.push(stmt);
            }
        }

        Ok(())
    })?;

    Ok(ImportPreview {
        statement_count,
        file_size_bytes,
        first_statements,
    })
}

/// Execute all statements in the SQL file, emitting progress via `on_progress`.
pub async fn execute<F>(
    path: &str,
    options: &ImportOptions,
    driver: &dyn crate::plugin::DatabaseDriver,
    mut on_progress: F,
) -> Result<ImportResult, AppError>
where
    F: FnMut(usize, usize),
{
    let start = Instant::now();
    let path_owned = path.to_string();

    let total = tokio::task::spawn_blocking(move || count_statements_buffered(&path_owned))
        .await
        .map_err(|e| AppError::IoError(format!("Import count task join error: {e}")))?
        ?;

    if total == 0 {
        return Ok(ImportResult {
            statements_executed: 0,
            duration_ms: 0,
        });
    }

    if options.wrap_in_transaction {
        driver.execute("BEGIN").await?;
    }

    let (tx, mut rx) = tokio::sync::mpsc::channel::<Result<String, AppError>>(64);
    let path_for_stream = path.to_string();

    let producer = tokio::task::spawn_blocking(move || {
        let streaming_result = stream_statements_buffered(&path_for_stream, |stmt| {
            tx.blocking_send(Ok(stmt))
                .map_err(|_| AppError::IoError("Import streaming channel closed".to_string()))
        });

        if let Err(err) = streaming_result {
            let _ = tx.blocking_send(Err(err));
        }
    });

    let mut executed = 0usize;
    let mut exec_error: Option<AppError> = None;

    while let Some(next) = rx.recv().await {
        let stmt = match next {
            Ok(stmt) => stmt,
            Err(err) => {
                exec_error = Some(err);
                break;
            }
        };

        match driver.execute(&stmt).await {
            Ok(_) => {
                executed += 1;
                on_progress(executed, total);
            }
            Err(err) => {
                exec_error = Some(err);
                break;
            }
        }
    }

    drop(rx);

    if let Err(join_err) = producer.await {
        if exec_error.is_none() {
            exec_error = Some(AppError::IoError(format!(
                "Import streaming task join error: {join_err}"
            )));
        }
    }

    if let Some(err) = exec_error {
        if options.wrap_in_transaction {
            let _ = driver.execute("ROLLBACK").await;
        }
        return Err(err);
    }

    if options.wrap_in_transaction {
        driver.execute("COMMIT").await?;
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    tracing::info!(
        path = %path,
        statements = executed,
        duration_ms = duration_ms,
        "import_sql_file complete"
    );

    Ok(ImportResult {
        statements_executed: executed,
        duration_ms,
    })
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn stmts(sql: &str) -> Vec<String> {
        scan_statements(sql)
    }

    // -------------------------------------------------------------------------
    // Basic cases
    // -------------------------------------------------------------------------

    #[test]
    fn test_empty_input() {
        assert_eq!(stmts(""), Vec::<String>::new());
    }

    #[test]
    fn test_whitespace_only() {
        assert_eq!(stmts("   \n\t  "), Vec::<String>::new());
    }

    #[test]
    fn test_single_statement_with_semicolon() {
        assert_eq!(stmts("SELECT 1;"), vec!["SELECT 1"]);
    }

    #[test]
    fn test_single_statement_no_trailing_semicolon() {
        assert_eq!(stmts("SELECT 1"), vec!["SELECT 1"]);
    }

    #[test]
    fn test_multiple_statements() {
        let sql = "SELECT 1; SELECT 2; SELECT 3;";
        assert_eq!(stmts(sql), vec!["SELECT 1", "SELECT 2", "SELECT 3"]);
    }

    #[test]
    fn test_multiple_statements_with_newlines() {
        let sql = "INSERT INTO t VALUES (1);\nINSERT INTO t VALUES (2);\n";
        assert_eq!(
            stmts(sql),
            vec!["INSERT INTO t VALUES (1)", "INSERT INTO t VALUES (2)"]
        );
    }

    // -------------------------------------------------------------------------
    // Strings with semicolons — must NOT split inside strings
    // -------------------------------------------------------------------------

    #[test]
    fn test_single_quoted_string_with_semicolon() {
        let sql = "INSERT INTO t VALUES ('hello; world');";
        assert_eq!(stmts(sql), vec!["INSERT INTO t VALUES ('hello; world')"]);
    }

    #[test]
    fn test_double_quoted_identifier_with_semicolon() {
        let sql = r#"SELECT "col;name" FROM t;"#;
        assert_eq!(stmts(sql), vec![r#"SELECT "col;name" FROM t"#]);
    }

    #[test]
    fn test_escaped_single_quote_in_string() {
        let sql = "INSERT INTO t VALUES ('it''s fine; really');";
        assert_eq!(
            stmts(sql),
            vec!["INSERT INTO t VALUES ('it''s fine; really')"]
        );
    }

    #[test]
    fn test_two_statements_with_quoted_semicolons() {
        let sql = "SELECT 'a;b'; SELECT 'c;d';";
        assert_eq!(stmts(sql), vec!["SELECT 'a;b'", "SELECT 'c;d'"]);
    }

    // -------------------------------------------------------------------------
    // Dollar-quoted blocks (PostgreSQL)
    // -------------------------------------------------------------------------

    #[test]
    fn test_dollar_quoted_plain() {
        let sql = "SELECT $$ hello; world $$;";
        assert_eq!(stmts(sql), vec!["SELECT $$ hello; world $$"]);
    }

    #[test]
    fn test_dollar_quoted_with_tag() {
        let sql =
            "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN NULL; END $body$ LANGUAGE plpgsql;";
        let result = stmts(sql);
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("$body$"));
        assert!(result[0].contains("BEGIN NULL; END $body$"));
    }

    #[test]
    fn test_multiple_dollar_quoted_statements() {
        let sql = "DO $$ BEGIN RAISE NOTICE 'hi;'; END $$; SELECT 1;";
        let result = stmts(sql);
        assert_eq!(result.len(), 2);
        assert!(result[0].starts_with("DO $$"));
        assert_eq!(result[1], "SELECT 1");
    }

    // -------------------------------------------------------------------------
    // Line comments
    // -------------------------------------------------------------------------

    #[test]
    fn test_line_comment_before_statement() {
        let sql = "-- this is a comment\nSELECT 1;";
        let result = stmts(sql);
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("SELECT 1"));
    }

    #[test]
    fn test_line_comment_with_semicolon_does_not_split() {
        let sql = "SELECT 1; -- semicolon; here\nSELECT 2;";
        let result = stmts(sql);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "SELECT 1");
        assert!(result[1].contains("SELECT 2"));
    }

    #[test]
    fn test_inline_comment_does_not_split() {
        let sql = "SELECT -- inline; comment\n1;";
        let result = stmts(sql);
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("SELECT"));
    }

    // -------------------------------------------------------------------------
    // Block comments
    // -------------------------------------------------------------------------

    #[test]
    fn test_block_comment_ignored() {
        let sql = "/* header comment */ SELECT 1;";
        let result = stmts(sql);
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("SELECT 1"));
    }

    #[test]
    fn test_block_comment_with_semicolons_inside() {
        let sql = "/* stmt1; stmt2; */ SELECT 1;";
        let result = stmts(sql);
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("SELECT 1"));
    }

    #[test]
    fn test_block_comment_multiline() {
        let sql = "/*\n  multi;\n  line;\n*/\nSELECT 1;";
        let result = stmts(sql);
        assert_eq!(result.len(), 1);
        assert!(result[0].contains("SELECT 1"));
    }

    // -------------------------------------------------------------------------
    // Empty statements — filtered out
    // -------------------------------------------------------------------------

    #[test]
    fn test_empty_statements_skipped() {
        let sql = ";;;  ;  SELECT 1;  ;  ;";
        assert_eq!(stmts(sql), vec!["SELECT 1"]);
    }

    // -------------------------------------------------------------------------
    // Mixed / realistic cases
    // -------------------------------------------------------------------------

    #[test]
    fn test_create_and_insert() {
        let sql = r#"
CREATE TABLE users (id INT, name TEXT);
INSERT INTO users VALUES (1, 'Alice; B.');
INSERT INTO users VALUES (2, 'Bob');
"#;
        let result = stmts(sql);
        assert_eq!(result.len(), 3);
        assert!(result[0].starts_with("CREATE TABLE"));
        assert!(result[1].contains("Alice; B."));
        assert!(result[2].contains("Bob"));
    }

    #[test]
    fn test_sql_dump_style() {
        let sql = r#"-- Dump from pg_dump
/* Generated: 2024-01-01 */
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    note TEXT DEFAULT 'pending; review'
);
INSERT INTO orders (note) VALUES ('hello');
"#;
        let result = stmts(sql);
        assert_eq!(result.len(), 2, "Got: {result:?}");
        assert!(result[0].contains("CREATE TABLE orders"));
        assert!(result[1].contains("INSERT INTO orders"));
    }

    #[test]
    fn test_no_trailing_semicolon_last_statement_captured() {
        let sql = "SELECT 1;\nSELECT 2";
        let result = stmts(sql);
        assert_eq!(result, vec!["SELECT 1", "SELECT 2"]);
    }

    fn temp_file_path(ext: &str) -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        std::env::temp_dir().join(format!("tablepro-import-test-{now}.{ext}"))
    }

    #[test]
    fn test_stream_statements_buffered_matches_scan_statements() {
        let sql = "SELECT 1;\nINSERT INTO t VALUES ('a;b');\n-- comment\nSELECT 3";
        let path = temp_file_path("sql");
        fs::write(&path, sql).expect("write temp sql");

        let mut streamed = Vec::new();
        stream_statements_buffered(path.to_string_lossy().as_ref(), |stmt| {
            streamed.push(stmt);
            Ok(())
        })
        .expect("stream statements");

        let scanned = scan_statements(sql);
        assert_eq!(streamed, scanned);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn test_preview_uses_buffered_parser_for_plain_file() {
        let sql = "SELECT 1;\nSELECT 2;\nSELECT 3;";
        let path = temp_file_path("sql");
        fs::write(&path, sql).expect("write temp sql");

        let preview = preview(path.to_string_lossy().as_ref()).expect("preview ok");

        assert_eq!(preview.statement_count, 3);
        assert_eq!(preview.first_statements, vec!["SELECT 1", "SELECT 2", "SELECT 3"]);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn test_preview_reads_gzip_file() {
        use std::fs::File;
        let sql = "SELECT 1;\nSELECT 2;";
        let path = temp_file_path("sql.gz");

        let file = File::create(&path).expect("create gz file");
        let mut encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        encoder.write_all(sql.as_bytes()).expect("write gzip content");
        encoder.finish().expect("finish gzip");

        let preview = preview(path.to_string_lossy().as_ref()).expect("preview ok");

        assert_eq!(preview.statement_count, 2);
        assert_eq!(preview.first_statements, vec!["SELECT 1", "SELECT 2"]);

        let _ = fs::remove_file(path);
    }
}
