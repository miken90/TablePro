//! Live cancellation probe for the MySQL/MariaDB driver.
//!
//! Ignored by default because it needs a reachable MySQL server. A unit test
//! cannot prove cancellation works — only a real server can — so this starts
//! `SELECT SLEEP(60)`, cancels it, and then verifies from a second connection
//! that the statement is no longer in the process list.
//!
//! Run it against a server of your choice:
//!
//! ```text
//! set TABLEPRO_MYSQL_HOST=127.0.0.1
//! set TABLEPRO_MYSQL_PORT=3306
//! set TABLEPRO_MYSQL_USER=root
//! set TABLEPRO_MYSQL_PASSWORD=secret
//! set TABLEPRO_MYSQL_DATABASE=test
//! cargo test -p driver-mysql --test live_cancellation -- --ignored --nocapture
//! ```

use std::time::Duration;

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_mysql::MysqlDriver;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn config() -> ConnectionConfig {
    ConnectionConfig {
        host: env_or("TABLEPRO_MYSQL_HOST", "127.0.0.1"),
        port: env_or("TABLEPRO_MYSQL_PORT", "3306")
            .parse()
            .unwrap_or(3306),
        user: env_or("TABLEPRO_MYSQL_USER", "root"),
        password: env_or("TABLEPRO_MYSQL_PASSWORD", "root"),
        database: env_or("TABLEPRO_MYSQL_DATABASE", "mysql"),
        db_type: "mysql".to_string(),
        ssl_mode: env_or("TABLEPRO_MYSQL_SSLMODE", "disable"),
        startup_commands: None,
        ssh_enabled: false,
        ssh_host: String::new(),
        ssh_port: 22,
        ssh_user: String::new(),
        ssh_auth_method: "password".to_string(),
        ssh_password: String::new(),
        ssh_key_path: String::new(),
        ssh_key_passphrase: String::new(),
    }
}

/// Count sessions currently running our `SLEEP(60)` statement.
async fn sleeping_sessions(observer: &MysqlDriver) -> i64 {
    let result = observer
        .execute(
            "SELECT COUNT(*) FROM information_schema.PROCESSLIST \
             WHERE INFO LIKE '%SLEEP(60)%' AND INFO NOT LIKE '%PROCESSLIST%'",
        )
        .await
        .expect("observer query failed");
    result.rows[0][0]
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(-1)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires a live MySQL server"]
async fn cancel_query_kills_the_running_statement_not_the_session() {
    let rt = tokio::runtime::Handle::current();

    let worker = std::sync::Arc::new(MysqlDriver::new(rt.clone(), config()));
    worker.connect().await.expect("worker connect failed");

    let observer = MysqlDriver::new(rt.clone(), config());
    observer.connect().await.expect("observer connect failed");

    let runner = {
        let worker = worker.clone();
        tokio::spawn(async move { worker.execute("SELECT SLEEP(60)").await })
    };

    let mut before = 0;
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        before = sleeping_sessions(&observer).await;
        if before > 0 {
            break;
        }
    }
    println!("SLEEP(60) sessions before cancel: {before}");
    assert!(before > 0, "SLEEP(60) never showed up in the process list");

    let killed_at = std::time::Instant::now();
    worker.cancel_query().await.expect("cancel_query failed");

    let outcome = tokio::time::timeout(Duration::from_secs(10), runner)
        .await
        .expect("query did not terminate within 10s")
        .expect("query task panicked");
    let elapsed = killed_at.elapsed();
    println!("cancelled query outcome after {elapsed:?}: {outcome:?}");

    // Most interrupted statements surface MySQL error 1317 ("Query execution
    // was interrupted"). `SLEEP()` is the documented exception: an interrupted
    // sleep returns 1 instead of erroring. So the proof of cancellation is
    // that the 60-second statement finished immediately, not its error state.
    assert!(
        elapsed < Duration::from_secs(10),
        "statement outlived the cancel by {elapsed:?}"
    );

    let mut after = -1;
    for _ in 0..20 {
        after = sleeping_sessions(&observer).await;
        if after == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    println!("SLEEP(60) sessions after cancel: {after}");
    assert_eq!(after, 0, "statement still running after cancel");

    // `KILL QUERY` must leave the session alive — a dropped connection would
    // mean we killed the session instead of the statement.
    worker
        .execute("SELECT 1")
        .await
        .expect("worker session died — cancel killed the connection, not the query");
}
