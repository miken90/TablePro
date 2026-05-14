use redis::aio::MultiplexedConnection;
use redis::cmd;

use driver_common::{DriverError, QueryResult};

use crate::helpers::{build_query_result, message_result};
use crate::ops_basic::format_value;

// ── List operations ──────────────────────────────────────────────────────────

pub async fn cmd_lrange(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 3 {
        return Err(DriverError::Query(
            "Usage: LRANGE key start stop".to_string(),
        ));
    }
    let items: Vec<String> = cmd("LRANGE")
        .arg(&args[0])
        .arg(&args[1])
        .arg(&args[2])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("LRANGE failed: {e}")))?;
    let columns = vec![
        ("Index", "integer", false, false),
        ("Value", "string", false, false),
    ];
    let rows: Vec<Vec<Option<String>>> = items
        .into_iter()
        .enumerate()
        .map(|(i, v)| vec![Some(i.to_string()), Some(v)])
        .collect();
    Ok(build_query_result(columns, rows, 0))
}

pub async fn cmd_lpush(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query(
            "Usage: LPUSH key value [value ...]".to_string(),
        ));
    }
    let mut command = cmd("LPUSH");
    for arg in args {
        command.arg(arg);
    }
    let len: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("LPUSH failed: {e}")))?;
    Ok(message_result(&format!("(integer) {len}")))
}

pub async fn cmd_rpush(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query(
            "Usage: RPUSH key value [value ...]".to_string(),
        ));
    }
    let mut command = cmd("RPUSH");
    for arg in args {
        command.arg(arg);
    }
    let len: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("RPUSH failed: {e}")))?;
    Ok(message_result(&format!("(integer) {len}")))
}

pub async fn cmd_llen(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: LLEN key".to_string()));
    }
    let len: i64 = cmd("LLEN")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("LLEN failed: {e}")))?;
    Ok(message_result(&format!("(integer) {len}")))
}

// ── Set operations ───────────────────────────────────────────────────────────

pub async fn cmd_smembers(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: SMEMBERS key".to_string()));
    }
    let members: Vec<String> = cmd("SMEMBERS")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("SMEMBERS failed: {e}")))?;
    let columns = vec![("Member", "string", false, false)];
    let rows: Vec<Vec<Option<String>>> = members.into_iter().map(|m| vec![Some(m)]).collect();
    Ok(build_query_result(columns, rows, 0))
}

pub async fn cmd_sadd(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query(
            "Usage: SADD key member [member ...]".to_string(),
        ));
    }
    let mut command = cmd("SADD");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("SADD failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}

pub async fn cmd_srem(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query(
            "Usage: SREM key member [member ...]".to_string(),
        ));
    }
    let mut command = cmd("SREM");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("SREM failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}

pub async fn cmd_scard(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: SCARD key".to_string()));
    }
    let count: i64 = cmd("SCARD")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("SCARD failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}

// ── Sorted set operations ────────────────────────────────────────────────────

pub async fn cmd_zrange(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 3 {
        return Err(DriverError::Query(
            "Usage: ZRANGE key start stop [WITHSCORES]".to_string(),
        ));
    }
    let with_scores = args.len() > 3
        && args[3..]
            .iter()
            .any(|a| a.eq_ignore_ascii_case("WITHSCORES"));

    if with_scores {
        let pairs: Vec<String> = cmd("ZRANGE")
            .arg(&args[0])
            .arg(&args[1])
            .arg(&args[2])
            .arg("WITHSCORES")
            .query_async(conn)
            .await
            .map_err(|e| DriverError::Query(format!("ZRANGE failed: {e}")))?;
        let columns = vec![
            ("Member", "string", false, false),
            ("Score", "double", false, false),
        ];
        let mut rows: Vec<Vec<Option<String>>> = Vec::new();
        let mut i = 0;
        while i + 1 < pairs.len() {
            rows.push(vec![Some(pairs[i].clone()), Some(pairs[i + 1].clone())]);
            i += 2;
        }
        Ok(build_query_result(columns, rows, 0))
    } else {
        let members: Vec<String> = cmd("ZRANGE")
            .arg(&args[0])
            .arg(&args[1])
            .arg(&args[2])
            .query_async(conn)
            .await
            .map_err(|e| DriverError::Query(format!("ZRANGE failed: {e}")))?;
        let columns = vec![("Member", "string", false, false)];
        let rows: Vec<Vec<Option<String>>> =
            members.into_iter().map(|m| vec![Some(m)]).collect();
        Ok(build_query_result(columns, rows, 0))
    }
}

pub async fn cmd_zadd(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 3 {
        return Err(DriverError::Query(
            "Usage: ZADD key score member [score member ...]".to_string(),
        ));
    }
    let mut command = cmd("ZADD");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("ZADD failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}

pub async fn cmd_zrem(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query(
            "Usage: ZREM key member [member ...]".to_string(),
        ));
    }
    let mut command = cmd("ZREM");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("ZREM failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}

pub async fn cmd_zcard(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: ZCARD key".to_string()));
    }
    let count: i64 = cmd("ZCARD")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("ZCARD failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}

// ── Stream operations ────────────────────────────────────────────────────────

pub async fn cmd_xrange(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 3 {
        return Err(DriverError::Query(
            "Usage: XRANGE key start end [COUNT count]".to_string(),
        ));
    }
    let mut command = cmd("XRANGE");
    for arg in args {
        command.arg(arg);
    }
    let entries: Vec<redis::Value> = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("XRANGE failed: {e}")))?;
    Ok(format_stream_entries(&entries))
}

pub async fn cmd_xlen(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: XLEN key".to_string()));
    }
    let len: i64 = cmd("XLEN")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("XLEN failed: {e}")))?;
    Ok(message_result(&format!("(integer) {len}")))
}

/// Format XRANGE stream entries into an ID|Fields grid.
fn format_stream_entries(entries: &[redis::Value]) -> QueryResult {
    let columns = vec![
        ("ID", "string", false, false),
        ("Fields", "string", false, false),
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
