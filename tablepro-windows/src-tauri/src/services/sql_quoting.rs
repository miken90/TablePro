pub fn quote_identifier(name: &str, driver_type: &str) -> String {
    let normalized = driver_type.to_ascii_lowercase();

    match normalized.as_str() {
        "mysql" | "mariadb" => format!("`{}`", name.replace('`', "``")),
        "mssql" | "sqlserver" | "sql_server" => format!("[{}]", name.replace(']', "]]")),
        _ => format!("\"{}\"", name.replace('"', "\"\"")),
    }
}

#[cfg(test)]
mod tests {
    use super::quote_identifier;

    #[test]
    fn quotes_postgres_with_double_quotes() {
        assert_eq!(quote_identifier("users", "postgres"), "\"users\"");
        assert_eq!(quote_identifier("a\"b", "postgres"), "\"a\"\"b\"");
    }

    #[test]
    fn quotes_mysql_with_backticks() {
        assert_eq!(quote_identifier("users", "mysql"), "`users`");
        assert_eq!(quote_identifier("a`b", "mysql"), "`a``b`");
    }

    #[test]
    fn quotes_mssql_with_brackets() {
        assert_eq!(quote_identifier("users", "mssql"), "[users]");
        assert_eq!(quote_identifier("a]b", "mssql"), "[a]]b]");
    }

    #[test]
    fn falls_back_to_ansi_quotes_for_unknown() {
        assert_eq!(quote_identifier("users", "oracle"), "\"users\"");
    }

    #[test]
    fn quotes_malicious_identifier_input() {
        let input = "users\"; DROP TABLE accounts; --";
        assert_eq!(
            quote_identifier(input, "postgres"),
            "\"users\"\"; DROP TABLE accounts; --\""
        );
    }
}
