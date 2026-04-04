use redis::{cmd, Value};
use tablepro_plugin_sdk::{DriverHandle, FfiQueryResult, FfiResult, FfiStr};

use crate::command_parser::{parse_command, RedisCommand};
use crate::driver::RedisDriver;
use crate::ffi_helpers::{err_query_result, err_result, ok_result};
use crate::ops_key;
use crate::ops_hash;
use crate::ops_collection;
use crate::ops_server;

// ── Connection lifecycle ─────────────────────────────────────────────────────

pub unsafe fn connect(handle: *mut DriverHandle) -> FfiResult {
    let driver = &mut *(handle as *mut RedisDriver);
    match driver.connect() {
        Ok(()) => ok_result(),
        Err(e) => err_result(e),
    }
}

pub unsafe fn disconnect(handle: *mut DriverHandle) {
    let driver = &mut *(handle as *mut RedisDriver);
    driver.connection = None;
}

pub unsafe fn ping(handle: *mut DriverHandle) -> FfiResult {
    let driver = &mut *(handle as *mut RedisDriver);
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_result(e),
    };
    match cmd("PING").query::<String>(conn) {
        Ok(ref s) if s == "PONG" => ok_result(),
        Ok(s) => err_result(format!("Unexpected PING response: {s}")),
        Err(e) => err_result(format!("PING failed: {e}")),
    }
}

pub unsafe fn cancel(_handle: *mut DriverHandle) -> FfiResult {
    err_result("Cancel not supported for Redis".to_string())
}

// ── Execute ──────────────────────────────────────────────────────────────────

/// Execute a Redis command. The input is either:
/// 1. A JSON browse command: `{"action":"scan","pattern":"*","count":200,"db":0}`
/// 2. A Redis CLI text command: `GET foo`, `HGETALL myhash`, etc.
pub unsafe fn execute(handle: *mut DriverHandle, sql: FfiStr) -> FfiQueryResult {
    let driver = &mut *(handle as *mut RedisDriver);
    let input = sql.as_str().trim().to_owned();

    if driver.connection.is_none() {
        return err_query_result("Not connected".to_string());
    }

    // Try JSON browse command first
    if input.starts_with('{') {
        return execute_browse_command(driver, &input);
    }

    // Otherwise parse as Redis CLI command
    let command = match parse_command(&input) {
        Ok(c) => c,
        Err(e) => return err_query_result(format!("Parse error: {e}")),
    };

    dispatch_command(driver, &command)
}

/// Execute a JSON browse command for the key browser UI.
fn execute_browse_command(driver: &mut RedisDriver, input: &str) -> FfiQueryResult {
    let json: serde_json::Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(e) => return err_query_result(format!("Invalid JSON: {e}")),
    };

    let action = json
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match action {
        "scan" => {
            let pattern = json
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("*");
            let count: usize = json
                .get("count")
                .and_then(|v| v.as_u64())
                .unwrap_or(200) as usize;
            let db: u16 = json
                .get("db")
                .and_then(|v| v.as_u64())
                .unwrap_or(driver.current_db as u64) as u16;

            // Switch database if needed
            if db != driver.current_db {
                if let Err(e) = driver.select_db(db) {
                    return err_query_result(e);
                }
            }

            ops_key::scan_keys(driver, pattern, count)
        }
        _ => err_query_result(format!("Unknown browse action: {action}")),
    }
}

/// Dispatch a parsed CLI command to the appropriate handler.
fn dispatch_command(driver: &mut RedisDriver, command: &RedisCommand) -> FfiQueryResult {
    match command.name.as_str() {
        // Key operations
        "GET" => ops_key::cmd_get(driver, &command.args),
        "SET" => ops_key::cmd_set(driver, &command.args),
        "DEL" => ops_key::cmd_del(driver, &command.args),
        "EXISTS" => ops_key::cmd_exists(driver, &command.args),
        "TYPE" => ops_key::cmd_type(driver, &command.args),
        "TTL" => ops_key::cmd_ttl(driver, &command.args),
        "PTTL" => ops_key::cmd_pttl(driver, &command.args),
        "EXPIRE" => ops_key::cmd_expire(driver, &command.args),
        "PERSIST" => ops_key::cmd_persist(driver, &command.args),
        "RENAME" => ops_key::cmd_rename(driver, &command.args),
        "KEYS" => ops_key::cmd_keys(driver, &command.args),
        "SCAN" => ops_key::cmd_scan(driver, &command.args),

        // Hash operations
        "HGET" => ops_hash::cmd_hget(driver, &command.args),
        "HSET" => ops_hash::cmd_hset(driver, &command.args),
        "HGETALL" => ops_hash::cmd_hgetall(driver, &command.args),
        "HDEL" => ops_hash::cmd_hdel(driver, &command.args),

        // List operations
        "LRANGE" => ops_collection::cmd_lrange(driver, &command.args),
        "LPUSH" => ops_collection::cmd_lpush(driver, &command.args),
        "RPUSH" => ops_collection::cmd_rpush(driver, &command.args),
        "LLEN" => ops_collection::cmd_llen(driver, &command.args),

        // Set operations
        "SMEMBERS" => ops_collection::cmd_smembers(driver, &command.args),
        "SADD" => ops_collection::cmd_sadd(driver, &command.args),
        "SREM" => ops_collection::cmd_srem(driver, &command.args),
        "SCARD" => ops_collection::cmd_scard(driver, &command.args),

        // Sorted set operations
        "ZRANGE" => ops_collection::cmd_zrange(driver, &command.args),
        "ZADD" => ops_collection::cmd_zadd(driver, &command.args),
        "ZREM" => ops_collection::cmd_zrem(driver, &command.args),
        "ZCARD" => ops_collection::cmd_zcard(driver, &command.args),

        // Stream operations
        "XRANGE" => ops_collection::cmd_xrange(driver, &command.args),
        "XLEN" => ops_collection::cmd_xlen(driver, &command.args),

        // Server operations
        "PING" => ops_server::cmd_ping(driver),
        "INFO" => ops_server::cmd_info(driver, &command.args),
        "DBSIZE" => ops_server::cmd_dbsize(driver),
        "SELECT" => ops_server::cmd_select(driver, &command.args),
        "CONFIG" => ops_server::cmd_config(driver, &command.args),
        "FLUSHDB" => ops_server::cmd_flushdb(driver),

        _ => err_query_result(format!("Unsupported command: {}", command.name)),
    }
}

/// Format a Redis Value into a display string.
pub fn format_value(value: &Value) -> String {
    match value {
        Value::Nil => "(nil)".to_string(),
        Value::Int(i) => i.to_string(),
        Value::BulkString(bytes) => String::from_utf8_lossy(bytes).to_string(),
        Value::SimpleString(s) => s.clone(),
        Value::Okay => "OK".to_string(),
        Value::Array(arr) => {
            let parts: Vec<String> = arr.iter().enumerate().map(|(i, v)| {
                format!("{}) {}", i + 1, format_value(v))
            }).collect();
            parts.join("\n")
        }
        Value::Double(f) => f.to_string(),
        Value::Boolean(b) => b.to_string(),
        Value::Map(map) => {
            let parts: Vec<String> = map.iter().enumerate().map(|(i, (k, v))| {
                format!("{}) {} -> {}", i + 1, format_value(k), format_value(v))
            }).collect();
            parts.join("\n")
        }
        _ => format!("{value:?}"),
    }
}
