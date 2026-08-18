//! Live probe: MySQL connections really negotiate TLS.
//!
//! Ignored by default because it needs a reachable MySQL server — point it at
//! a throwaway instance (MySQL 8 auto-generates a self-signed server
//! certificate on first start):
//!
//! ```text
//! docker run -d --name tp-tls-mysql -p 53306:3306 \
//!   -e MYSQL_ROOT_PASSWORD=TpTls_pass1 -e MYSQL_DATABASE=tptls mysql:8
//!
//! cargo test -p tablepro-windows --test live_tls_mysql -- --ignored --nocapture
//! ```
//!
//! `mysql_async` uses rustls, so this path runs through `aws-lc-rs` /
//! `aws-lc-sys`. It resolves trust anchors from the compiled-in Mozilla root
//! bundle only — the OS certificate store and `SSL_CERT_FILE` are both
//! ignored — so `verify-ca` and `verify-full` cannot succeed against a
//! privately-signed server certificate. `require` encrypts without validating
//! the certificate, which is what MySQL itself defines the mode to mean.

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_mysql::MysqlDriver;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn config(ssl_mode: &str) -> ConnectionConfig {
    ConnectionConfig {
        host: env_or("TABLEPRO_MYSQL_HOST", "127.0.0.1"),
        port: env_or("TABLEPRO_MYSQL_PORT", "53306")
            .parse()
            .unwrap_or(53306),
        user: env_or("TABLEPRO_MYSQL_USER", "root"),
        password: env_or("TABLEPRO_MYSQL_PASSWORD", "TpTls_pass1"),
        database: env_or("TABLEPRO_MYSQL_DATABASE", "tptls"),
        db_type: "mysql".to_string(),
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

/// `Ssl_cipher` for this session — empty when the connection is plaintext.
async fn session_cipher(driver: &MysqlDriver) -> String {
    let result = driver
        .execute("SHOW STATUS LIKE 'Ssl_cipher'")
        .await
        .expect("Ssl_cipher query failed");
    result
        .rows
        .first()
        .and_then(|r| r.get(1))
        .and_then(|v| v.clone())
        .unwrap_or_default()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live MySQL server"]
async fn ssl_mode_require_completes_a_tls_handshake() {
    let driver = MysqlDriver::new(tokio::runtime::Handle::current(), config("require"));
    driver.connect().await.expect("TLS connect failed");

    let cipher = session_cipher(&driver).await;
    println!("ssl_mode=require -> Ssl_cipher={cipher}");
    assert!(!cipher.is_empty(), "session is not encrypted");
}

/// `verify-full` must actually validate: a privately-signed server certificate
/// has to be rejected. If this ever passes, certificate validation was lost.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live MySQL server using a privately-signed certificate"]
async fn verify_full_rejects_a_privately_signed_certificate() {
    let driver = MysqlDriver::new(tokio::runtime::Handle::current(), config("verify-full"));
    match driver.connect().await {
        Ok(()) => panic!("verify-full accepted a privately-signed certificate"),
        Err(e) => println!("verify-full rejected the privately-signed certificate: {e}"),
    }
}

/// Control: the same query on a plaintext session returns an empty cipher, so
/// the encrypted assertion above is not trivially true.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live MySQL server"]
async fn ssl_mode_disable_reports_an_unencrypted_session() {
    let driver = MysqlDriver::new(tokio::runtime::Handle::current(), config("disable"));
    driver.connect().await.expect("plaintext connect failed");

    let cipher = session_cipher(&driver).await;
    println!("ssl_mode=disable -> Ssl_cipher='{cipher}'");
    assert!(cipher.is_empty(), "plaintext session reported a cipher");
}
