//! Live probe: partition children must not be listed as standalone tables.
//!
//! Ignored by default because it needs a reachable PostgreSQL server, and it
//! creates/drops its own objects — point it at a throwaway database.
//!
//! ```text
//! set TABLEPRO_PG_HOST=127.0.0.1
//! set TABLEPRO_PG_PORT=5433
//! set TABLEPRO_PG_USER=probe
//! set TABLEPRO_PG_PASSWORD=probe
//! set TABLEPRO_PG_DATABASE=probe
//! cargo test -p driver-postgres --test live_partitioned_tables -- --ignored --nocapture
//! ```

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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live PostgreSQL server; creates and drops its own tables"]
async fn partition_children_are_not_listed_alongside_their_parent() {
    let driver = PostgresDriver::new(tokio::runtime::Handle::current(), config());
    driver.connect().await.expect("connect failed");

    driver
        .execute("DROP TABLE IF EXISTS tablepro_sales CASCADE")
        .await
        .expect("cleanup failed");
    driver
        .execute(
            "CREATE TABLE tablepro_sales (id int, sold_on date NOT NULL) \
             PARTITION BY RANGE (sold_on)",
        )
        .await
        .expect("create parent failed");
    driver
        .execute(
            "CREATE TABLE tablepro_sales_2024 PARTITION OF tablepro_sales \
             FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
        )
        .await
        .expect("create partition 2024 failed");
    driver
        .execute(
            "CREATE TABLE tablepro_sales_2025 PARTITION OF tablepro_sales \
             FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')",
        )
        .await
        .expect("create partition 2025 failed");
    // A plain table must still be listed — the filter has to be narrow.
    driver
        .execute("DROP TABLE IF EXISTS tablepro_plain")
        .await
        .expect("cleanup failed");
    driver
        .execute("CREATE TABLE tablepro_plain (id int)")
        .await
        .expect("create plain failed");

    let tables = driver.fetch_tables().await.expect("fetch_tables failed");
    let names: Vec<&str> = tables
        .iter()
        .filter(|t| t.name.starts_with("tablepro_"))
        .map(|t| t.name.as_str())
        .collect();
    println!("tables listed: {names:?}");

    assert!(
        names.contains(&"tablepro_sales"),
        "partitioned parent must still be listed"
    );
    assert!(
        names.contains(&"tablepro_plain"),
        "ordinary table must still be listed"
    );
    assert!(
        !names.contains(&"tablepro_sales_2024"),
        "partition child was listed as a standalone table"
    );
    assert!(
        !names.contains(&"tablepro_sales_2025"),
        "partition child was listed as a standalone table"
    );

    driver
        .execute("DROP TABLE IF EXISTS tablepro_sales CASCADE")
        .await
        .expect("teardown failed");
    driver
        .execute("DROP TABLE IF EXISTS tablepro_plain")
        .await
        .expect("teardown failed");
}
