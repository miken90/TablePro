use redis::{cmd, Value};
use tablepro_plugin_sdk::FfiQueryResult;

use crate::driver::RedisDriver;
use crate::ffi_helpers::{build_query_result, err_query_result, message_result};
use crate::ops_basic::format_value;

/// SCAN keys with pattern matching, returning Key|Type|TTL|Value grid.
pub fn scan_keys(driver: &mut RedisDriver, pattern: &str, count: usize) -> FfiQueryResult {
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };

    // Collect keys via SCAN
    let mut keys: Vec<String> = Vec::new();
    let mut cursor: u64 = 0;
    loop {
        let result: (u64, Vec<String>) = match cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(pattern)
            .arg("COUNT")
            .arg(count)
            .query(conn)
        {
            Ok(r) => r,
            Err(e) => return err_query_result(format!("SCAN failed: {e}")),
        };

        cursor = result.0;
        keys.extend(result.1);

        if cursor == 0 || keys.len() >= count {
            break;
        }
    }

    keys.truncate(count);

    if keys.is_empty() {
        let columns = vec![
            ("Key".to_string(), "string".to_string(), false, true),
            ("Type".to_string(), "string".to_string(), false, false),
            ("TTL".to_string(), "integer".to_string(), false, false),
            ("Value".to_string(), "string".to_string(), true, false),
        ];
        return build_query_result(columns, vec![], 0);
    }

    // Fetch type, TTL, and value preview for each key using pipeline
    let columns = vec![
        ("Key".to_string(), "string".to_string(), false, true),
        ("Type".to_string(), "string".to_string(), false, false),
        ("TTL".to_string(), "integer".to_string(), false, false),
        ("Value".to_string(), "string".to_string(), true, false),
    ];

    let mut rows: Vec<Vec<Option<String>>> = Vec::with_capacity(keys.len());

    for key in &keys {
        let key_type: String = match cmd("TYPE").arg(key).query(conn) {
            Ok(v) => v,
            Err(_) => "unknown".to_string(),
        };

        let ttl: i64 = cmd("TTL").arg(key).query(conn).unwrap_or(-1);

        let ttl_str = if ttl == -1 {
            "No Expiry".to_string()
        } else if ttl == -2 {
            "Expired".to_string()
        } else {
            ttl.to_string()
        };

        let value_preview = get_value_preview(conn, key, &key_type);

        rows.push(vec![
            Some(key.clone()),
            Some(key_type),
            Some(ttl_str),
            Some(value_preview),
        ]);
    }

    build_query_result(columns, rows, 0)
}

/// Get a preview of a key's value based on its type.
fn get_value_preview(conn: &mut redis::Connection, key: &str, key_type: &str) -> String {
    match key_type {
        "string" => match cmd("GET").arg(key).query::<Value>(conn) {
            Ok(v) => truncate_preview(&format_value(&v), 200),
            Err(_) => "(error)".to_string(),
        },
        "hash" => match cmd("HLEN").arg(key).query::<i64>(conn) {
            Ok(len) => format!("({len} fields)"),
            Err(_) => "(hash)".to_string(),
        },
        "list" => match cmd("LLEN").arg(key).query::<i64>(conn) {
            Ok(len) => format!("({len} items)"),
            Err(_) => "(list)".to_string(),
        },
        "set" => match cmd("SCARD").arg(key).query::<i64>(conn) {
            Ok(len) => format!("({len} members)"),
            Err(_) => "(set)".to_string(),
        },
        "zset" => match cmd("ZCARD").arg(key).query::<i64>(conn) {
            Ok(len) => format!("({len} members)"),
            Err(_) => "(zset)".to_string(),
        },
        "stream" => match cmd("XLEN").arg(key).query::<i64>(conn) {
            Ok(len) => format!("({len} entries)"),
            Err(_) => "(stream)".to_string(),
        },
        _ => format!("({key_type})"),
    }
}

