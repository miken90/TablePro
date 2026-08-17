//! Table and column schema queries for the MSSQL driver.
#![allow(clippy::get_first)]

use driver_common::{ColumnInfo, DriverError, TableInfo};

use crate::{execute_simple, MssqlConn};

fn escape_sq(s: &str) -> String {
    s.replace('\'', "''")
}

pub async fn fetch_tables(client: &mut MssqlConn) -> Result<Vec<TableInfo>, DriverError> {
    let sql = "SELECT TABLE_NAME, TABLE_SCHEMA, TABLE_TYPE \
               FROM INFORMATION_SCHEMA.TABLES \
               WHERE TABLE_CATALOG = DB_NAME() \
               ORDER BY TABLE_NAME";

    let (_, rows, _) = execute_simple(client, sql).await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let name = row.get(0)?.clone()?;
            let schema = row.get(1)?.clone().unwrap_or_default();
            let raw_type = row.get(2)?.clone().unwrap_or_default();
            let table_type = if raw_type == "VIEW" { "VIEW" } else { "TABLE" };
            Some(TableInfo {
                name,
                schema: if schema.is_empty() { None } else { Some(schema) },
                table_type: table_type.to_owned(),
                row_count_estimate: None,
            })
        })
        .collect())
}

pub async fn fetch_columns(
    client: &mut MssqlConn,
    table: &str,
    schema: &str,
) -> Result<Vec<ColumnInfo>, DriverError> {
    let schema = if schema.is_empty() { "dbo" } else { schema };
    let et = escape_sq(table);
    let es = escape_sq(schema);
    let sql = format!(
        "SELECT \
            c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT, \
            COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as is_identity, \
            CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as is_pk \
        FROM INFORMATION_SCHEMA.COLUMNS c \
        LEFT JOIN ( \
            SELECT ku.COLUMN_NAME \
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc \
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME \
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = '{et}' AND tc.TABLE_SCHEMA = '{es}' \
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME \
        WHERE c.TABLE_NAME = '{et}' AND c.TABLE_SCHEMA = '{es}' \
        ORDER BY c.ORDINAL_POSITION"
    );

    let (_, rows, _) = execute_simple(client, &sql).await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let name = row.get(0)?.clone()?;
            let type_name = row.get(1)?.clone().unwrap_or_default();
            let nullable = row.get(2)?.as_deref() == Some("YES");
            let is_pk = row.get(5)?.as_deref() == Some("1");
            Some(ColumnInfo {
                name,
                type_name,
                nullable,
                is_primary_key: is_pk,
            })
        })
        .collect())
}

pub async fn fetch_databases(client: &mut MssqlConn) -> Result<Vec<String>, DriverError> {
    let sql = "SELECT name FROM sys.databases ORDER BY name";
    let (_, rows, _) = execute_simple(client, sql).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.into_iter().next()?)
        .collect())
}
