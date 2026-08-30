//! Live probe: a table name reused across schemas must list once per schema.
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
//! cargo test -p driver-postgres --test live_schema_listing -- --ignored --nocapture
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

/// The same table name in two schemas must produce exactly one row per schema.
///
/// Joining `information_schema.tables` to `pg_class` on `relname` alone pairs
/// each table with the same-named relation in *every* schema, so this listed
/// duplicates. The join now resolves the schema to an oid first and matches
/// `(relnamespace, relname)` as a unit.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live PostgreSQL server; creates and drops its own schemas"]
async fn a_name_reused_across_schemas_lists_once_per_schema() {
    let driver = PostgresDriver::new(tokio::runtime::Handle::current(), config());
    driver.connect().await.expect("connect failed");

    for setup in [
        "DROP SCHEMA IF EXISTS tablepro_a CASCADE",
        "DROP SCHEMA IF EXISTS tablepro_b CASCADE",
        "CREATE SCHEMA tablepro_a",
        "CREATE SCHEMA tablepro_b",
        // Same relation name in both schemas — the cross-match case.
        "CREATE TABLE tablepro_a.shared_name (id int)",
        "CREATE TABLE tablepro_b.shared_name (id int)",
        // An index carrying a table's name in another schema must not be
        // mistaken for that table.
        "CREATE TABLE tablepro_a.decoy (id int)",
        "CREATE INDEX shared_name ON tablepro_a.decoy (id)",
    ] {
        driver.execute(setup).await.unwrap_or_else(|e| {
            panic!("setup failed: {setup}: {e}");
        });
    }

    let tables = driver.fetch_tables().await.expect("fetch_tables failed");

    let listed: Vec<(String, String)> = tables
        .iter()
        .filter(|t| t.name == "shared_name")
        .map(|t| {
            (
                t.schema.clone().unwrap_or_default(),
                t.table_type.clone(),
            )
        })
        .collect();
    println!("shared_name rows: {listed:?}");

    assert_eq!(
        listed.len(),
        2,
        "expected exactly one row per schema, got {listed:?}"
    );
    assert!(listed.contains(&("tablepro_a".to_string(), "TABLE".to_string())));
    assert!(listed.contains(&("tablepro_b".to_string(), "TABLE".to_string())));

    // The decoy table itself still lists, exactly once.
    let decoys = tables.iter().filter(|t| t.name == "decoy").count();
    assert_eq!(decoys, 1, "decoy table should list exactly once");

    for cleanup in [
        "DROP SCHEMA IF EXISTS tablepro_a CASCADE",
        "DROP SCHEMA IF EXISTS tablepro_b CASCADE",
    ] {
        let _ = driver.execute(cleanup).await;
    }
    driver.disconnect();
}
