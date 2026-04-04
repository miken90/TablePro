use redis::{cmd, Value};
use tablepro_plugin_sdk::FfiQueryResult;

use crate::driver::RedisDriver;
use crate::ffi_helpers::{build_query_result, err_query_result, message_result};
use crate::ops_basic::format_value;

pub fn cmd_hget(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: HGET key field".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("HGET").arg(&args[0]).arg(&args[1]).query::<Value>(conn) {
        Ok(v) => message_result(&format_value(&v)),
        Err(e) => err_query_result(format!("HGET failed: {e}")),
    }
}

pub fn cmd_hset(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 3 {
        return err_query_result("Usage: HSET key field value [field value ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("HSET");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("HSET failed: {e}")),
    }
}

pub fn cmd_hgetall(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: HGETALL key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("HGETALL").arg(&args[0]).query::<Vec<String>>(conn) {
        Ok(pairs) => {
            let columns = vec![
                ("Field".to_string(), "string".to_string(), false, false),
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
        Err(e) => err_query_result(format!("HGETALL failed: {e}")),
    }
}

pub fn cmd_hdel(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: HDEL key field [field ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("HDEL");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("HDEL failed: {e}")),
    }
}
