use serde::{Deserialize, Serialize};

/// Basic table/view descriptor from information_schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub schema: Option<String>,
    pub table_type: String,
    pub row_count_estimate: Option<i64>,
}

/// Index descriptor for a table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub index_type: String,
}

/// Foreign-key constraint descriptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub name: String,
    pub column: String,
    pub referenced_table: String,
    pub referenced_column: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_table_info_serde() {
        let t = TableInfo {
            name: "users".to_string(),
            schema: Some("public".to_string()),
            table_type: "TABLE".to_string(),
            row_count_estimate: Some(1000),
        };
        let json = serde_json::to_string(&t).unwrap();
        let d: TableInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(d.name, "users");
        assert_eq!(d.schema, Some("public".to_string()));
        assert_eq!(d.row_count_estimate, Some(1000));
    }

    #[test]
    fn test_table_info_no_schema() {
        let t = TableInfo {
            name: "orders".to_string(),
            schema: None,
            table_type: "VIEW".to_string(),
            row_count_estimate: None,
        };
        let json = serde_json::to_string(&t).unwrap();
        let d: TableInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(d.schema, None);
        assert_eq!(d.table_type, "VIEW");
    }

    #[test]
    fn test_index_info_serde() {
        let idx = IndexInfo {
            name: "idx_users_email".to_string(),
            columns: vec!["email".to_string()],
            is_unique: true,
            index_type: "btree".to_string(),
        };
        let json = serde_json::to_string(&idx).unwrap();
        let d: IndexInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(d.name, "idx_users_email");
        assert!(d.is_unique);
        assert_eq!(d.columns, vec!["email"]);
    }

    #[test]
    fn test_foreign_key_info_serde() {
        let fk = ForeignKeyInfo {
            name: "fk_order_user".to_string(),
            column: "user_id".to_string(),
            referenced_table: "users".to_string(),
            referenced_column: "id".to_string(),
        };
        let json = serde_json::to_string(&fk).unwrap();
        let d: ForeignKeyInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(d.name, "fk_order_user");
        assert_eq!(d.referenced_table, "users");
    }
}
