//! Schema adapter — Redis is key/value, mapped to a relational shape.

use redis::aio::MultiplexedConnection;
use redis::cmd;

use driver_common::{ColumnInfo, DriverError, TableInfo};

/// `INFO keyspace` → `db0 (N keys)` / `db1 (N keys)` / …
pub async fn fetch_databases(
    conn: &mut MultiplexedConnection,
) -> Result<Vec<String>, DriverError> {
    let info: String = cmd("INFO")
        .arg("keyspace")
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("INFO keyspace failed: {e}")))?;

    let mut dbs: Vec<String> = info
        .lines()
        .filter(|line| line.starts_with("db"))
        .filter_map(|line| {
            let colon = line.find(':')?;
            let name = &line[..colon];
            let rest = &line[colon + 1..];
            let keys = rest
                .split(',')
                .find(|p| p.starts_with("keys="))
                .and_then(|p| p.strip_prefix("keys="))
                .unwrap_or("0");
            Some(format!("{name} ({keys} keys)"))
        })
        .collect();

    if dbs.is_empty() {
        dbs.push("db0 (0 keys)".to_string());
    }
    Ok(dbs)
}

/// `SCAN` first ≤200 keys → `TableInfo` rows. `db_label` is "db0" etc.
pub async fn fetch_tables(
    conn: &mut MultiplexedConnection,
    db_label: &str,
) -> Result<Vec<TableInfo>, DriverError> {
    let mut keys: Vec<String> = Vec::new();
    let mut cursor: u64 = 0;
    let max_keys: usize = 200;

    loop {
        let (next, batch): (u64, Vec<String>) = cmd("SCAN")
            .arg(cursor)
            .arg("COUNT")
            .arg(100)
            .query_async(conn)
            .await
            .map_err(|e| DriverError::Query(format!("SCAN failed: {e}")))?;
        cursor = next;
        keys.extend(batch);
        if cursor == 0 || keys.len() >= max_keys {
            break;
        }
    }
    keys.truncate(max_keys);

    Ok(keys
        .into_iter()
        .map(|key| TableInfo {
            name: key,
            schema: Some(db_label.to_string()),
            table_type: "KEY".to_string(),
            row_count_estimate: None,
        })
        .collect())
}

/// Fixed `Key | Type | TTL | Value` schema for the key browser grid.
pub fn fixed_key_columns() -> Vec<ColumnInfo> {
    vec![
        ColumnInfo {
            name: "Key".to_string(),
            type_name: "string".to_string(),
            nullable: false,
            is_primary_key: true,
        },
        ColumnInfo {
            name: "Type".to_string(),
            type_name: "string".to_string(),
            nullable: false,
            is_primary_key: false,
        },
        ColumnInfo {
            name: "TTL".to_string(),
            type_name: "integer".to_string(),
            nullable: false,
            is_primary_key: false,
        },
        ColumnInfo {
            name: "Value".to_string(),
            type_name: "string".to_string(),
            nullable: true,
            is_primary_key: false,
        },
    ]
}
