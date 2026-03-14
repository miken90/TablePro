use crate::driver::PostgresDriver;
use crate::ffi_helpers::string_to_ffi;
use tablepro_plugin_sdk::{
    DriverHandle, FfiStr, FfiString,
    FfiColumnList, FfiColumnInfo,
    FfiIndexList, FfiIndexInfo,
    FfiForeignKeyList, FfiForeignKeyInfo,
    FfiStringList,
};

pub unsafe fn fetch_columns(handle: *mut DriverHandle, table: FfiStr, schema: FfiStr) -> FfiColumnList {
    let driver = &mut *(handle as *mut PostgresDriver);
    let table_name = table.as_str().to_owned();
    let schema_name = if schema.len == 0 { "public".to_string() } else { schema.as_str().to_owned() };
    let client = match driver.client {
        None => return FfiColumnList { items: std::ptr::null_mut(), count: 0,
                                       error: string_to_ffi("Not connected".to_string()) },
        Some(ref c) => c as *const tokio_postgres::Client,
    };
    driver.runtime.block_on(async {
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
            schema_name, table_name, schema_name, table_name
        );
        match (*client).query(&sql as &str, &[]).await {
            Err(e) => FfiColumnList { items: std::ptr::null_mut(), count: 0, error: string_to_ffi(e.to_string()) },
            Ok(rows) => {
                let mut items: Vec<FfiColumnInfo> = rows.iter().map(|row| {
                    let name: String = row.try_get(0).unwrap_or_default();
                    let raw_type: String = row.try_get(1).unwrap_or_default();
                    let nullable_str: String = row.try_get(2).unwrap_or_default();
                    let udt_name: String = row.try_get(3).unwrap_or_default();
                    let is_pk_str: String = row.try_get(4).unwrap_or_default();
                    let type_name = if raw_type.to_uppercase() == "USER-DEFINED" {
                        format!("ENUM({})", udt_name)
                    } else {
                        raw_type.to_uppercase()
                    };
                    FfiColumnInfo {
                        name: string_to_ffi(name),
                        type_name: string_to_ffi(type_name),
                        nullable: nullable_str == "YES",
                        is_primary_key: is_pk_str == "YES",
                    }
                }).collect();
                let ptr = items.as_mut_ptr();
                let count = items.len();
                std::mem::forget(items);
                FfiColumnList { items: ptr, count, error: FfiString::null() }
            }
        }
    })
}

pub unsafe fn fetch_indexes(handle: *mut DriverHandle, table: FfiStr, _schema: FfiStr) -> FfiIndexList {
    let driver = &mut *(handle as *mut PostgresDriver);
    let table_name = table.as_str().to_owned();
    let client = match driver.client {
        None => return FfiIndexList { items: std::ptr::null_mut(), count: 0,
                                      error: string_to_ffi("Not connected".to_string()) },
        Some(ref c) => c as *const tokio_postgres::Client,
    };
    driver.runtime.block_on(async {
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
            table_name
        );
        match (*client).query(&sql as &str, &[]).await {
            Err(e) => FfiIndexList { items: std::ptr::null_mut(), count: 0, error: string_to_ffi(e.to_string()) },
            Ok(rows) => {
                let mut items: Vec<FfiIndexInfo> = rows.iter().map(|row| {
                    let name: String = row.try_get(0).unwrap_or_default();
                    let cols_str: String = row.try_get::<_, Option<String>>(1)
                        .unwrap_or(None).unwrap_or_default();
                    let is_unique: bool = row.try_get(2).unwrap_or(false);
                    let index_type: String = row.try_get(3).unwrap_or_default();
                    let col_names: Vec<String> = cols_str
                        .trim_matches(|c: char| c == '{' || c == '}')
                        .split(',')
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .collect();
                    let mut ffi_cols: Vec<FfiString> = col_names.into_iter().map(string_to_ffi).collect();
                    let col_ptr = ffi_cols.as_mut_ptr();
                    let col_count = ffi_cols.len();
                    std::mem::forget(ffi_cols);
                    FfiIndexInfo {
                        name: string_to_ffi(name),
                        columns: col_ptr,
                        column_count: col_count,
                        is_unique,
                        index_type: string_to_ffi(index_type.to_uppercase()),
                    }
                }).collect();
                let ptr = items.as_mut_ptr();
                let count = items.len();
                std::mem::forget(items);
                FfiIndexList { items: ptr, count, error: FfiString::null() }
            }
        }
    })
}

pub unsafe fn fetch_foreign_keys(handle: *mut DriverHandle, table: FfiStr, _schema: FfiStr) -> FfiForeignKeyList {
    let driver = &mut *(handle as *mut PostgresDriver);
    let table_name = table.as_str().to_owned();
    let client = match driver.client {
        None => return FfiForeignKeyList { items: std::ptr::null_mut(), count: 0,
                                           error: string_to_ffi("Not connected".to_string()) },
        Some(ref c) => c as *const tokio_postgres::Client,
    };
    driver.runtime.block_on(async {
        let sql = format!(
            "SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS referenced_table, \
             ccu.column_name AS referenced_column \
             FROM information_schema.table_constraints tc \
             JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name \
             JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name \
             JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name \
             WHERE tc.table_name = '{}' AND tc.constraint_type = 'FOREIGN KEY' \
             ORDER BY tc.constraint_name",
            table_name
        );
        match (*client).query(&sql as &str, &[]).await {
            Err(e) => FfiForeignKeyList { items: std::ptr::null_mut(), count: 0, error: string_to_ffi(e.to_string()) },
            Ok(rows) => {
                let mut items: Vec<FfiForeignKeyInfo> = rows.iter().map(|row| {
                    let name: String = row.try_get(0).unwrap_or_default();
                    let col: String = row.try_get(1).unwrap_or_default();
                    let ref_table: String = row.try_get(2).unwrap_or_default();
                    let ref_col: String = row.try_get(3).unwrap_or_default();
                    FfiForeignKeyInfo {
                        name: string_to_ffi(name),
                        column: string_to_ffi(col),
                        referenced_table: string_to_ffi(ref_table),
                        referenced_column: string_to_ffi(ref_col),
                    }
                }).collect();
                let ptr = items.as_mut_ptr();
                let count = items.len();
                std::mem::forget(items);
                FfiForeignKeyList { items: ptr, count, error: FfiString::null() }
            }
        }
    })
}

