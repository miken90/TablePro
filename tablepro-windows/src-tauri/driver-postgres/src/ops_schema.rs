//! Schema introspection: tables, columns, indexes, foreign keys, databases, DDL.

use driver_common::{ColumnInfo, DriverError, ForeignKeyInfo, IndexInfo, TableInfo};
use tokio_postgres::Client;

pub async fn fetch_tables(client: &Client) -> Result<Vec<TableInfo>, DriverError> {
    let sql = "SELECT table_name, table_type, table_schema \
               FROM information_schema.tables \
               WHERE table_schema NOT IN ('pg_catalog','information_schema') \
               ORDER BY table_schema, table_name";
    let rows = client
        .query(sql, &[])
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows
        .iter()
        .map(|row| {
            let name: String = row.try_get(0).unwrap_or_default();
            let type_raw: String = row.try_get(1).unwrap_or_default();
            let schema: String = row.try_get(2).unwrap_or_default();
            let table_type = if type_raw.contains("VIEW") { "VIEW" } else { "TABLE" };
            TableInfo {
                name,
                schema: if schema.is_empty() { None } else { Some(schema) },
                table_type: table_type.to_string(),
                row_count_estimate: None,
            }
        })
        .collect())
}

pub async fn fetch_columns(
    client: &Client,
    table: &str,
    schema: Option<&str>,
) -> Result<Vec<ColumnInfo>, DriverError> {
    let schema_name = schema.unwrap_or("public");
    let sql = format!(
        "SELECT c.column_name, c.data_type, c.is_nullable, c.udt_name, \
         CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_pk \
         FROM information_schema.columns c \
         LEFT JOIN ( \
           SELECT DISTINCT kcu.column_name \
           FROM information_schema.table_constraints tc \
           JOIN information_schema.key_column_usage kcu \
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema \
           WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '{}' AND tc.table_name = '{}' \
         ) pk ON c.column_name = pk.column_name \
         WHERE c.table_schema = '{}' AND c.table_name = '{}' \
         ORDER BY c.ordinal_position",
        schema_name, table, schema_name, table
    );
    let rows = client
        .query(sql.as_str(), &[])
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows
        .iter()
        .map(|row| {
            let name: String = row.try_get(0).unwrap_or_default();
            let raw_type: String = row.try_get(1).unwrap_or_default();
            let nullable_str: String = row.try_get(2).unwrap_or_default();
            let udt_name: String = row.try_get(3).unwrap_or_default();
            let is_pk_str: String = row.try_get(4).unwrap_or_default();
            let type_name = if raw_type.to_uppercase() == "USER-DEFINED" {
                format!("ENUM({udt_name})")
            } else {
                raw_type.to_uppercase()
            };
            ColumnInfo {
                name,
                type_name,
                nullable: nullable_str == "YES",
                is_primary_key: is_pk_str == "YES",
            }
        })
        .collect())
}

pub async fn fetch_indexes(
    client: &Client,
    table: &str,
    _schema: Option<&str>,
) -> Result<Vec<IndexInfo>, DriverError> {
    let sql = format!(
        "SELECT i.relname AS index_name, \
         ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns, \
         ix.indisunique AS is_unique, am.amname AS index_type \
         FROM pg_index ix \
         JOIN pg_class i ON i.oid = ix.indexrelid \
         JOIN pg_class t ON t.oid = ix.indrelid \
         JOIN pg_am am ON am.oid = i.relam \
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) \
         WHERE t.relname = '{}' \
         GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname \
         ORDER BY ix.indisprimary DESC, i.relname",
        table
    );
    let rows = client
        .query(sql.as_str(), &[])
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows
        .iter()
        .map(|row| {
            let name: String = row.try_get(0).unwrap_or_default();
            let cols: Vec<String> = row.try_get(1).unwrap_or_default();
            let is_unique: bool = row.try_get(2).unwrap_or(false);
            let index_type: String = row.try_get(3).unwrap_or_default();
            IndexInfo {
                name,
                columns: cols,
                is_unique,
                index_type: index_type.to_uppercase(),
            }
        })
        .collect())
}

