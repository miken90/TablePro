//! Deciding how an export may read a user-supplied query.
//!
//! A small result is read in one execution and held in memory. A large one has
//! to be read in chunks, and chunking is only safe when the query itself
//! defines the row order: without a top-level `ORDER BY`, PostgreSQL and MySQL
//! may return rows in a different order for each execution, so consecutive
//! pages repeat some rows and skip others.
//!
//! The pagination tail is appended to the user's statement rather than wrapping
//! it as `SELECT * FROM (…) AS t LIMIT …`. A derived table is the more obvious
//! shape, but MySQL is documented to discard `ORDER BY` inside one, which would
//! silently give back the unordered paging this module exists to prevent.

/// What a statement already carries at its top level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct QueryShape {
    /// A top-level `ORDER BY` — the query defines its own row order.
    pub has_order_by: bool,
    /// A top-level `LIMIT`/`OFFSET`/`FETCH` — a pagination tail cannot be
    /// appended without producing a syntax error.
    pub has_row_limit: bool,
}

/// Scan `sql` for top-level `ORDER BY` and row-limiting clauses.
///
/// Depth-aware: clauses inside parentheses belong to a subquery or CTE and say
/// nothing about the order of the outer result. String literals, quoted
/// identifiers (`"…"`, `` `…` ``, `[…]`) and comments are skipped so their
/// contents cannot be mistaken for keywords.
pub fn inspect_query(sql: &str) -> QueryShape {
    let bytes = sql.as_bytes();
    let mut depth: i32 = 0;
    let mut i = 0;
    let mut shape = QueryShape {
        has_order_by: false,
        has_row_limit: false,
    };

    while i < bytes.len() {
        let c = bytes[i];
        match c {
            b'\'' | b'"' | b'`' => {
                i = skip_quoted(bytes, i, c);
                continue;
            }
            b'[' => {
                // SQL Server quoted identifier. Brackets never nest.
                i = skip_quoted(bytes, i, b']');
                continue;
            }
            b'-' if bytes.get(i + 1) == Some(&b'-') => {
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            b'/' if bytes.get(i + 1) == Some(&b'*') => {
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                i = (i + 2).min(bytes.len());
                continue;
            }
            b'(' => {
                depth += 1;
                i += 1;
                continue;
            }
            b')' => {
                depth -= 1;
                i += 1;
                continue;
            }
            _ => {}
        }

        if depth == 0 && is_word_start(bytes, i) {
            let word_end = word_end(bytes, i);
            let word = &sql[i..word_end];
            if word.eq_ignore_ascii_case("order") && next_word_is(sql, bytes, word_end, "by") {
                shape.has_order_by = true;
            } else if word.eq_ignore_ascii_case("limit")
                || word.eq_ignore_ascii_case("offset")
                || word.eq_ignore_ascii_case("fetch")
            {
                shape.has_row_limit = true;
            }
            i = word_end;
            continue;
        }

        i += 1;
    }

    shape
}

/// What an export does after its first read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportRead {
    /// Everything fits under the limit: the rows already read are the export.
    WholeResult,
    /// Larger than the limit, and the query orders its own rows, so the
    /// remaining pages can be read in the same order.
    ContinueInChunks,
    /// Larger than the limit with no top-level `ORDER BY`: chunking would
    /// repeat and skip rows, so the export is refused.
    NeedsOrdering,
}

/// Decide how to continue after reading `rows_read` rows with a `limit + 1`
/// probe. Reading one row past the limit is what distinguishes "fits" from
/// "too large" without a separate count query.
pub fn plan_export_read(rows_read: u64, limit: u64, has_order_by: bool) -> ExportRead {
    if rows_read <= limit {
        ExportRead::WholeResult
    } else if has_order_by {
        ExportRead::ContinueInChunks
    } else {
        ExportRead::NeedsOrdering
    }
}

/// Append a `LIMIT`/`OFFSET` tail to the user's statement.
///
/// The caller has already established that the statement carries no
/// row-limiting clause of its own and that the dialect pages this way.
pub fn append_page(sql: &str, limit: u64, offset: u64) -> String {
    format!("{} LIMIT {limit} OFFSET {offset}", sql.trim_end().trim_end_matches(';'))
}

fn is_word_start(bytes: &[u8], i: usize) -> bool {
    let is_ident = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    is_ident(bytes[i]) && (i == 0 || !is_ident(bytes[i - 1]))
}

fn word_end(bytes: &[u8], start: usize) -> usize {
    let mut end = start;
    while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_') {
        end += 1;
    }
    end
}