pub unsafe fn fetch_databases(handle: *mut DriverHandle) -> FfiStringList {
    let driver = &mut *(handle as *mut PostgresDriver);
    let client = match driver.client {
        None => return FfiStringList { items: std::ptr::null_mut(), count: 0,
                                       error: string_to_ffi("Not connected".to_string()) },
        Some(ref c) => c as *const tokio_postgres::Client,
    };
    driver.runtime.block_on(async {
        let sql = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname";
        match (*client).query(sql, &[]).await {
            Err(e) => FfiStringList { items: std::ptr::null_mut(), count: 0, error: string_to_ffi(e.to_string()) },
            Ok(rows) => {
                let mut items: Vec<FfiString> = rows.iter()
                    .map(|row| row.try_get::<_, String>(0).unwrap_or_default())
                    .map(string_to_ffi)
                    .collect();
                let ptr = items.as_mut_ptr();
                let count = items.len();
                std::mem::forget(items);
                FfiStringList { items: ptr, count, error: FfiString::null() }
            }
        }
    })
}

pub unsafe fn fetch_ddl(handle: *mut DriverHandle, table: FfiStr, schema: FfiStr) -> FfiString {
    let driver = &mut *(handle as *mut PostgresDriver);
    let table_name = table.as_str().to_owned();
    let schema_name = if schema.len == 0 { "public".to_string() } else { schema.as_str().to_owned() };
    let client = match driver.client {
        None => return string_to_ffi("ERROR: Not connected".to_string()),
        Some(ref c) => c as *const tokio_postgres::Client,
    };

    driver.runtime.block_on(async {
        let safe_table = table_name.replace('\'', "''");
        let safe_schema = schema_name.replace('\'', "''");

        let cols_sql = format!(
            "SELECT quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) || \
             CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END || \
             CASE WHEN a.atthasdef THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) ELSE '' END \
             FROM pg_attribute a \
             JOIN pg_class c ON c.oid = a.attrelid \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum \
             WHERE c.relname = '{}' AND n.nspname = '{}' AND a.attnum > 0 AND NOT a.attisdropped \
             ORDER BY a.attnum",
            safe_table, safe_schema
        );
        let cons_sql = format!(
            "SELECT pg_get_constraintdef(con.oid, true) \
             FROM pg_constraint con \
             JOIN pg_class c ON c.oid = con.conrelid \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE c.relname = '{}' AND n.nspname = '{}' AND con.contype IN ('p','u','c','f') \
             ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 WHEN 'f' THEN 3 END",
            safe_table, safe_schema
        );
        let idx_sql = format!(
            "SELECT indexdef FROM pg_indexes \
             WHERE tablename = '{}' AND schemaname = '{}' \
             AND indexname NOT IN ( \
               SELECT conname FROM pg_constraint \
               JOIN pg_class ON pg_class.oid = conrelid \
               JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace \
               WHERE pg_class.relname = '{}' AND pg_namespace.nspname = '{}' \
             ) ORDER BY indexname",
            safe_table, safe_schema, safe_table, safe_schema
        );

        let cols_res = (*client).query(&cols_sql as &str, &[]).await;
        let cons_res = (*client).query(&cons_sql as &str, &[]).await;
        let idx_res  = (*client).query(&idx_sql  as &str, &[]).await;

        let col_defs: Vec<String> = match cols_res {
            Err(e) => return string_to_ffi(format!("ERROR: {}", e)),
            Ok(rows) => rows.iter()
                .map(|r: &tokio_postgres::Row| r.try_get::<_, String>(0).unwrap_or_default())
                .collect(),
        };
        if col_defs.is_empty() {
            return string_to_ffi(format!("ERROR: No columns found for '{}'", table_name));
        }
        let constraints: Vec<String> = cons_res
            .unwrap_or_default().iter()
            .map(|r: &tokio_postgres::Row| r.try_get::<_, String>(0).unwrap_or_default())
            .collect();
        let index_defs: Vec<String> = idx_res
            .unwrap_or_default().iter()
            .map(|r: &tokio_postgres::Row| r.try_get::<_, String>(0).unwrap_or_default())
            .collect();

        let quoted_schema = format!("\"{}\"", schema_name.replace('"', "\"\""));
        let quoted_table  = format!("\"{}\"", table_name.replace('"', "\"\""));

        let mut parts = col_defs;
        parts.extend(constraints);
        let mut ddl = format!(
            "CREATE TABLE {}.{} (\n  {}\n);",
            quoted_schema, quoted_table, parts.join(",\n  ")
        );
        if !index_defs.is_empty() {
            ddl.push_str("\n\n");
            ddl.push_str(&index_defs.join(";\n"));
            ddl.push(';');
        }
        string_to_ffi(ddl)
    })
}
