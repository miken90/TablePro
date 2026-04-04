use redis::cmd;
use tablepro_plugin_sdk::FfiQueryResult;

use crate::driver::RedisDriver;
use crate::ffi_helpers::{build_query_result, err_query_result, message_result};

// ── List operations ──────────────────────────────────────────────────────────

pub fn cmd_lrange(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 3 {
        return err_query_result("Usage: LRANGE key start stop".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("LRANGE")
        .arg(&args[0])
        .arg(&args[1])
        .arg(&args[2])
        .query::<Vec<String>>(conn)
    {
        Ok(items) => {
            let columns = vec![
                ("Index".to_string(), "integer".to_string(), false, false),
                ("Value".to_string(), "string".to_string(), false, false),
            ];
            let rows: Vec<Vec<Option<String>>> = items
                .into_iter()
                .enumerate()
                .map(|(i, v)| vec![Some(i.to_string()), Some(v)])
                .collect();
            build_query_result(columns, rows, 0)
        }
        Err(e) => err_query_result(format!("LRANGE failed: {e}")),
    }
}

pub fn cmd_lpush(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: LPUSH key value [value ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("LPUSH");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(len) => message_result(&format!("(integer) {len}")),
        Err(e) => err_query_result(format!("LPUSH failed: {e}")),
    }
}

pub fn cmd_rpush(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: RPUSH key value [value ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("RPUSH");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(len) => message_result(&format!("(integer) {len}")),
        Err(e) => err_query_result(format!("RPUSH failed: {e}")),
    }
}

pub fn cmd_llen(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: LLEN key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("LLEN").arg(&args[0]).query::<i64>(conn) {
        Ok(len) => message_result(&format!("(integer) {len}")),
        Err(e) => err_query_result(format!("LLEN failed: {e}")),
    }
}

// ── Set operations ───────────────────────────────────────────────────────────

pub fn cmd_smembers(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: SMEMBERS key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("SMEMBERS").arg(&args[0]).query::<Vec<String>>(conn) {
        Ok(members) => {
            let columns = vec![("Member".to_string(), "string".to_string(), false, false)];
            let rows: Vec<Vec<Option<String>>> =
                members.into_iter().map(|m| vec![Some(m)]).collect();
            build_query_result(columns, rows, 0)
        }
        Err(e) => err_query_result(format!("SMEMBERS failed: {e}")),
    }
}

pub fn cmd_sadd(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: SADD key member [member ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("SADD");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("SADD failed: {e}")),
    }
}

pub fn cmd_srem(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: SREM key member [member ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("SREM");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("SREM failed: {e}")),
    }
}

pub fn cmd_scard(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: SCARD key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("SCARD").arg(&args[0]).query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("SCARD failed: {e}")),
    }
}

// ── Sorted set operations ────────────────────────────────────────────────────

pub fn cmd_zrange(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 3 {
        return err_query_result("Usage: ZRANGE key start stop [WITHSCORES]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };

    let with_scores = args.len() > 3
        && args[3..].iter().any(|a| a.eq_ignore_ascii_case("WITHSCORES"));

    if with_scores {
        match cmd("ZRANGE")
            .arg(&args[0])
            .arg(&args[1])
            .arg(&args[2])
            .arg("WITHSCORES")
            .query::<Vec<String>>(conn)
        {
            Ok(pairs) => {
                let columns = vec![
                    ("Member".to_string(), "string".to_string(), false, false),
                    ("Score".to_string(), "double".to_string(), false, false),
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
            Err(e) => err_query_result(format!("ZRANGE failed: {e}")),
        }
    } else {
        match cmd("ZRANGE")
            .arg(&args[0])
            .arg(&args[1])
            .arg(&args[2])
            .query::<Vec<String>>(conn)
        {
            Ok(members) => {
                let columns =
                    vec![("Member".to_string(), "string".to_string(), false, false)];
                let rows: Vec<Vec<Option<String>>> =
                    members.into_iter().map(|m| vec![Some(m)]).collect();
                build_query_result(columns, rows, 0)
            }
            Err(e) => err_query_result(format!("ZRANGE failed: {e}")),
        }
    }
}

pub fn cmd_zadd(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 3 {
        return err_query_result("Usage: ZADD key score member [score member ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("ZADD");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("ZADD failed: {e}")),
    }
}

pub fn cmd_zrem(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 2 {
        return err_query_result("Usage: ZREM key member [member ...]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("ZREM");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("ZREM failed: {e}")),
    }
}

pub fn cmd_zcard(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: ZCARD key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("ZCARD").arg(&args[0]).query::<i64>(conn) {
        Ok(count) => message_result(&format!("(integer) {count}")),
        Err(e) => err_query_result(format!("ZCARD failed: {e}")),
    }
}

// ── Stream operations ────────────────────────────────────────────────────────

pub fn cmd_xrange(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.len() < 3 {
        return err_query_result("Usage: XRANGE key start end [COUNT count]".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    let mut command = cmd("XRANGE");
    for arg in args {
        command.arg(arg);
    }
    match command.query::<Vec<redis::Value>>(conn) {
        Ok(entries) => format_stream_entries(&entries),
        Err(e) => err_query_result(format!("XRANGE failed: {e}")),
    }
}

pub fn cmd_xlen(driver: &mut RedisDriver, args: &[String]) -> FfiQueryResult {
    if args.is_empty() {
        return err_query_result("Usage: XLEN key".to_string());
    }
    let conn = match driver.conn() {
        Ok(c) => c,
        Err(e) => return err_query_result(e),
    };
    match cmd("XLEN").arg(&args[0]).query::<i64>(conn) {
        Ok(len) => message_result(&format!("(integer) {len}")),
        Err(e) => err_query_result(format!("XLEN failed: {e}")),
    }
}

/// Format XRANGE stream entries into an ID|Fields grid.
fn format_stream_entries(entries: &[redis::Value]) -> FfiQueryResult {
    use crate::ops_basic::format_value;

    let columns = vec![
        ("ID".to_string(), "string".to_string(), false, false),
        ("Fields".to_string(), "string".to_string(), false, false),
    ];

    let mut rows: Vec<Vec<Option<String>>> = Vec::new();
    for entry in entries {
        if let redis::Value::Array(parts) = entry {
            if parts.len() >= 2 {
                let id = format_value(&parts[0]);
                let fields = format_value(&parts[1]);
                rows.push(vec![Some(id), Some(fields)]);
            }
        }
    }

    build_query_result(columns, rows, 0)
}