fn truncate_preview(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

// ── CLI command handlers ─────────────────────────────────────────────────────

pub fn cmd_get(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: GET key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("GET").arg(&args[0]).query::<Value>(conn) {
        Ok(v) => message_result(&format_value(&v)),
        Err(e) => err_query_result(format!("GET failed: {e}")),
    }
}

pub fn cmd_set(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: SET key value [EX seconds|PX ms] [NX|XX]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("SET");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<Value>(conn) {
        Ok(v) => message_result(&format_value(&v)),
        Err(e) => err_query_result(format!("SET failed: {e}")),
    }
}

pub fn cmd_del(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: DEL key [key ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("DEL");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => {
            let columns = vec![("Deleted".to_string(), "integer".to_string(), false, false)];
            let rows = vec![vec![Some(count.to_string())]];
            build_query_result(columns, rows, count)
        }
        Err(e) => err_query_result(format!("DEL failed: {e}")),
    }
}

pub fn cmd_exists(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: EXISTS key [key ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("EXISTS");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => message_result(&count.to_string()),
        Err(e) => err_query_result(format!("EXISTS failed: {e}")),
    }
}

pub fn cmd_type(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: TYPE key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("TYPE").arg(&args[0]).query::<String>(conn) {
        Ok(t) => message_result(&t),
        Err(e) => err_query_result(format!("TYPE failed: {e}")),
    }
}

pub fn cmd_ttl(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: TTL key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("TTL").arg(&args[0]).query::<i64>(conn) {
        Ok(v) => message_result(&v.to_string()),
        Err(e) => err_query_result(format!("TTL failed: {e}")),
    }
}

pub fn cmd_pttl(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: PTTL key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("PTTL").arg(&args[0]).query::<i64>(conn) {
        Ok(v) => message_result(&v.to_string()),
        Err(e) => err_query_result(format!("PTTL failed: {e}")),
    }
}

pub fn cmd_expire(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: EXPIRE key seconds".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("EXPIRE").arg(&args[0]).arg(&args[1]).query::<i64>(conn) {
        Ok(v) => message_result(&v.to_string()),
        Err(e) => err_query_result(format!("EXPIRE failed: {e}")),
    }
}

pub fn cmd_persist(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: PERSIST key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("PERSIST").arg(&args[0]).query::<i64>(conn) {
        Ok(v) => message_result(&v.to_string()),
        Err(e) => err_query_result(format!("PERSIST failed: {e}")),
    }
}

pub fn cmd_rename(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: RENAME key newkey".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("RENAME").arg(&args[0]).arg(&args[1]).query::<Value>(conn) {
        Ok(v) => message_result(&format_value(&v)),
        Err(e) => err_query_result(format!("RENAME failed: {e}")),
    }
}

pub fn cmd_keys(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    let pattern = args.first().map(|s| s.as_str()).unwrap_or("*");
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("KEYS").arg(pattern).query::<Vec<String>>(conn) {
        Ok(keys) => {
            let columns = vec![("Key".to_string(), "string".to_string(), false, false)];
            let rows: Vec<Vec<Option<String>>> =
                keys.into_iter().map(|k| vec![Some(k)]).collect();
            build_query_result(columns, rows, 0)
        }
        Err(e) => err_query_result(format!("KEYS failed: {e}")),
    }
}

pub fn cmd_scan(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    // SCAN cursor [MATCH pattern] [COUNT count]
    let cursor_str = args.first().map(|s| s.as_str()).unwrap_or("0");
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("SCAN");
    command.arg(cursor_str);
    // Pass remaining args as-is (MATCH, COUNT, etc.)
    for arg in args.iter().skip(1) {
        command.arg(arg);
    }
    match command.query::<(u64, Vec<String>)>(conn) {
        Ok((next_cursor, keys)) => {
            let columns = vec![
                ("Cursor".to_string(), "string".to_string(), false, false),
                ("Key".to_string(), "string".to_string(), false, false),
            ];
            if keys.is_empty() {
                let rows = vec![vec![Some(next_cursor.to_string()), Some("(empty)".to_string())]];
                return build_query_result(columns, rows, 0);
            }
            let mut rows: Vec<Vec<Option<String>>> = Vec::with_capacity(keys.len());
            for (i, key) in keys.into_iter().enumerate() {
                let cursor_cell = if i == 0 {
                    Some(next_cursor.to_string())
                } else {
                    Some(String::new())
                };
                rows.push(vec![cursor_cell, Some(key)]);
            }
            build_query_result(columns, rows, 0)
        }
        Err(e) => err_query_result(format!("SCAN failed: {e}")),
    }
}
