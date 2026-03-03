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
