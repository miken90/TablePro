//! Table and column schema queries for the MSSQL driver.
#![allow(clippy::get_first)]

use tablepro_plugin_sdk::{
    FfiColumnInfo, FfiColumnList, FfiString, FfiStringList, FfiTableInfo, FfiTableList,
};

use crate::driver::MssqlDriver;
use crate::ffi::string_to_ffi;

pub use crate::schema_indexes::{fetch_foreign_keys, fetch_indexes};

fn escape_sq(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn fetch_tables(driver: &MssqlDriver) -> FfiTableList {
    let sql = "SELECT TABLE_NAME, TABLE_SCHEMA, TABLE_TYPE \
               FROM INFORMATION_SCHEMA.TABLES \
               WHERE TABLE_CATALOG = DB_NAME() \
               ORDER BY TABLE_NAME";

    match driver.execute_query(sql) {
        Err(e) => FfiTableList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e),
        },
        Ok((_, rows, _)) => {
            let mut items: Vec<FfiTableInfo> = rows
                .into_iter()
                .filter_map(|row| {
                    let name = row.get(0)?.clone()?;
                    let schema = row.get(1)?.clone().unwrap_or_default();
                    let raw_type = row.get(2)?.clone().unwrap_or_default();
                    let table_type = if raw_type == "VIEW" { "VIEW" } else { "TABLE" };
                    Some(FfiTableInfo {
                        name: string_to_ffi(name),
                        schema: string_to_ffi(schema),
                        table_type: string_to_ffi(table_type.to_owned()),
                        row_count_estimate: 0,
                        has_row_count: false,
                    })
                })
                .collect();
            let count = items.len();
            let ptr = items.as_mut_ptr();
            std::mem::forget(items);
            FfiTableList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
    }
}

pub fn fetch_columns(driver: &MssqlDriver, table: &str, schema: &str) -> FfiColumnList {
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

    match driver.execute_query(&sql) {
        Err(e) => FfiColumnList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e),
        },
        Ok((_, rows, _)) => {
            let mut items: Vec<FfiColumnInfo> = rows
                .into_iter()
                .filter_map(|row| {
                    let name = row.get(0)?.clone()?;
                    let type_name = row.get(1)?.clone().unwrap_or_default();
                    let nullable = row.get(2)?.as_deref() == Some("YES");
                    let is_pk = row.get(5)?.as_deref() == Some("1");
                    Some(FfiColumnInfo {
                        name: string_to_ffi(name),
                        type_name: string_to_ffi(type_name),
                        nullable,
                        is_primary_key: is_pk,
                    })
                })
                .collect();
            let count = items.len();
            let ptr = items.as_mut_ptr();
            std::mem::forget(items);
            FfiColumnList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
    }
}

pub fn fetch_databases(driver: &MssqlDriver) -> FfiStringList {
    let sql = "SELECT name FROM sys.databases ORDER BY name";
    match driver.execute_query(sql) {
        Err(e) => FfiStringList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(e),
        },
        Ok((_, rows, _)) => {
            let mut items: Vec<FfiString> = rows
                .into_iter()
                .filter_map(|row| row.into_iter().next()?.map(string_to_ffi))
                .collect();
            let count = items.len();
            let ptr = items.as_mut_ptr();
            std::mem::forget(items);
            FfiStringList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
    }
}

pub fn fetch_ddl(driver: &MssqlDriver, table: &str, schema: &str) -> FfiString {
    crate::ddl::fetch_ddl(driver, table, schema)
}
