//! Index and foreign key schema queries for the MSSQL driver.
#![allow(clippy::get_first)]

use std::collections::HashMap;

use driver_common::{DriverError, ForeignKeyInfo, IndexInfo};

use crate::{execute_simple, MssqlConn};

fn escape_bracket(s: &str) -> String {
    s.replace(']', "]]")
}

pub async fn fetch_indexes(
    client: &mut MssqlConn,
    table: &str,
    schema: &str,
) -> Result<Vec<IndexInfo>, DriverError> {
    let schema = if schema.is_empty() { "dbo" } else { schema };
    let bt = escape_bracket(table);
    let bs = escape_bracket(schema);
    let full = format!("[{bs}].[{bt}]");
    let sql = format!(
        "SELECT i.name AS index_name, c.name AS column_name, i.is_unique, i.is_primary_key, i.type_desc \
         FROM sys.indexes i \
         JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id \
         JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id \
         WHERE i.object_id = OBJECT_ID('{full}') AND i.name IS NOT NULL \
         ORDER BY i.name, ic.key_ordinal"
    );

    let (_, rows, _) = execute_simple(client, &sql).await?;
    Ok(build_index_list(rows))
}

fn build_index_list(rows: Vec<Vec<Option<String>>>) -> Vec<IndexInfo> {
    let mut map: HashMap<String, (bool, String, Vec<String>)> = HashMap::new();
    for row in &rows {
        let idx_name = match row.get(0).and_then(|v| v.as_deref()) {
            Some(s) => s.to_owned(),
            None => continue,
        };
        let col_name = match row.get(1).and_then(|v| v.as_deref()) {
            Some(s) => s.to_owned(),
            None => continue,
        };
        let is_unique = row.get(2).and_then(|v| v.as_deref()) == Some("1");
        let idx_type = row
            .get(4)
            .and_then(|v| v.as_deref())
            .unwrap_or("NONCLUSTERED")
            .to_owned();
        let entry = map.entry(idx_name).or_insert((is_unique, idx_type, vec![]));
        entry.2.push(col_name);
    }

    let mut items: Vec<IndexInfo> = map
        .into_iter()
        .map(|(name, (is_unique, idx_type, cols))| IndexInfo {
            name,
            columns: cols,
            is_unique,
            index_type: idx_type,
        })
        .collect();

    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

pub async fn fetch_foreign_keys(
    client: &mut MssqlConn,
    table: &str,
    schema: &str,
) -> Result<Vec<ForeignKeyInfo>, DriverError> {
    let schema = if schema.is_empty() { "dbo" } else { schema };
    let bt = escape_bracket(table);
    let bs = escape_bracket(schema);
    let full = format!("[{bs}].[{bt}]");
    let sql = format!(
        "SELECT fk.name AS fk_name, \
            COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name, \
            OBJECT_NAME(fk.referenced_object_id) AS referenced_table, \
            COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column \
         FROM sys.foreign_keys fk \
         JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id \
         WHERE fk.parent_object_id = OBJECT_ID('{full}') \
         ORDER BY fk.name"
    );

    let (_, rows, _) = execute_simple(client, &sql).await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let name = row.get(0)?.clone()?;
            let column = row.get(1)?.clone()?;
            let ref_table = row.get(2)?.clone()?;
            let ref_col = row.get(3)?.clone()?;
            Some(ForeignKeyInfo {
                name,
                column,
                referenced_table: ref_table,
                referenced_column: ref_col,
            })
        })
        .collect())
}