/// Is the next word after `from` exactly `expected` (case-insensitive)?
fn next_word_is(sql: &str, bytes: &[u8], from: usize, expected: &str) -> bool {
    let mut i = from;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() {
        return false;
    }
    let end = word_end(bytes, i);
    end > i && sql[i..end].eq_ignore_ascii_case(expected)
}

/// Skip a quoted run starting at `open`, ending at the next `closer`.
/// A doubled closer (`''`, `""`) is an escape and does not end the run.
fn skip_quoted(bytes: &[u8], open: usize, closer: u8) -> usize {
    let mut i = open + 1;
    while i < bytes.len() {
        if bytes[i] == closer {
            if bytes.get(i + 1) == Some(&closer) {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i += 1;
    }
    bytes.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shape(sql: &str) -> QueryShape {
        inspect_query(sql)
    }

    #[test]
    fn finds_a_top_level_order_by() {
        assert!(shape("SELECT * FROM t ORDER BY id").has_order_by);
        assert!(shape("select a from t order   by a, b desc").has_order_by);
        assert!(!shape("SELECT * FROM t").has_order_by);
        // `ORDER` alone is not an ordering clause.
        assert!(!shape("SELECT order FROM t").has_order_by);
    }

    #[test]
    fn ignores_an_order_by_that_belongs_to_a_subquery() {
        // The inner ordering says nothing about the outer result's order.
        assert!(!shape("SELECT * FROM (SELECT * FROM t ORDER BY id) s").has_order_by);
        assert!(!shape("WITH c AS (SELECT * FROM t ORDER BY id) SELECT * FROM c").has_order_by);
        // ...but a top-level one after a subquery still counts.
        assert!(shape("SELECT * FROM (SELECT * FROM t ORDER BY id) s ORDER BY s.id").has_order_by);
    }

    #[test]
    fn ignores_keywords_inside_literals_identifiers_and_comments() {
        assert!(!shape("SELECT 'order by id' FROM t").has_order_by);
        assert!(!shape("SELECT \"order by\" FROM t").has_order_by);
        assert!(!shape("SELECT `order by` FROM t").has_order_by);
        assert!(!shape("SELECT [order by] FROM t").has_order_by);
        assert!(!shape("SELECT * FROM t -- ORDER BY id\n").has_order_by);
        assert!(!shape("SELECT * FROM t /* ORDER BY id */").has_order_by);
        // A doubled quote is an escape, not the end of the literal.
        assert!(!shape("SELECT 'it''s order by' FROM t").has_order_by);
    }

    #[test]
    fn finds_a_top_level_row_limit() {
        assert!(shape("SELECT * FROM t LIMIT 10").has_row_limit);
        assert!(shape("SELECT * FROM t ORDER BY id LIMIT 10 OFFSET 5").has_row_limit);
        assert!(shape("SELECT * FROM t ORDER BY id OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY").has_row_limit);
        assert!(!shape("SELECT * FROM t").has_row_limit);
        // A LIMIT inside a subquery does not block appending one outside.
        assert!(!shape("SELECT * FROM (SELECT * FROM t LIMIT 5) s").has_row_limit);
    }

    #[test]
    fn small_results_are_read_whole_whatever_the_ordering() {
        assert_eq!(plan_export_read(0, 100, false), ExportRead::WholeResult);
        assert_eq!(plan_export_read(99, 100, false), ExportRead::WholeResult);
        // Exactly at the limit still fits - the probe reads limit + 1.
        assert_eq!(plan_export_read(100, 100, false), ExportRead::WholeResult);
    }

    #[test]
    fn a_large_ordered_result_keeps_paging() {
        assert_eq!(plan_export_read(101, 100, true), ExportRead::ContinueInChunks);
    }

    #[test]
    fn a_large_unordered_result_is_refused() {
        // Chunking this would repeat and skip rows.
        assert_eq!(plan_export_read(101, 100, false), ExportRead::NeedsOrdering);
    }

    #[test]
    fn appends_a_page_tail_to_the_statement() {
        assert_eq!(
            append_page("SELECT * FROM t ORDER BY id", 100, 0),
            "SELECT * FROM t ORDER BY id LIMIT 100 OFFSET 0"
        );
        // A trailing semicolon would put the tail after the statement end.
        assert_eq!(
            append_page("SELECT * FROM t ORDER BY id;  ", 10, 20),
            "SELECT * FROM t ORDER BY id LIMIT 10 OFFSET 20"
        );
    }
}
