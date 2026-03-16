use std::fs::File;
use std::io::{BufReader, Read};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::models::AppError;

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
// File reading (plain + gz)
// ---------------------------------------------------------------------------

/// Read a file to a UTF-8 string. If the path ends with `.gz` the content is
/// decompressed with flate2 first.
fn read_file_to_string(path: &str) -> Result<String, AppError> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut buf = String::new();

    if path.to_lowercase().ends_with(".gz") {
        let mut decoder = flate2::read::GzDecoder::new(reader);
        decoder
            .read_to_string(&mut buf)
            .map_err(|e| AppError::IoError(format!("gz decompress failed: {e}")))?;
    } else {
        let mut reader = reader;
        reader
            .read_to_string(&mut buf)
            .map_err(|e| AppError::IoError(format!("read failed: {e}")))?;
    }

    Ok(buf)
}

// ---------------------------------------------------------------------------
// Statement scanner
// ---------------------------------------------------------------------------

/// Parse a SQL string into individual executable statements.
///
/// Correctly handles:
/// - Single-quoted strings `'...'` with `''` escape
/// - Double-quoted identifiers `"..."`
/// - Dollar-quoted strings `$$...$$` and `$tag$...$tag$` (PostgreSQL)
/// - Line comments `-- ...`
/// - Block comments `/* ... */`
/// - Semicolons only terminate statements in "normal" state
pub fn scan_statements(sql: &str) -> Vec<String> {
    #[derive(PartialEq, Clone)]
    enum State {
        Normal,
        InSingleQuote,
        InDoubleQuote,
        InDollarQuote(String), // holds the tag (e.g. "" for $$, "body" for $body$)
        InLineComment,
        InBlockComment,
    }

    let chars: Vec<char> = sql.chars().collect();
    let len = chars.len();
    let mut statements = Vec::new();
    let mut state = State::Normal;
    let mut stmt_start = 0;
    let mut i = 0;

    while i < len {
        let ch = chars[i];

        match &state {
            // ---------------------------------------------------------------
            // Line comment: continue until newline
            // ---------------------------------------------------------------
            State::InLineComment => {
                if ch == '\n' {
                    state = State::Normal;
                }
                i += 1;
            }

            // ---------------------------------------------------------------
            // Block comment: end on */
            // ---------------------------------------------------------------
            State::InBlockComment => {
                if ch == '*' && i + 1 < len && chars[i + 1] == '/' {
                    state = State::Normal;
                    i += 2;
                } else {
                    i += 1;
                }
            }

            // ---------------------------------------------------------------
            // Single-quoted string: '' is an escaped quote
            // ---------------------------------------------------------------
            State::InSingleQuote => {
                if ch == '\'' {
                    if i + 1 < len && chars[i + 1] == '\'' {
                        // Escaped quote — skip both
                        i += 2;
                    } else {
                        state = State::Normal;
                        i += 1;
                    }
                } else {
                    i += 1;
                }
            }

            // ---------------------------------------------------------------
            // Double-quoted identifier: "" is an escaped quote
            // ---------------------------------------------------------------
            State::InDoubleQuote => {
                if ch == '"' {
                    if i + 1 < len && chars[i + 1] == '"' {
                        i += 2;
                    } else {
                        state = State::Normal;
                        i += 1;
                    }
                } else {
                    i += 1;
                }
            }

            // ---------------------------------------------------------------
            // Dollar-quoted string: ends when we see the same tag again
            // ---------------------------------------------------------------
            State::InDollarQuote(tag) => {
                // Build the expected closing delimiter: $tag$
                let closing = format!("${tag}$");
                let clen = closing.chars().count();
                let slice: Option<String> =
                    chars.get(i..i + clen).map(|s| s.iter().collect::<String>());
                if slice.as_deref() == Some(&closing) {
                    state = State::Normal;
                    i += clen;
                } else {
                    i += 1;
                }
            }

            // ---------------------------------------------------------------
            // Normal state
            // ---------------------------------------------------------------
            State::Normal => {
                // Line comment
                if ch == '-' && i + 1 < len && chars[i + 1] == '-' {
                    state = State::InLineComment;
                    i += 2;
                    continue;
                }
                // Block comment
                if ch == '/' && i + 1 < len && chars[i + 1] == '*' {
                    state = State::InBlockComment;
                    i += 2;
                    continue;
                }
                // Single quote
                if ch == '\'' {
                    state = State::InSingleQuote;
                    i += 1;
                    continue;
                }
                // Double quote
                if ch == '"' {
                    state = State::InDoubleQuote;
                    i += 1;
                    continue;
                }
                // Dollar quote: $tag$ or $$
                if ch == '$' {
                    if let Some(tag) = try_read_dollar_tag(&chars, i) {
                        let tag_len = tag.chars().count() + 2; // $<tag>$
                        state = State::InDollarQuote(tag);
                        i += tag_len;
                        continue;
                    }
                }
                // Statement terminator
                if ch == ';' {
                    let stmt: String = chars[stmt_start..=i].iter().collect();
                    let trimmed = stmt.trim().trim_end_matches(';').trim().to_string();
                    if !trimmed.is_empty() {
                        statements.push(trimmed);
                    }
                    stmt_start = i + 1;
                    i += 1;
                    continue;
                }
                i += 1;
            }
        }
    }

    // Remaining text after the last semicolon (no trailing ;)
    if stmt_start < len {
        let tail: String = chars[stmt_start..].iter().collect();
        let trimmed = tail.trim().to_string();
        if !trimmed.is_empty() {
            statements.push(trimmed);
        }
    }

    statements
}

