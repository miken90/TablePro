use redis::aio::MultiplexedConnection;
use redis::{cmd, Value};

use driver_common::{DriverError, QueryResult};

use crate::helpers::{build_query_result, message_result};
use crate::ops_basic::format_value;

/// SCAN keys with pattern matching, returning Key|Type|TTL|Value grid.
pub async fn scan_keys(
    conn: &mut MultiplexedConnection,
    pattern: &str,
    count: usize,
) -> Result<QueryResult, DriverError> {
    // Collect keys via SCAN
    let mut keys: Vec<String> = Vec::new();
    let mut cursor: u64 = 0;
    loop {
        let (next, batch): (u64, Vec<String>) = cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(pattern)
            .arg("COUNT")
            .arg(count)
            .query_async(conn)
            .await
            .map_err(|e| DriverError::Query(format!("SCAN failed: {e}")))?;
        cursor = next;
        keys.extend(batch);
        if cursor == 0 || keys.len() >= count {
            break;
        }
    }
    keys.truncate(count);

    let columns = vec![
        ("Key", "string", false, true),
        ("Type", "string", false, false),
        ("TTL", "integer", false, false),
        ("Value", "string", true, false),
    ];

    if keys.is_empty() {
        return Ok(build_query_result(columns, vec![], 0));
    }

    let mut rows: Vec<Vec<Option<String>>> = Vec::with_capacity(keys.len());
    for key in &keys {
        let key_type: String = cmd("TYPE")
            .arg(key)
            .query_async(conn)
            .await
            .unwrap_or_else(|_| "unknown".to_string());

        let ttl: i64 = cmd("TTL")
            .arg(key)
            .query_async(conn)
            .await
            .unwrap_or(-1);

        let ttl_str = if ttl == -1 {
            "No Expiry".to_string()
        } else if ttl == -2 {
            "Expired".to_string()
        } else {
            ttl.to_string()
        };

        let value_preview = get_value_preview(conn, key, &key_type).await;

        rows.push(vec![
            Some(key.clone()),
            Some(key_type),
            Some(ttl_str),
            Some(value_preview),
        ]);
    }

    Ok(build_query_result(columns, rows, 0))
}

/// Get a preview of a key's value based on its type.
async fn get_value_preview(
    conn: &mut MultiplexedConnection,
    key: &str,
    key_type: &str,
) -> String {
    match key_type {
        "string" => match cmd("GET").arg(key).query_async::<Value>(conn).await {
            Ok(v) => truncate_preview(&format_value(&v), 200),
            Err(_) => "(error)".to_string(),
        },
        "hash" => match cmd("HLEN").arg(key).query_async::<i64>(conn).await {
            Ok(len) => format!("({len} fields)"),
            Err(_) => "(hash)".to_string(),
        },
        "list" => match cmd("LLEN").arg(key).query_async::<i64>(conn).await {
            Ok(len) => format!("({len} items)"),
            Err(_) => "(list)".to_string(),
        },
        "set" => match cmd("SCARD").arg(key).query_async::<i64>(conn).await {
            Ok(len) => format!("({len} members)"),
            Err(_) => "(set)".to_string(),
        },
        "zset" => match cmd("ZCARD").arg(key).query_async::<i64>(conn).await {
            Ok(len) => format!("({len} members)"),
            Err(_) => "(zset)".to_string(),
        },
        "stream" => match cmd("XLEN").arg(key).query_async::<i64>(conn).await {
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

pub async fn cmd_get(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: GET key".to_string()));
    }
    let v: Value = cmd("GET")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("GET failed: {e}")))?;
    Ok(message_result(&format_value(&v)))
}

pub async fn cmd_set(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query(
            "Usage: SET key value [EX seconds|PX ms] [NX|XX]".to_string(),
        ));
    }
    let mut command = cmd("SET");
    for arg in args {
        command.arg(arg);
    }
    let v: Value = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("SET failed: {e}")))?;
    Ok(message_result(&format_value(&v)))
}

pub async fn cmd_del(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query(
            "Usage: DEL key [key ...]".to_string(),
        ));
    }
    let mut command = cmd("DEL");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("DEL failed: {e}")))?;
    let columns = vec![("Deleted", "integer", false, false)];
    let rows = vec![vec![Some(count.to_string())]];
    Ok(build_query_result(columns, rows, count))
}

pub async fn cmd_exists(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query(
            "Usage: EXISTS key [key ...]".to_string(),
        ));
    }
    let mut command = cmd("EXISTS");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("EXISTS failed: {e}")))?;
    Ok(message_result(&count.to_string()))
}

pub async fn cmd_type(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: TYPE key".to_string()));
    }
    let t: String = cmd("TYPE")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("TYPE failed: {e}")))?;
    Ok(message_result(&t))
}

pub async fn cmd_ttl(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: TTL key".to_string()));
    }
    let v: i64 = cmd("TTL")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("TTL failed: {e}")))?;
    Ok(message_result(&v.to_string()))
}

pub async fn cmd_pttl(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: PTTL key".to_string()));
    }
    let v: i64 = cmd("PTTL")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("PTTL failed: {e}")))?;
    Ok(message_result(&v.to_string()))
}

pub async fn cmd_expire(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query("Usage: EXPIRE key seconds".to_string()));
    }
    let v: i64 = cmd("EXPIRE")
        .arg(&args[0])
        .arg(&args[1])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("EXPIRE failed: {e}")))?;
    Ok(message_result(&v.to_string()))
}

pub async fn cmd_persist(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: PERSIST key".to_string()));
    }
    let v: i64 = cmd("PERSIST")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("PERSIST failed: {e}")))?;
    Ok(message_result(&v.to_string()))
}

pub async fn cmd_rename(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query("Usage: RENAME key newkey".to_string()));
    }
    let v: Value = cmd("RENAME")
        .arg(&args[0])
        .arg(&args[1])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("RENAME failed: {e}")))?;
    Ok(message_result(&format_value(&v)))
}

pub async fn cmd_keys(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    let pattern = args.first().map(|s| s.as_str()).unwrap_or("*");
    let keys: Vec<String> = cmd("KEYS")
        .arg(pattern)
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("KEYS failed: {e}")))?;
    let columns = vec![("Key", "string", false, false)];
    let rows: Vec<Vec<Option<String>>> = keys.into_iter().map(|k| vec![Some(k)]).collect();
    Ok(build_query_result(columns, rows, 0))
}

pub async fn cmd_scan(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    let cursor_str = args.first().map(|s| s.as_str()).unwrap_or("0");
    let mut command = cmd("SCAN");
    command.arg(cursor_str);
    for arg in args.iter().skip(1) {
        command.arg(arg);
    }
    let (next_cursor, keys): (u64, Vec<String>) = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("SCAN failed: {e}")))?;

    let columns = vec![
        ("Cursor", "string", false, false),
        ("Key", "string", false, false),
    ];
    if keys.is_empty() {
        let rows = vec![vec![Some(next_cursor.to_string()), Some("(empty)".to_string())]];
        return Ok(build_query_result(columns, rows, 0));
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
    Ok(build_query_result(columns, rows, 0))
}
