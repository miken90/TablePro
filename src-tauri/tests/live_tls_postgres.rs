//! Live probe: PostgreSQL connections really negotiate TLS.
//!
//! Ignored by default because it needs a reachable PostgreSQL server with SSL
//! enabled — point it at a throwaway instance:
//!
//! ```text
//! docker run -d --name tp-tls-pg -p 55432:5432 -e POSTGRES_PASSWORD=TpTls_pass1 \
//!   -e POSTGRES_DB=tptls <image-with-certs> \
//!   -c ssl=on -c ssl_cert_file=/certs/server.crt -c ssl_key_file=/certs/server.key
//!
//! cargo test -p tablepro-windows --test live_tls_postgres -- --ignored --nocapture
//! ```
//!
//! The driver uses `native-tls` (schannel on Windows), not rustls, so this
//! path does not go through `aws-lc-sys`. It is covered anyway because it is
//! one of the encrypted paths the app ships.

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_postgres::PostgresDriver;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn config(ssl_mode: &str) -> ConnectionConfig {
    ConnectionConfig {
        host: env_or("TABLEPRO_PG_HOST", "127.0.0.1"),
        port: env_or("TABLEPRO_PG_PORT", "55432").parse().unwrap_or(55432),
        user: env_or("TABLEPRO_PG_USER", "postgres"),
        password: env_or("TABLEPRO_PG_PASSWORD", "TpTls_pass1"),
        database: env_or("TABLEPRO_PG_DATABASE", "tptls"),
        db_type: "postgres".to_string(),
        ssl_mode: ssl_mode.to_string(),
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

/// `(ssl, version, cipher)` as the server sees this very backend connection.
async fn session_ssl_state(driver: &PostgresDriver) -> (String, String, String) {
    let result = driver
        .execute(
            "SELECT ssl::text, coalesce(version,'') , coalesce(cipher,'') \
             FROM pg_stat_ssl WHERE pid = pg_backend_pid()",
        )
        .await
        .expect("pg_stat_ssl query failed");
    let row = result.rows.first().expect("pg_stat_ssl returned no row");
    let cell = |i: usize| row.get(i).and_then(|v| v.clone()).unwrap_or_default();
    (cell(0), cell(1), cell(2))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live PostgreSQL server with ssl=on"]
async fn ssl_mode_require_completes_a_tls_handshake() {
    let driver = PostgresDriver::new(tokio::runtime::Handle::current(), config("require"));
    driver.connect().await.expect("TLS connect failed");

    let (ssl, version, cipher) = session_ssl_state(&driver).await;
    println!("ssl_mode=require -> ssl={ssl} version={version} cipher={cipher}");
    assert_eq!(ssl, "true", "server reports the connection as not encrypted");
    assert!(!version.is_empty(), "no TLS protocol version negotiated");
    assert!(!cipher.is_empty(), "no cipher negotiated");
}

/// Control for the assertion above: the same query on a plaintext connection
/// reports `ssl = false`, so the encrypted case is not trivially true.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live PostgreSQL server"]
async fn ssl_mode_disable_reports_an_unencrypted_session() {
    let driver = PostgresDriver::new(tokio::runtime::Handle::current(), config("disable"));
    driver.connect().await.expect("plaintext connect failed");

    let (ssl, version, cipher) = session_ssl_state(&driver).await;
    println!("ssl_mode=disable -> ssl={ssl} version={version} cipher={cipher}");
    assert_eq!(ssl, "false");
}

/// `verify-full` must actually verify: a self-signed server certificate has to
/// be rejected. If this ever passes, certificate verification was disabled.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live PostgreSQL server using a self-signed certificate"]
async fn verify_full_rejects_a_self_signed_certificate() {
    let driver = PostgresDriver::new(tokio::runtime::Handle::current(), config("verify-full"));
    match driver.connect().await {
        Ok(()) => panic!("verify-full accepted a self-signed certificate"),
        Err(e) => println!("verify-full rejected the self-signed certificate: {e}"),
    }
}
