use std::fs::File;
use std::io::{BufRead, BufReader};

use crate::models::AppError;

// ---------------------------------------------------------------------------
// File reading (plain + gz)
// ---------------------------------------------------------------------------

pub(crate) fn open_sql_reader(path: &str) -> Result<Box<dyn BufRead>, AppError> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);

    if path.to_lowercase().ends_with(".gz") {
        let decoder = flate2::read::GzDecoder::new(reader);
        Ok(Box::new(BufReader::new(decoder)))
    } else {
        Ok(Box::new(reader))
    }
}

// ---------------------------------------------------------------------------
// Statement scanner (in-memory)
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
        InDollarQuote(String),
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
            State::InLineComment => {
                if ch == '\n' {
                    state = State::Normal;
                }
                i += 1;
            }
            State::InBlockComment => {
                if ch == '*' && i + 1 < len && chars[i + 1] == '/' {
                    state = State::Normal;
                    i += 2;
                } else {
                    i += 1;
                }
            }
            State::InSingleQuote => {
                if ch == '\'' {
                    if i + 1 < len && chars[i + 1] == '\'' {
                        i += 2;
                    } else {
                        state = State::Normal;
                        i += 1;
                    }
                } else {
                    i += 1;
                }
            }
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
            State::InDollarQuote(tag) => {
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
            State::Normal => {
                if ch == '-' && i + 1 < len && chars[i + 1] == '-' {
                    state = State::InLineComment;
                    i += 2;
                    continue;
                }
                if ch == '/' && i + 1 < len && chars[i + 1] == '*' {
                    state = State::InBlockComment;
                    i += 2;
                    continue;
                }
                if ch == '\'' {
                    state = State::InSingleQuote;
                    i += 1;
                    continue;
                }
                if ch == '"' {
                    state = State::InDoubleQuote;
                    i += 1;
                    continue;
                }
                if ch == '$' {
                    if let Some(tag) = try_read_dollar_tag(&chars, i) {
                        let tag_len = tag.chars().count() + 2;
                        state = State::InDollarQuote(tag);
                        i += tag_len;
                        continue;
                    }
                }
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
pub(crate) fn try_read_dollar_tag(chars: &[char], pos: usize) -> Option<String> {
    let len = chars.len();
    let mut j = pos + 1;
    while j < len && chars[j] != '$' {
        let c = chars[j];
        if !c.is_alphanumeric() && c != '_' {
            return None;
        }
        j += 1;
    }
    if j >= len {
        return None;
    }
    let tag: String = chars[pos + 1..j].iter().collect();
    Some(tag)
}
