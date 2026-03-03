use crate::models::DatabaseType;

pub fn escape_string_literal(str: &str, db_type: &DatabaseType) -> String {
    match db_type {
        DatabaseType::Mysql | DatabaseType::Mariadb => {
            let mut result = str.to_string();
            // Escape backslashes FIRST
            result = result.replace('\\', "\\\\");
            result = result.replace('\'', "''");
            result = result.replace('\n', "\\n");
            result = result.replace('\r', "\\r");
            result = result.replace('\t', "\\t");
            result = result.replace('\0', "\\0");
            result = result.replace('\u{08}', "\\b");
            result = result.replace('\u{0C}', "\\f");
            result = result.replace('\u{1A}', "\\Z");
            result
        }
        DatabaseType::Postgresql | DatabaseType::Sqlite | DatabaseType::Mongodb => {
            let mut result = str.to_string();
            result = result.replace('\'', "''");
            result = result.replace('\0', "");
            result
        }
    }
}

pub fn escape_like_wildcards(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DatabaseType;

    // === escape_string_literal: MySQL ===

    #[test]
    fn mysql_basic_string() {
        assert_eq!(
            escape_string_literal("hello world", &DatabaseType::Mysql),
            "hello world"
        );
    }

    #[test]
    fn mysql_single_quote() {
        assert_eq!(
            escape_string_literal("it's", &DatabaseType::Mysql),
            "it''s"
        );
    }

    #[test]
    fn mysql_backslash() {
        assert_eq!(
            escape_string_literal("path\\to", &DatabaseType::Mysql),
            "path\\\\to"
        );
    }

    #[test]
    fn mysql_newline() {
        assert_eq!(
            escape_string_literal("line\nbreak", &DatabaseType::Mysql),
            "line\\nbreak"
        );
    }

    #[test]
    fn mysql_tab() {
        assert_eq!(
            escape_string_literal("col\tcol", &DatabaseType::Mysql),
            "col\\tcol"
        );
    }

    #[test]
    fn mysql_null_byte() {
        assert_eq!(
            escape_string_literal("ab\0cd", &DatabaseType::Mysql),
            "ab\\0cd"
        );
    }

    #[test]
    fn mysql_sub_char() {
        assert_eq!(
            escape_string_literal("end\u{1A}file", &DatabaseType::Mysql),
            "end\\Zfile"
        );
    }

    // === escape_string_literal: PostgreSQL ===

    #[test]
    fn pg_basic_string() {
        assert_eq!(
            escape_string_literal("hello world", &DatabaseType::Postgresql),
            "hello world"
        );
    }

    #[test]
    fn pg_single_quote() {
        assert_eq!(
            escape_string_literal("it's", &DatabaseType::Postgresql),
            "it''s"
        );
    }

    #[test]
    fn pg_null_byte_removed() {
        assert_eq!(
            escape_string_literal("ab\0cd", &DatabaseType::Postgresql),
            "abcd"
        );
    }

    // === escape_string_literal: SQLite (same as PG) ===

    #[test]
    fn sqlite_basic_string() {
        assert_eq!(
            escape_string_literal("hello world", &DatabaseType::Sqlite),
            "hello world"
        );
    }

    #[test]
    fn sqlite_single_quote() {
        assert_eq!(
            escape_string_literal("it's", &DatabaseType::Sqlite),
            "it''s"
        );
    }

    #[test]
    fn sqlite_null_byte_removed() {
        assert_eq!(
            escape_string_literal("ab\0cd", &DatabaseType::Sqlite),
            "abcd"
        );
    }

    // === escape_like_wildcards ===

    #[test]
    fn like_percent() {
        assert_eq!(escape_like_wildcards("100%"), "100\\%");
    }

    #[test]
    fn like_underscore() {
        assert_eq!(escape_like_wildcards("a_b"), "a\\_b");
    }

    #[test]
    fn like_backslash() {
        assert_eq!(escape_like_wildcards("a\\b"), "a\\\\b");
    }

    #[test]
    fn like_combination() {
        assert_eq!(escape_like_wildcards("100%_\\"), "100\\%\\_\\\\");
    }

    #[test]
    fn like_no_special_chars() {
        assert_eq!(escape_like_wildcards("hello"), "hello");
    }

    // === Empty strings ===

    #[test]
    fn empty_escape_string_literal() {
        assert_eq!(
            escape_string_literal("", &DatabaseType::Mysql),
            ""
        );
        assert_eq!(
            escape_string_literal("", &DatabaseType::Postgresql),
            ""
        );
    }

    #[test]
    fn empty_escape_like_wildcards() {
        assert_eq!(escape_like_wildcards(""), "");
    }

    // === Unicode strings ===

    #[test]
    fn unicode_chinese_characters() {
        assert_eq!(
            escape_string_literal("你好世界", &DatabaseType::Mysql),
            "你好世界"
        );
        assert_eq!(
            escape_string_literal("你好世界", &DatabaseType::Postgresql),
            "你好世界"
        );
    }

    #[test]
    fn unicode_emoji() {
        assert_eq!(
            escape_string_literal("hello 🎉🚀", &DatabaseType::Mysql),
            "hello 🎉🚀"
        );
        assert_eq!(escape_like_wildcards("🎉%🚀"), "🎉\\%🚀");
    }
}
