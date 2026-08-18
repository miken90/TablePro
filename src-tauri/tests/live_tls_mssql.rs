//! Live probe: SQL Server connections really negotiate TLS.
//!
//! Ignored by default because it needs a reachable SQL Server — point it at a
//! throwaway instance (the image generates its own self-signed certificate):
//!
//! ```text
//! docker run -d --name tp-tls-mssql -p 51433:1433 -e ACCEPT_EULA=Y \
//!   -e "MSSQL_SA_PASSWORD=TpTls_pass1!" mcr.microsoft.com/mssql/server:2022-latest
//!
//! cargo test -p tablepro-windows --test live_tls_mssql -- --ignored --nocapture
//! ```
//!
//! `tiberius` 0.12 pulls rustls 0.21 (ring), not the rustls 0.23 / `aws-lc-rs`
//! stack, so this path is independent of the `aws-lc-sys` bump.

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_mssql::MssqlDriver;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn config(ssl_mode: &str) -> ConnectionConfig {
    ConnectionConfig {
        host: env_or("TABLEPRO_MSSQL_HOST", "127.0.0.1"),
        port: env_or("TABLEPRO_MSSQL_PORT", "51433")
            .parse()
            .unwrap_or(51433),
        user: env_or("TABLEPRO_MSSQL_USER", "sa"),
        password: env_or("TABLEPRO_MSSQL_PASSWORD", "TpTls_pass1!"),
        database: env_or("TABLEPRO_MSSQL_DATABASE", "master"),
        db_type: "mssql".to_string(),
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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live SQL Server"]
async fn default_ssl_mode_completes_a_tls_handshake() {
    let driver = MssqlDriver::new(tokio::runtime::Handle::current(), config("prefer"));
    driver.connect().await.expect("TLS connect failed");

    let result = driver
        .execute(
            "SELECT encrypt_option, protocol_type FROM sys.dm_exec_connections \
             WHERE session_id = @@SPID",
        )
        .await
        .expect("dm_exec_connections query failed");
    let row = result.rows.first().expect("no connection row");
    let encrypt = row.first().and_then(|v| v.clone()).unwrap_or_default();
    let protocol = row.get(1).and_then(|v| v.clone()).unwrap_or_default();
    println!("ssl_mode=prefer -> encrypt_option={encrypt} protocol_type={protocol}");
    assert_eq!(
        encrypt.to_uppercase(),
        "TRUE",
        "SQL Server reports the connection as unencrypted"
    );
}

/// tiberius defaults to `EncryptionLevel::Required` and the driver never
/// lowers it, so even `ssl_mode = "disable"` opens an encrypted session. The
/// connection dialog says so; this keeps the claim honest.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live SQL Server"]
async fn ssl_mode_disable_still_encrypts() {
    let driver = MssqlDriver::new(tokio::runtime::Handle::current(), config("disable"));
    driver.connect().await.expect("connect failed");

    let result = driver
        .execute("SELECT encrypt_option FROM sys.dm_exec_connections WHERE session_id = @@SPID")
        .await
        .expect("dm_exec_connections query failed");
    let encrypt = result
        .rows
        .first()
        .and_then(|r| r.first())
        .and_then(|v| v.clone())
        .unwrap_or_default();
    println!("ssl_mode=disable -> encrypt_option={encrypt}");
    assert_eq!(encrypt.to_uppercase(), "TRUE");
}

/// `verify-full` is the only mode that does not call `trust_cert()`, so a
/// self-signed server certificate must be rejected. If this ever passes,
/// certificate verification was disabled.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live SQL Server using a self-signed certificate"]
async fn verify_full_rejects_a_self_signed_certificate() {
    let driver = MssqlDriver::new(tokio::runtime::Handle::current(), config("verify-full"));
    match driver.connect().await {
        Ok(()) => panic!("verify-full accepted a self-signed certificate"),
        Err(e) => println!("verify-full rejected the self-signed certificate: {e}"),
    }
}
