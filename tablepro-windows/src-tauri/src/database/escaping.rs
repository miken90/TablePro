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
