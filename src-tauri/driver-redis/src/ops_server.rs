use redis::aio::MultiplexedConnection;
use redis::cmd;

use driver_common::{DriverError, QueryResult};

use crate::helpers::{build_query_result, message_result};

pub async fn cmd_ping(conn: &mut MultiplexedConnection) -> Result<QueryResult, DriverError> {
    let s: String = cmd("PING")
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("PING failed: {e}")))?;
    Ok(message_result(&s))
}

pub async fn cmd_info(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    let mut command = cmd("INFO");
    for arg in args {
        command.arg(arg);
    }
    let info: String = command
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("INFO failed: {e}")))?;

    let columns = vec![
        ("Property", "string", false, false),
        ("Value", "string", true, false),
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
    Ok(build_query_result(columns, rows, 0))
}

pub async fn cmd_dbsize(conn: &mut MultiplexedConnection) -> Result<QueryResult, DriverError> {
    let size: i64 = cmd("DBSIZE")
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("DBSIZE failed: {e}")))?;
    Ok(message_result(&format!("(integer) {size}")))
}

pub async fn cmd_config(
    conn: &mut MultiplexedConnection,
    args: &[String],
) -> Result<QueryResult, DriverError> {
    if args.is_empty() {
        return Err(DriverError::Query(
            "Usage: CONFIG GET pattern | CONFIG SET param value".to_string(),
        ));
    }
    let sub = args[0].to_uppercase();
    match sub.as_str() {
        "GET" => {
            if args.len() < 2 {
                return Err(DriverError::Query("Usage: CONFIG GET pattern".to_string()));
            }
            let pairs: Vec<String> = cmd("CONFIG")
                .arg("GET")
                .arg(&args[1])
                .query_async(conn)
                .await
                .map_err(|e| DriverError::Query(format!("CONFIG GET failed: {e}")))?;
            let columns = vec![
                ("Parameter", "string", false, false),
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
        "SET" => {
            if args.len() < 3 {
                return Err(DriverError::Query(
                    "Usage: CONFIG SET parameter value".to_string(),
                ));
            }
            let s: String = cmd("CONFIG")
                .arg("SET")
                .arg(&args[1])
                .arg(&args[2])
                .query_async(conn)
                .await
                .map_err(|e| DriverError::Query(format!("CONFIG SET failed: {e}")))?;
            Ok(message_result(&s))
        }
        _ => Err(DriverError::Query(format!(
            "Unsupported CONFIG subcommand: {sub}"
        ))),
    }
}

pub async fn cmd_flushdb(conn: &mut MultiplexedConnection) -> Result<QueryResult, DriverError> {
    let s: String = cmd("FLUSHDB")
        .query_async(conn)
        .await
        .map_err(|e| DriverError::Query(format!("FLUSHDB failed: {e}")))?;
    Ok(message_result(&s))
}
