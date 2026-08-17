//! Decide how a cell value must be written into a SQL literal, from the
//! column's declared type rather than from the shape of the value.
//!
//! Guessing at the value is not recoverable: a `varchar` postcode `007` looks
//! numeric, and emitting it bare stores `7`; the literal strings `true` and
//! `false` in a text column become `1`/`0`; and `NaN`, `inf` and `+5` parse as
//! `f64` but are not SQL numeric literals on any of the engines here, so they
//! turn a save into an engine syntax error.
//!
//! When the type is unknown the answer is [`ValueKind::Text`] — quoting is the
//! safe direction. Every engine this app supports coerces a quoted literal
//! into a numeric, date or boolean column (`'30'` into `int`, `'2024-01-01'`
//! into `date`), while the reverse — an unquoted value in a text column —
//! silently rewrites the data or fails.

/// How a value for a given column must be rendered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    /// Emit unquoted when the value really is a numeric literal.
    Numeric,
    /// Emit as the dialect's boolean literal when the value reads as a boolean.
    Boolean,
    /// Always quote.
    Text,
}

/// Declared types whose values are numeric literals.
const NUMERIC_TYPES: &[&str] = &[
    "int", "int2", "int4", "int8", "integer", "bigint", "smallint", "tinyint", "mediumint",
    "serial", "serial2", "serial4", "serial8", "bigserial", "smallserial", "decimal", "numeric",
    "real", "float", "float4", "float8", "double", "double precision", "money", "smallmoney",
    "dec", "fixed", "number",
];

/// Declared types whose values are booleans.
const BOOLEAN_TYPES: &[&str] = &["bool", "boolean", "bit"];

/// Classify a column's declared type name. `None` (and any unrecognised type)
/// is [`ValueKind::Text`].
pub fn classify_column_type(type_name: Option<&str>) -> ValueKind {
    let Some(raw) = type_name else {
        return ValueKind::Text;
    };

    let lowered = raw.trim().to_ascii_lowercase();
    // `integer[]` is an array, not an integer — anything with a subscript is
    // rendered as text by the drivers and must be quoted as such.
    if lowered.contains('[') {
        return ValueKind::Text;
    }

    // `varchar(20)`, `numeric(10,2)`, `bigint unsigned`, `int zerofill`.
    let base = lowered
        .split('(')
        .next()
        .unwrap_or("")
        .replace(" unsigned", "")
        .replace(" zerofill", "")
        .trim()
        .to_string();

    if NUMERIC_TYPES.contains(&base.as_str()) {
        ValueKind::Numeric
    } else if BOOLEAN_TYPES.contains(&base.as_str()) {
        ValueKind::Boolean
    } else {
        ValueKind::Text
    }
}

/// Is `s` a bare SQL numeric literal?
///
/// Deliberately stricter than `f64::from_str`, which accepts `NaN`, `inf`,
/// `infinity` and hex floats — none of which are numeric literals in
/// PostgreSQL, MySQL, SQL Server or SQLite. Those must be quoted so the engine
/// can coerce (`'NaN'::numeric`) or reject them cleanly.
pub fn is_numeric_literal(s: &str) -> bool {
    let bytes = s.as_bytes();
    let mut i = 0;

    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }

    let mut mantissa_digits = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
        mantissa_digits += 1;
    }
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
            mantissa_digits += 1;
        }
    }
    if mantissa_digits == 0 {
        return false;
    }

    if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
        i += 1;
        if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
            i += 1;
        }
        let mut exponent_digits = 0;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
            exponent_digits += 1;
        }
        if exponent_digits == 0 {
            return false;
        }
    }

    i == bytes.len()
}

/// Read a boolean out of a cell value. Covers what the drivers actually put in
/// the grid: PostgreSQL's text protocol renders `boolean` as `t`/`f`, MySQL and
/// SQL Server render `bit`/`tinyint(1)` as `1`/`0`.
pub fn parse_boolean(s: &str) -> Option<bool> {
    match s.trim().to_ascii_lowercase().as_str() {
        "true" | "t" | "1" | "yes" | "y" => Some(true),
        "false" | "f" | "0" | "no" | "n" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeric_types_are_recognised_across_engines() {
        for t in [
            "int", "integer", "int4", "bigint", "smallint", "tinyint(1)", "decimal(10,2)",
            "numeric", "real", "double precision", "float8", "money", "serial",
            "bigint unsigned", "INT",
        ] {
            assert_eq!(classify_column_type(Some(t)), ValueKind::Numeric, "{t}");
        }
    }

    #[test]
    fn boolean_types_are_recognised() {
        for t in ["bool", "boolean", "bit", "BIT"] {
            assert_eq!(classify_column_type(Some(t)), ValueKind::Boolean, "{t}");
        }
    }

    #[test]
    fn text_and_unknown_types_stay_text() {
        for t in [
            "varchar(20)", "text", "character varying", "uuid", "json", "jsonb", "date",
            "timestamp with time zone", "bytea", "interval", "point", "integer[]", "nvarchar(max)",
        ] {
            assert_eq!(classify_column_type(Some(t)), ValueKind::Text, "{t}");
        }
        // No metadata at all falls back to quoting.
        assert_eq!(classify_column_type(None), ValueKind::Text);
        assert_eq!(classify_column_type(Some("")), ValueKind::Text);
    }

    #[test]
    fn numeric_literals_exclude_what_engines_reject() {
        for good in ["0", "7", "007", "-1", "+5", "3.14", ".5", "1e10", "1E-3", "-0.0"] {
            assert!(is_numeric_literal(good), "{good}");
        }
        for bad in [
            "NaN", "inf", "infinity", "-inf", "", " 1", "1 ", "1e", "0x1f", "1,000", "1.2.3", "5%",
        ] {
            assert!(!is_numeric_literal(bad), "{bad}");
        }
    }

    #[test]
    fn booleans_cover_the_renderings_drivers_produce() {
        assert_eq!(parse_boolean("true"), Some(true));
        assert_eq!(parse_boolean("T"), Some(true));
        assert_eq!(parse_boolean("1"), Some(true));
        assert_eq!(parse_boolean("f"), Some(false));
        assert_eq!(parse_boolean("FALSE"), Some(false));
        assert_eq!(parse_boolean("0"), Some(false));
        assert_eq!(parse_boolean("maybe"), None);
    }
}
