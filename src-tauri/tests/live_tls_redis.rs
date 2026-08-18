//! Live probe: Redis connections really negotiate TLS.
//!
//! Ignored by default because it needs a reachable Redis server with a TLS
//! listener — point it at a throwaway instance:
//!
//! ```text
//! docker run -d --name tp-tls-redis -p 56379:6379 -p 56380:6380 <image-with-certs> \
//!   redis-server --port 6379 --tls-port 6380 --tls-cert-file /certs/server.crt \
//!   --tls-key-file /certs/server.key --tls-ca-cert-file /certs/server.crt \
//!   --tls-auth-clients no --requirepass TpTls_pass1
//!
//! cargo test -p tablepro-windows --test live_tls_redis -- --ignored --nocapture
//! ```
//!
//! The `redis` crate uses rustls 0.23, so this path runs through `aws-lc-rs` /
//! `aws-lc-sys`. It resolves trust anchors with `rustls-native-certs`, which
//! honours `SSL_CERT_FILE`; point that at the CA used to sign the server
//! certificate so the handshake verifies for real instead of being trusted
//! blindly:
//!
//! ```text
//! set SSL_CERT_FILE=%TEMP%\\tp-test-ca.crt
//! ```
//!
//! The driver never disables certificate verification, so without a reachable
//! trust anchor `ssl_mode_require_completes_a_tls_handshake` fails with an
//! `UnknownIssuer` certificate error — that failure is the verification
//! working, not a regression in the driver.

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_redis::RedisDriver;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn config(ssl_mode: &str, port: u16) -> ConnectionConfig {
    ConnectionConfig {
        host: env_or("TABLEPRO_REDIS_HOST", "127.0.0.1"),
        port,
        user: String::new(),
        password: env_or("TABLEPRO_REDIS_PASSWORD", "TpTls_pass1"),
        database: "0".to_string(),
        db_type: "redis".to_string(),
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

fn tls_port() -> u16 {
    env_or("TABLEPRO_REDIS_TLS_PORT", "56380")
        .parse()
        .unwrap_or(56380)
}

fn plain_port() -> u16 {
    env_or("TABLEPRO_REDIS_PORT", "56379")
        .parse()
        .unwrap_or(56379)
}

/// `connect()` sends a PING and rejects anything but PONG, so a successful
/// connect on the `rediss://` scheme is a completed TLS handshake plus a
/// round-tripped command.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live Redis server with a TLS listener"]
async fn ssl_mode_require_completes_a_tls_handshake() {
    let driver = RedisDriver::new(tokio::runtime::Handle::current(), config("require", tls_port()));
    driver.connect().await.expect("TLS connect failed");

    let result = driver
        .execute("PING")
        .await
        .expect("PING over TLS failed");
    println!("ssl_mode=require -> rows={:?}", result.rows);
    driver.ping().await.expect("ping over TLS failed");
}

/// Control: the plaintext driver path cannot talk to the TLS listener, so the
/// test above really depends on the TLS handshake succeeding.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live Redis server with a TLS listener"]
async fn plaintext_client_cannot_use_the_tls_listener() {
    let driver = RedisDriver::new(tokio::runtime::Handle::current(), config("disable", tls_port()));
    match driver.connect().await {
        Ok(()) => panic!("plaintext client completed a session on the TLS port"),
        Err(e) => println!("plaintext client rejected on the TLS port: {e}"),
    }
}

/// Control in the other direction: the same credentials work unencrypted on
/// the plain port, proving a failure above would be about TLS, not auth.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live Redis server"]
async fn plaintext_port_still_connects() {
    let driver = RedisDriver::new(
        tokio::runtime::Handle::current(),
        config("disable", plain_port()),
    );
    driver.connect().await.expect("plaintext connect failed");
}
