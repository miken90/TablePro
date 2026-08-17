use std::io::BufRead;

use crate::models::AppError;

use super::import_parser::{open_sql_reader, try_read_dollar_tag};

// ---------------------------------------------------------------------------
// Streaming state machine
// ---------------------------------------------------------------------------

#[derive(PartialEq, Clone)]
pub(crate) enum StreamingState {
    Normal,
    InSingleQuote,
    InDoubleQuote,
    InDollarQuote(String),
    InLineComment,
    InBlockComment,
}

pub(crate) struct StreamingScanner {
    state: StreamingState,
    current: String,
}

impl StreamingScanner {
    pub(crate) fn new() -> Self {
        Self {
            state: StreamingState::Normal,
            current: String::new(),
        }
    }

    pub(crate) fn emit_if_non_empty<F>(&mut self, mut on_statement: F) -> Result<(), AppError>
    where
        F: FnMut(String) -> Result<(), AppError>,
    {
        let trimmed = self.current.trim();
        if !trimmed.is_empty() {
            on_statement(trimmed.to_string())?;
        }
        self.current.clear();
        Ok(())
    }

    pub(crate) fn feed<F>(&mut self, chunk: &str, mut on_statement: F) -> Result<(), AppError>
    where
        F: FnMut(String) -> Result<(), AppError>,
    {
        let chars: Vec<char> = chunk.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            let ch = chars[i];

            match &self.state {
                StreamingState::InLineComment => {
                    self.current.push(ch);
                    if ch == '\n' {
                        self.state = StreamingState::Normal;
                    }
                    i += 1;
                }
                StreamingState::InBlockComment => {
                    self.current.push(ch);
                    if ch == '*' && i + 1 < len && chars[i + 1] == '/' {
                        self.current.push('/');
                        self.state = StreamingState::Normal;
                        i += 2;
                    } else {
                        i += 1;
                    }
                }
                StreamingState::InSingleQuote => {
                    self.current.push(ch);
                    if ch == '\'' {
                        if i + 1 < len && chars[i + 1] == '\'' {
                            self.current.push('\'');
                            i += 2;
                        } else {
                            self.state = StreamingState::Normal;
                            i += 1;
                        }
                    } else {
                        i += 1;
                    }
                }
                StreamingState::InDoubleQuote => {
                    self.current.push(ch);
                    if ch == '"' {
                        if i + 1 < len && chars[i + 1] == '"' {
                            self.current.push('"');
                            i += 2;
                        } else {
                            self.state = StreamingState::Normal;
                            i += 1;
                        }
                    } else {
                        i += 1;
                    }
                }
                StreamingState::InDollarQuote(tag) => {
                    let closing = format!("${tag}$");
                    let closing_chars: Vec<char> = closing.chars().collect();
                    let clen = closing_chars.len();

                    if i + clen <= len && chars[i..i + clen] == closing_chars[..] {
                        for c in &closing_chars {
                            self.current.push(*c);
                        }
                        self.state = StreamingState::Normal;
                        i += clen;
                    } else {
                        self.current.push(ch);
                        i += 1;
                    }
                }
                StreamingState::Normal => {
                    if ch == '-' && i + 1 < len && chars[i + 1] == '-' {
                        self.current.push('-');
                        self.current.push('-');
                        self.state = StreamingState::InLineComment;
                        i += 2;
                        continue;
                    }
                    if ch == '/' && i + 1 < len && chars[i + 1] == '*' {
                        self.current.push('/');
                        self.current.push('*');
                        self.state = StreamingState::InBlockComment;
                        i += 2;
                        continue;
                    }
                    if ch == '\'' {
                        self.current.push(ch);
                        self.state = StreamingState::InSingleQuote;
                        i += 1;
                        continue;
                    }
                    if ch == '"' {
                        self.current.push(ch);
                        self.state = StreamingState::InDoubleQuote;
                        i += 1;
                        continue;
                    }
                    if ch == '$' {
                        if let Some(tag) = try_read_dollar_tag(&chars, i) {
                            let tag_len = tag.chars().count() + 2;
                            self.current.push('$');
                            self.current.push_str(&tag);
                            self.current.push('$');
                            self.state = StreamingState::InDollarQuote(tag);
                            i += tag_len;
                            continue;
                        }
                    }
                    if ch == ';' {
                        self.emit_if_non_empty(&mut on_statement)?;
                        i += 1;
                        continue;
                    }

                    self.current.push(ch);
                    i += 1;
                }
            }
        }

        Ok(())
    }

    pub(crate) fn finish<F>(&mut self, on_statement: F) -> Result<(), AppError>
    where
        F: FnMut(String) -> Result<(), AppError>,
    {
        self.emit_if_non_empty(on_statement)
    }
}

// ---------------------------------------------------------------------------
// Public streaming API
// ---------------------------------------------------------------------------

pub(crate) fn stream_statements_buffered<F>(path: &str, mut on_statement: F) -> Result<(), AppError>
where
    F: FnMut(String) -> Result<(), AppError>,
{
    let mut reader = open_sql_reader(path)?;
    let mut scanner = StreamingScanner::new();
    let mut line = String::new();

    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|e| AppError::IoError(format!("read failed: {e}")))?;
        if bytes == 0 {
            break;
        }
        scanner.feed(&line, &mut on_statement)?;
    }

    scanner.finish(on_statement)
}

pub(crate) fn count_statements_buffered(path: &str) -> Result<usize, AppError> {
    let mut total = 0usize;
    stream_statements_buffered(path, |_stmt| {
        total += 1;
        Ok(())
    })?;
    Ok(total)
}
