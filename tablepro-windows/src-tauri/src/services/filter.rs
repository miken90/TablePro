use serde::{Deserialize, Serialize};

use crate::database::escaping::{escape_like_wildcards, escape_string_literal};
use crate::models::DatabaseType;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
    Eq,
    NotEq,
    Gt,
    Lt,
    Gte,
    Lte,
    Like,
    NotLike,
    In,
    NotIn,
    IsNull,
    IsNotNull,
    Between,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogicalOp {
    And,
    Or,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterCondition {
    pub column: String,
    pub operator: FilterOperator,
    pub value: Option<String>,
    pub value2: Option<String>,
    pub logical_op: LogicalOp,
}

pub struct FilterSqlGenerator;

impl FilterSqlGenerator {
    pub fn generate_where(
        conditions: &[FilterCondition],
        db_type: &DatabaseType,
    ) -> String {
        if conditions.is_empty() {
            return String::new();
        }

        let clauses: Vec<String> = conditions
            .iter()
            .map(|c| Self::condition_to_sql(c, db_type))
            .collect();

        let mut result = String::new();
        for (i, clause) in clauses.iter().enumerate() {
            if i > 0 {
                let op = match &conditions[i].logical_op {
                    LogicalOp::And => " AND ",
                    LogicalOp::Or => " OR ",
                };
                result.push_str(op);
            }
            result.push_str(clause);
        }

        format!("WHERE {}", result)
    }

    fn condition_to_sql(condition: &FilterCondition, db_type: &DatabaseType) -> String {
        let col = db_type.quote_identifier(&condition.column);
        let val = condition
            .value
            .as_deref()
            .unwrap_or("");

        match condition.operator {
            FilterOperator::Eq => {
                format!("{} = '{}'", col, escape_string_literal(val, db_type))
            }
            FilterOperator::NotEq => {
                format!("{} != '{}'", col, escape_string_literal(val, db_type))
            }
            FilterOperator::Gt => {
                format!("{} > '{}'", col, escape_string_literal(val, db_type))
            }
            FilterOperator::Lt => {
                format!("{} < '{}'", col, escape_string_literal(val, db_type))
            }
            FilterOperator::Gte => {
                format!("{} >= '{}'", col, escape_string_literal(val, db_type))
            }
            FilterOperator::Lte => {
                format!("{} <= '{}'", col, escape_string_literal(val, db_type))
            }
            FilterOperator::Like => {
                format!(
                    "{} LIKE '%{}%'",
                    col,
                    escape_like_wildcards(&escape_string_literal(val, db_type))
                )
            }
            FilterOperator::NotLike => {
                format!(
                    "{} NOT LIKE '%{}%'",
                    col,
                    escape_like_wildcards(&escape_string_literal(val, db_type))
                )
            }
            FilterOperator::In => {
                let items: Vec<String> = val
                    .split(',')
                    .map(|s| format!("'{}'", escape_string_literal(s.trim(), db_type)))
                    .collect();
                format!("{} IN ({})", col, items.join(", "))
            }
            FilterOperator::NotIn => {
                let items: Vec<String> = val
                    .split(',')
                    .map(|s| format!("'{}'", escape_string_literal(s.trim(), db_type)))
                    .collect();
                format!("{} NOT IN ({})", col, items.join(", "))
            }
            FilterOperator::IsNull => {
                format!("{} IS NULL", col)
            }
            FilterOperator::IsNotNull => {
                format!("{} IS NOT NULL", col)
            }
            FilterOperator::Between => {
                let val2 = condition.value2.as_deref().unwrap_or("");
                format!(
                    "{} BETWEEN '{}' AND '{}'",
                    col,
                    escape_string_literal(val, db_type),
                    escape_string_literal(val2, db_type)
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DatabaseType;

    fn cond(
        column: &str,
        operator: FilterOperator,
        value: Option<&str>,
        value2: Option<&str>,
        logical_op: LogicalOp,
    ) -> FilterCondition {
        FilterCondition {
            column: column.to_string(),
            operator,
            value: value.map(|s| s.to_string()),
            value2: value2.map(|s| s.to_string()),
            logical_op,
        }
    }

    #[test]
    fn empty_conditions_returns_empty_string() {
        let result = FilterSqlGenerator::generate_where(&[], &DatabaseType::Postgresql);
        assert_eq!(result, "");
    }

    #[test]
    fn single_eq_postgresql() {
        let conditions = vec![cond("col", FilterOperator::Eq, Some("val"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" = 'val'"#);
    }

    #[test]
    fn single_eq_mysql() {
        let conditions = vec![cond("col", FilterOperator::Eq, Some("val"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Mysql);
        assert_eq!(result, "WHERE `col` = 'val'");
    }

    #[test]
    fn not_eq_operator() {
        let conditions = vec![cond("col", FilterOperator::NotEq, Some("val"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" != 'val'"#);
    }

    #[test]
    fn gt_operator() {
        let conditions = vec![cond("col", FilterOperator::Gt, Some("10"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" > '10'"#);
    }

    #[test]
    fn lt_operator() {
        let conditions = vec![cond("col", FilterOperator::Lt, Some("10"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" < '10'"#);
    }

    #[test]
    fn gte_operator() {
        let conditions = vec![cond("col", FilterOperator::Gte, Some("10"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" >= '10'"#);
    }

    #[test]
    fn lte_operator() {
        let conditions = vec![cond("col", FilterOperator::Lte, Some("10"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" <= '10'"#);
    }

    #[test]
    fn like_operator() {
        let conditions = vec![cond("col", FilterOperator::Like, Some("val"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" LIKE '%val%'"#);
    }

    #[test]
    fn not_like_operator() {
        let conditions =
            vec![cond("col", FilterOperator::NotLike, Some("val"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" NOT LIKE '%val%'"#);
    }

    #[test]
    fn in_operator() {
        let conditions =
            vec![cond("col", FilterOperator::In, Some("a, b, c"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" IN ('a', 'b', 'c')"#);
    }

    #[test]
    fn not_in_operator() {
        let conditions =
            vec![cond("col", FilterOperator::NotIn, Some("x, y"), None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" NOT IN ('x', 'y')"#);
    }

    #[test]
    fn is_null_operator() {
        let conditions = vec![cond("col", FilterOperator::IsNull, None, None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" IS NULL"#);
    }

    #[test]
    fn is_not_null_operator() {
        let conditions = vec![cond("col", FilterOperator::IsNotNull, None, None, LogicalOp::And)];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" IS NOT NULL"#);
    }

    #[test]
    fn between_operator() {
        let conditions = vec![cond(
            "col",
            FilterOperator::Between,
            Some("a"),
            Some("b"),
            LogicalOp::And,
        )];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "col" BETWEEN 'a' AND 'b'"#);
    }

    #[test]
    fn multiple_conditions_and() {
        let conditions = vec![
            cond("a", FilterOperator::Eq, Some("1"), None, LogicalOp::And),
            cond("b", FilterOperator::Gt, Some("2"), None, LogicalOp::And),
        ];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "a" = '1' AND "b" > '2'"#);
    }

    #[test]
    fn multiple_conditions_or() {
        let conditions = vec![
            cond("a", FilterOperator::Eq, Some("1"), None, LogicalOp::Or),
            cond("b", FilterOperator::Eq, Some("2"), None, LogicalOp::Or),
        ];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(result, r#"WHERE "a" = '1' OR "b" = '2'"#);
    }

    #[test]
    fn mixed_and_or_conditions() {
        let conditions = vec![
            cond("a", FilterOperator::Eq, Some("1"), None, LogicalOp::And),
            cond("b", FilterOperator::Gt, Some("2"), None, LogicalOp::And),
            cond("c", FilterOperator::Lt, Some("3"), None, LogicalOp::Or),
        ];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        assert_eq!(
            result,
            r#"WHERE "a" = '1' AND "b" > '2' OR "c" < '3'"#
        );
    }

    #[test]
    fn sql_injection_in_value() {
        let conditions = vec![cond(
            "col",
            FilterOperator::Eq,
            Some("'; DROP TABLE users; --"),
            None,
            LogicalOp::And,
        )];
        let result = FilterSqlGenerator::generate_where(&conditions, &DatabaseType::Postgresql);
        // Single quote is doubled to '', preventing SQL injection
        assert_eq!(
            result,
            r#"WHERE "col" = '''; DROP TABLE users; --'"#
        );
        assert!(result.contains("''"));
    }
}
