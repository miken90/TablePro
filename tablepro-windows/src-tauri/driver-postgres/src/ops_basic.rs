use crate::driver::PostgresDriver;
use crate::ffi_helpers::{ok_result, err_result, build_query_result, err_query_result, string_to_ffi};
use tablepro_plugin_sdk::{
    DriverHandle, FfiStr, FfiResult, FfiQueryResult,
    FfiString, FfiTableList, FfiTableInfo,
};

pub unsafe fn connect(handle: *mut DriverHandle) -> FfiResult {
    let driver = &mut *(handle as *mut PostgresDriver);
    let ssl_mode = driver.ssl_mode.clone();
    let config = driver.build_config();

    let result: Result<tokio_postgres::Client, String> = driver.runtime.block_on(async {
        if ssl_mode == "disable" {
            config.connect(tokio_postgres::NoTls).await
                .map(|(client, conn)| {
                    tokio::spawn(async move { let _ = conn.await; });
                    client
                })
                .map_err(|e| e.to_string())
        } else {
            let mut builder = native_tls::TlsConnector::builder();
            if ssl_mode == "prefer" || ssl_mode == "require" {
                builder.danger_accept_invalid_certs(true);
                builder.danger_accept_invalid_hostnames(true);
            }
            let tls_connector = builder.build().map_err(|e| format!("TLS build error: {e}"))?;
            let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
            config.connect(connector).await
                .map(|(client, conn)| {
                    tokio::spawn(async move { let _ = conn.await; });
                    client
                })
                .map_err(|e| e.to_string())
        }
    });

    match result {
        Ok(client) => { driver.client = Some(client); ok_result() }
        Err(e) => err_result(e),
    }
}

pub unsafe fn disconnect(handle: *mut DriverHandle) {
    let driver = &mut *(handle as *mut PostgresDriver);
    driver.client = None;
}

pub unsafe fn ping(handle: *mut DriverHandle) -> FfiResult {
    let driver = &mut *(handle as *mut PostgresDriver);
    let client = match driver.client {
        None => return err_result("Not connected".to_string()),
        Some(ref c) => c as *const tokio_postgres::Client,
    };
    driver.runtime.block_on(async {
        match (*client).simple_query("SELECT 1").await {
            Ok(_) => ok_result(),
            Err(e) => err_result(e.to_string()),
        }
    })
}

pub unsafe fn execute(handle: *mut DriverHandle, sql: FfiStr) -> FfiQueryResult {
    let driver = &mut *(handle as *mut PostgresDriver);
    let sql_str = sql.as_str().to_owned();
    let client = match driver.client {
        None => return err_query_result("Not connected".to_string()),
        Some(ref c) => c as *const tokio_postgres::Client,
    };
    driver.runtime.block_on(async {
        match (*client).query(&sql_str as &str, &[]).await {
            Err(e) => err_query_result(e.to_string()),
            Ok(rows) => {
                if rows.is_empty() {
                    let affected = match (*client).execute(&sql_str as &str, &[]).await {
                        Ok(n) => n as i64,
                        Err(_) => 0,
                    };
                    return build_query_result(vec![], vec![], affected);
                }
                let first = &rows[0];
                let columns: Vec<(String, String, bool, bool)> = first
                    .columns()
                    .iter()
                    .map(|c| (c.name().to_string(), c.type_().name().to_string(), true, false))
                    .collect();
                let col_count = columns.len();
                let data_rows: Vec<Vec<Option<String>>> = rows
                    .iter()
                    .map(|row| {
                        (0..col_count)
                            .map(|i| row.try_get::<_, Option<String>>(i).ok().flatten())
                            .collect()
                    })
                    .collect();
                build_query_result(columns, data_rows, 0)
            }
        }
    })
}

pub unsafe fn cancel(_handle: *mut DriverHandle) -> FfiResult {
    err_result("Cancel not supported in this version".to_string())
}

pub unsafe fn fetch_tables(handle: *mut DriverHandle) -> FfiTableList {
    let driver = &mut *(handle as *mut PostgresDriver);
    let client = match driver.client {
        None => return FfiTableList { items: std::ptr::null_mut(), count: 0,
                                      error: string_to_ffi("Not connected".to_string()) },
        Some(ref c) => c as *const tokio_postgres::Client,
    };
    driver.runtime.block_on(async {
        let sql = "SELECT table_name, table_type, table_schema \
                   FROM information_schema.tables \
                   WHERE table_schema NOT IN ('pg_catalog','information_schema') \
                   ORDER BY table_schema, table_name";
        match (*client).query(sql, &[]).await {
            Err(e) => FfiTableList { items: std::ptr::null_mut(), count: 0,
                                     error: string_to_ffi(e.to_string()) },
            Ok(rows) => {
                let mut items: Vec<FfiTableInfo> = rows.iter().map(|row| {
                    let name: String = row.try_get(0).unwrap_or_default();
                    let type_raw: String = row.try_get(1).unwrap_or_default();
                    let schema: String = row.try_get(2).unwrap_or_default();
                    let table_type = if type_raw.contains("VIEW") { "VIEW" } else { "TABLE" };
                    FfiTableInfo {
                        name: string_to_ffi(name),
                        schema: string_to_ffi(schema),
                        table_type: string_to_ffi(table_type.to_string()),
                        row_count_estimate: 0,
                        has_row_count: false,
                    }
                }).collect();
                let ptr = items.as_mut_ptr();
                let count = items.len();
                std::mem::forget(items);
                FfiTableList { items: ptr, count, error: FfiString::null() }
            }
        }
    })
}
