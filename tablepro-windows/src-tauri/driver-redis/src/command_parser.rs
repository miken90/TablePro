/// Parsed Redis CLI command.
#[derive(Debug, Clone)]
pub struct RedisCommand {
    pub name: String,
    pub args: Vec<String>,
}

/// Tokenize a Redis CLI command string into command name + arguments.
///
/// Supports double-quoted strings with backslash escapes and single-quoted
/// strings (no escape processing). Unquoted tokens are split on whitespace.
pub fn parse_command(input: &str) -> Result<RedisCommand, String> {
    let tokens = tokenize(input)?;
    if tokens.is_empty() {
        return Err("Empty command".to_string());
    }
    Ok(RedisCommand {
        name: tokens[0].to_uppercase(),
        args: tokens[1..].to_vec(),
    })
}

fn tokenize(input: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() {
            chars.next();
            continue;
        }

        if ch == '"' {
            chars.next();
            let mut token = String::new();
            loop {
                match chars.next() {
                    None => return Err("Unterminated double-quoted string".to_string()),
                    Some('"') => break,
                    Some('\\') => match chars.next() {
                        Some(c) => token.push(c),
                        None => return Err("Trailing backslash in string".to_string()),
                    },
                    Some(c) => token.push(c),
                }
            }
            tokens.push(token);
        } else if ch == '\'' {
            chars.next();
            let mut token = String::new();
            loop {
                match chars.next() {
                    None => return Err("Unterminated single-quoted string".to_string()),
                    Some('\'') => break,
                    Some(c) => token.push(c),
                }
            }
            tokens.push(token);
        } else {
            let mut token = String::new();
            while let Some(&c) = chars.peek() {
                if c.is_whitespace() {
                    break;
                }
                token.push(c);
                chars.next();
            }
            tokens.push(token);
        }
    }

    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_command() {
        let cmd = parse_command("GET mykey").unwrap();
        assert_eq!(cmd.name, "GET");
        assert_eq!(cmd.args, vec!["mykey"]);
    }

    #[test]
    fn test_set_with_value() {
        let cmd = parse_command("SET foo bar").unwrap();
        assert_eq!(cmd.name, "SET");
        assert_eq!(cmd.args, vec!["foo", "bar"]);
    }

    #[test]
    fn test_quoted_string() {
        let cmd = parse_command(r#"SET "my key" "hello world""#).unwrap();
        assert_eq!(cmd.name, "SET");
        assert_eq!(cmd.args, vec!["my key", "hello world"]);
    }

    #[test]
    fn test_single_quoted() {
        let cmd = parse_command("SET 'my key' 'value'").unwrap();
        assert_eq!(cmd.name, "SET");
        assert_eq!(cmd.args, vec!["my key", "value"]);
    }

    #[test]
    fn test_escaped_quote() {
        let cmd = parse_command(r#"SET key "val\"ue""#).unwrap();
        assert_eq!(cmd.name, "SET");
        assert_eq!(cmd.args, vec!["key", "val\"ue"]);
    }

    #[test]
    fn test_no_args() {
        let cmd = parse_command("PING").unwrap();
        assert_eq!(cmd.name, "PING");
        assert!(cmd.args.is_empty());
    }

    #[test]
    fn test_case_insensitive() {
        let cmd = parse_command("hgetall myhash").unwrap();
        assert_eq!(cmd.name, "HGETALL");
        assert_eq!(cmd.args, vec!["myhash"]);
    }

    #[test]
    fn test_empty_input() {
        assert!(parse_command("").is_err());
        assert!(parse_command("   ").is_err());
    }

    #[test]
    fn test_extra_whitespace() {
        let cmd = parse_command("  SET   foo   bar  ").unwrap();
        assert_eq!(cmd.name, "SET");
        assert_eq!(cmd.args, vec!["foo", "bar"]);
    }

    #[test]
    fn test_unterminated_quote() {
        assert!(parse_command(r#"SET "unterminated"#).is_err());
    }
}
