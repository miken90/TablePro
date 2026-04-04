use redis::cmd;
use tablepro_plugin_sdk::FfiQueryResult;

use crate::driver::RedisDriver;
use crate::ffi_helpers::{build_query_result, err_query_result, message_result};

pub fn cmd_ping(driver: &mut RedisDriver) -> FfiQueryResult {
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("PING").query::<String>(conn) {
        Ok(s) => message_result(&s),
        Err(e) => err_query_result(format!("PING failed: {e}")),
    }
}

pub fn cmd_info(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("INFO");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<String>(conn) {
        Ok(info) => {
            let columns = vec![
                ("Property".to_string(), "string".to_string(), false, false),
                ("Value".to_string(), "string".to_string(), true, false),
            ];
            let rows: Vec<Vec<Option<String>>> = info
                .lines()
                .filter(|line| !line.is_empty() && !line.starts_with('#'))
                .filter_map(|line| {
                    let mut parts = line.splitn(2, ':');
                    let key = parts.next()?.to_string();
                    let val = parts.next().unwrap_or("").to_string();
                    Some(vec![Some(key), Some(val)])
                })
                .collect();
            build_query_result(columns, rows, 0)
        }
        Err(e) => err_query_result(format!("INFO failed: {e}")),
    }
}

pub fn cmd_dbsize(driver: &mut RedisDriver) -> FfiQueryResult {
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("DBSIZE").query::<i64>(conn) {
        Ok(size) => message_result(&format!("(integer) {size}")),
        Err(e) => err_query_result(format!("DBSIZE failed: {e}")),
    }
}

pub fn cmd_select(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: SELECT db_index".to_string());
    }
    let db: u16 = match args[0].parse() {
        Ok(v) => v,
        Err(_) => return err_query_result("Database index must be a number".to_string()),
    };
    match driver.select_db(db) {
        Ok(()) => message_result("OK"),
        Err(e) => err_query_result(e),
    }
}

pub fn cmd_config(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: CONFIG GET pattern | CONFIG SET param value".to_string());
    }
    let sub = args[0].to_uppercase();
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };

    match sub.as_str() {
        "GET" => {
            if args.len() < 2 {
                return err_query_result("Usage: CONFIG GET pattern".to_string());
            }
            match cmd("CONFIG")
                .arg("GET")
                .arg(&args[1])
                .query::<Vec<String>>(conn)
            {
                Ok(pairs) => {
                    let columns = vec![
                        ("Parameter".to_string(), "string".to_string(), false, false),
                        ("Value".to_string(), "string".to_string(), true, false),
                    ];
                    let mut rows: Vec<Vec<Option<String>>> = Vec::new();
                    let mut i = 0;
                    while i + 1 < pairs.len() {
                        rows.push(vec![
                            Some(pairs[i].clone()),
                            Some(pairs[i + 1].clone()),
                        ]);
                        i += 2;
                    }
                    build_query_result(columns, rows, 0)
                }
                Err(e) => err_query_result(format!("CONFIG GET failed: {e}")),
            }
        }
        "SET" => {
            if args.len() < 3 {
                return err_query_result("Usage: CONFIG SET parameter value".to_string());
            }
            match cmd("CONFIG")
                .arg("SET")
                .arg(&args[1])
                .arg(&args[2])
                .query::<String>(conn)
            {
                Ok(s) => message_result(&s),
                Err(e) => err_query_result(format!("CONFIG SET failed: {e}")),
            }
        }
        _ => err_query_result(format!("Unsupported CONFIG subcommand: {sub}")),
    }
}

pub fn cmd_flushdb(driver: &mut RedisDriver) -> FfiQueryResult {
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("FLUSHDB").query::<String>(conn) {
        Ok(s) => message_result(&s),
        Err(e) => err_query_result(format!("FLUSHDB failed: {e}")),
    }
}
