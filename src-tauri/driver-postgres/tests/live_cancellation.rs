//! Live cancellation probe for the PostgreSQL driver.
//!
//! Ignored by default because it needs a reachable PostgreSQL server. A unit
//! test cannot prove cancellation works — only a real backend can — so this
//! starts `SELECT pg_sleep(60)`, cancels it, and then verifies from a second
//! connection that the sleeping backend is gone.
//!
//! Run it against a server of your choice:
//!
//! ```text
//! set TABLEPRO_PG_HOST=127.0.0.1
//! set TABLEPRO_PG_PORT=5432
//! set TABLEPRO_PG_USER=docker
//! set TABLEPRO_PG_PASSWORD=docker
//! set TABLEPRO_PG_DATABASE=docker
//! cargo test -p driver-postgres --test live_cancellation -- --ignored --nocapture
//! ```

use std::time::Duration;

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_postgres::PostgresDriver;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn config() -> ConnectionConfig {
    ConnectionConfig {
        host: env_or("TABLEPRO_PG_HOST", "127.0.0.1"),
        port: env_or("TABLEPRO_PG_PORT", "5432").parse().unwrap_or(5432),
        user: env_or("TABLEPRO_PG_USER", "postgres"),
        password: env_or("TABLEPRO_PG_PASSWORD", "postgres"),
        database: env_or("TABLEPRO_PG_DATABASE", "postgres"),
        db_type: "postgres".to_string(),
        ssl_mode: env_or("TABLEPRO_PG_SSLMODE", "disable"),
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

/// Count backends currently running a `pg_sleep` statement.
async fn sleeping_backends(observer: &PostgresDriver) -> i64 {
    let result = observer
        .execute(
            "SELECT count(*) FROM pg_stat_activity \
             WHERE state = 'active' AND query LIKE '%pg_sleep%' AND query NOT LIKE '%pg_stat_activity%'",
        )
        .await
        .expect("observer query failed");
    result.rows[0][0]
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(-1)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires a live PostgreSQL server"]
async fn cancel_query_terminates_the_running_statement() {
    let rt = tokio::runtime::Handle::current();

    let worker = std::sync::Arc::new(PostgresDriver::new(rt.clone(), config()));
    worker.connect().await.expect("worker connect failed");

    let observer = PostgresDriver::new(rt.clone(), config());
    observer.connect().await.expect("observer connect failed");

    // Start the long query on the worker connection.
    let runner = {
        let worker = worker.clone();
        tokio::spawn(async move { worker.execute("SELECT pg_sleep(60)").await })
    };

    // Wait until the backend is visibly running it.
    let mut before = 0;
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        before = sleeping_backends(&observer).await;
        if before > 0 {
            break;
        }
    }
    println!("pg_sleep backends before cancel: {before}");
    assert!(before > 0, "pg_sleep never showed up in pg_stat_activity");

    worker.cancel_query().await.expect("cancel_query failed");

    // The in-flight execute must fail rather than complete.
    let outcome = tokio::time::timeout(Duration::from_secs(10), runner)
        .await
        .expect("query did not terminate within 10s")
        .expect("query task panicked");
    println!("cancelled query outcome: {outcome:?}");
    assert!(outcome.is_err(), "cancelled query returned success");

    // And the backend must be gone as seen from the second connection.
    let mut after = -1;
    for _ in 0..20 {
        after = sleeping_backends(&observer).await;
        if after == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    println!("pg_sleep backends after cancel: {after}");
    assert_eq!(after, 0, "backend still running pg_sleep after cancel");
}