pub async fn fetch_foreign_keys(
    client: &Client,
    table: &str,
    _schema: Option<&str>,
) -> Result<Vec<ForeignKeyInfo>, DriverError> {
    let sql = format!(
        "SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS referenced_table, \
         ccu.column_name AS referenced_column \
         FROM information_schema.table_constraints tc \
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name \
         JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name \
         JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name \
         WHERE tc.table_name = '{}' AND tc.constraint_type = 'FOREIGN KEY' \
         ORDER BY tc.constraint_name",
        table
    );
    let rows = client
        .query(sql.as_str(), &[])
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows
        .iter()
        .map(|row| ForeignKeyInfo {
            name: row.try_get(0).unwrap_or_default(),
            column: row.try_get(1).unwrap_or_default(),
            referenced_table: row.try_get(2).unwrap_or_default(),
            referenced_column: row.try_get(3).unwrap_or_default(),
        })
        .collect())
}

pub async fn fetch_databases(client: &Client) -> Result<Vec<String>, DriverError> {
    let sql = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname";
    let rows = client
        .query(sql, &[])
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;

    Ok(rows
        .iter()
        .map(|row| row.try_get::<_, String>(0).unwrap_or_default())
        .collect())
}

pub async fn fetch_ddl(
    client: &Client,
    table: &str,
    schema: Option<&str>,
) -> Result<String, DriverError> {
    let schema_name = schema.unwrap_or("public");
    let safe_table = table.replace('\'', "''");
    let safe_schema = schema_name.replace('\'', "''");

    let cols_sql = format!(
        "SELECT quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) || \
         CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END || \
         CASE WHEN a.atthasdef THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) ELSE '' END \
         FROM pg_attribute a \
         JOIN pg_class c ON c.oid = a.attrelid \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum \
         WHERE c.relname = '{safe_table}' AND n.nspname = '{safe_schema}' \
         AND a.attnum > 0 AND NOT a.attisdropped \
         ORDER BY a.attnum"
    );
    let cons_sql = format!(
        "SELECT pg_get_constraintdef(con.oid, true) \
         FROM pg_constraint con \
         JOIN pg_class c ON c.oid = con.conrelid \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE c.relname = '{safe_table}' AND n.nspname = '{safe_schema}' \
         AND con.contype IN ('p','u','c','f') \
         ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 WHEN 'f' THEN 3 END"
    );
    let idx_sql = format!(
        "SELECT indexdef FROM pg_indexes \
         WHERE tablename = '{safe_table}' AND schemaname = '{safe_schema}' \
         AND indexname NOT IN ( \
           SELECT conname FROM pg_constraint \
           JOIN pg_class ON pg_class.oid = conrelid \
           JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace \
           WHERE pg_class.relname = '{safe_table}' AND pg_namespace.nspname = '{safe_schema}' \
         ) ORDER BY indexname"
    );

    let cols_rows = client
        .query(cols_sql.as_str(), &[])
        .await
        .map_err(|e| DriverError::Query(e.to_string()))?;
    let cons_rows = client
        .query(cons_sql.as_str(), &[])
        .await
        .unwrap_or_default();
    let idx_rows = client
        .query(idx_sql.as_str(), &[])
        .await
        .unwrap_or_default();

    let col_defs: Vec<String> = cols_rows
        .iter()
        .map(|r| r.try_get::<_, String>(0).unwrap_or_default())
        .collect();
    if col_defs.is_empty() {
        return Err(DriverError::Query(format!(
            "No columns found for '{table}'"
        )));
    }
    let constraints: Vec<String> = cons_rows
        .iter()
        .map(|r| r.try_get::<_, String>(0).unwrap_or_default())
        .collect();
    let index_defs: Vec<String> = idx_rows
        .iter()
        .map(|r| r.try_get::<_, String>(0).unwrap_or_default())
        .collect();

    let quoted_schema = format!("\"{}\"", schema_name.replace('"', "\"\""));
    let quoted_table = format!("\"{}\"", table.replace('"', "\"\""));

    let mut parts = col_defs;
    parts.extend(constraints);
    let mut ddl = format!(
        "CREATE TABLE {}.{} (\n  {}\n);",
        quoted_schema,
        quoted_table,
        parts.join(",\n  ")
    );
    if !index_defs.is_empty() {
        ddl.push_str("\n\n");
        ddl.push_str(&index_defs.join(";\n"));
        ddl.push(';');
    }
    Ok(ddl)
}