/// Try to parse a dollar-quote opening tag starting at `pos` in `chars`.
/// Returns `Some(tag)` where tag is the inner text between the two `$`.
/// Returns `None` if this isn't a valid dollar-quote opener.
fn try_read_dollar_tag(chars: &[char], pos: usize) -> Option<String> {
    // chars[pos] == '$' is guaranteed by caller
    let len = chars.len();
    let mut j = pos + 1;
    while j < len && chars[j] != '$' {
        let c = chars[j];
        // Dollar-quote tag can only contain letters, digits, underscores
        if !c.is_alphanumeric() && c != '_' {
            return None;
        }
        j += 1;
    }
    if j >= len {
        return None; // No closing $ found on same line
    }
    // chars[j] == '$'
    let tag: String = chars[pos + 1..j].iter().collect();
    Some(tag)
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/// Return a preview of the SQL file: statement count, file size, first statements.
pub fn preview(path: &str) -> Result<ImportPreview, AppError> {
    let metadata = std::fs::metadata(path)?;
    let file_size_bytes = metadata.len();

    let sql = read_file_to_string(path)?;
    let statements = scan_statements(&sql);
    let statement_count = statements.len();

    const MAX_PREVIEW_STMTS: usize = 50;
    const MAX_STMT_CHARS: usize = 200;

    let first_statements = statements
        .into_iter()
        .take(MAX_PREVIEW_STMTS)
        .map(|s| {
            if s.len() > MAX_STMT_CHARS {
                format!("{}…", &s[..MAX_STMT_CHARS])
            } else {
                s
            }
        })
        .collect();

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
    let sql = read_file_to_string(path)?;
    let statements = scan_statements(&sql);
    let total = statements.len();

    if total == 0 {
        return Ok(ImportResult {
            statements_executed: 0,
            duration_ms: 0,
        });
    }

    if options.wrap_in_transaction {
        driver.execute("BEGIN").await?;
    }

    let mut executed = 0usize;
    let mut exec_error: Option<AppError> = None;

    for stmt in &statements {
        match driver.execute(stmt).await {
            Ok(_) => {
                executed += 1;
                on_progress(executed, total);
            }
            Err(e) => {
                exec_error = Some(e);
                break;
            }
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
}
