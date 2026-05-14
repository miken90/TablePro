use redis::aio::MultiplexedConnection;
use redis::{cmd, Value};

use driver_common::{DriverError, QueryResult};

use crate::helpers::{build_query_result, message_result};
use crate::ops_basic::format_value;

pub async fn cmd_hget(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query("Usage: HGET key field".to_string()));
    }
    let v: Value = cmd("HGET")
        .arg(&args[0])
        .arg(&args[1])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("HGET failed: {e}")))?;
    Ok(message_result(&format_value(&v)))
}

pub async fn cmd_hset(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 3 {
        return Err(DriverError::Query(
            "Usage: HSET key field value [field value ...]".to_string(),
        ));
    }
    let mut command = cmd("HSET");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("HSET failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}

pub async fn cmd_hgetall(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query("Usage: HGETALL key".to_string()));
    }
    let pairs: Vec<String> = cmd("HGETALL")
        .arg(&args[0])
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("HGETALL failed: {e}")))?;
    let columns = vec![
        ("Field", "string", false, false),
        ("Value", "string", true, false),
    ];
    let mut rows: Vec<Vec<Option<String>>> = Vec::new();
    let mut i = 0;
    while i + 1 < pairs.len() {
        rows.push(vec![Some(pairs[i].clone()), Some(pairs[i + 1].clone())]);
        i += 2;
    }
    Ok(build_query_result(columns, rows, 0))
}

pub async fn cmd_hdel(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.len() < 2 {
        return Err(DriverError::Query(
            "Usage: HDEL key field [field ...]".to_string(),
        ));
    }
    let mut command = cmd("HDEL");
    for arg in args {
        command.arg(arg);
    }
    let count: i64 = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("HDEL failed: {e}")))?;
    Ok(message_result(&format!("(integer) {count}")))
}
