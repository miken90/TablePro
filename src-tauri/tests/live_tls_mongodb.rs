//! Live probe: MongoDB connections really negotiate TLS.
//!
//! Ignored by default because it needs a reachable MongoDB server running in
//! `requireTLS` mode — point it at a throwaway instance. Generate a CA and a
//! `localhost` leaf, concatenate the leaf key and certificate into one PEM,
//! and bake both into an image (mongod refuses a key file it does not own):
//!
//! ```text
//! openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 2 \
//!   -subj "/CN=TablePro Mongo Test CA"
//! openssl req -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.csr -subj "/CN=localhost"
//! printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n" > leaf.ext
//! openssl x509 -req -in leaf.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out leaf.crt \
//!   -days 2 -extfile leaf.ext
//! cat leaf.key leaf.crt > mongo.pem
//!
//! # image: FROM mongo:7, COPY mongo.pem and ca.crt into /certs,
//! #        chown mongodb:mongodb, chmod 600 the PEM
//! docker run -d --name tp-tls-mongo -p 57017:27017 \
//!   -e MONGO_INITDB_ROOT_USERNAME=tpuser -e MONGO_INITDB_ROOT_PASSWORD=TpTls_pass1 \
//!   <image> --tlsMode requireTLS --tlsCertificateKeyFile /certs/mongo.pem \
//!   --tlsCAFile /certs/ca.crt --tlsAllowConnectionsWithoutCertificates
//!
//! set TABLEPRO_MONGO_CA=%TEMP%\tp-mongo-ca.crt
//! cargo test -p tablepro-windows --test live_tls_mongodb -- --ignored --nocapture
//! ```
//!
//! The server runs in `requireTLS`, so it drops any connection that does not
//! complete a handshake: a successful `connect()` here *is* the proof, and the
//! plaintext control below shows the same call failing without TLS.
//!
//! The `mongodb` crate uses rustls 0.23, so this path runs through `aws-lc-rs`
//! / `aws-lc-sys`, and it was the last such path with no live coverage. Trust
//! anchors come from the compiled-in Mozilla root bundle, so a privately
//! signed server certificate needs `tlsCAFile` in the URI — the driver passes
//! a `mongodb://` host through verbatim, which is how the app reaches it.

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_mongodb::MongoDriver;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn host() -> String {
    env_or("TABLEPRO_MONGO_HOST", "127.0.0.1")
}

fn port() -> u16 {
    env_or("TABLEPRO_MONGO_PORT", "57017")
        .parse()
        .unwrap_or(57017)
}

fn credentials() -> (String, String) {
    (
        env_or("TABLEPRO_MONGO_USER", "tpuser"),
        env_or("TABLEPRO_MONGO_PASSWORD", "TpTls_pass1"),
    )
}

/// Path to the CA that signed the server certificate. Empty means "use the
/// driver's built-in trust anchors", which is what the no-CA control wants.
fn ca_path() -> String {
    env_or("TABLEPRO_MONGO_CA", "")
}

/// The app puts whatever the user typed in the host field straight into the
/// URI, so a full `mongodb://…` string with TLS options is a real call site.
fn config(uri: String) -> ConnectionConfig {
    ConnectionConfig {
        host: uri,
        port: 0,
        user: String::new(),
        password: String::new(),
        database: env_or("TABLEPRO_MONGO_DATABASE", "admin"),
        db_type: "mongodb".to_string(),
        ssl_mode: String::new(),
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

fn uri(tls: bool, with_ca: bool) -> String {
    let (user, password) = credentials();
    let mut uri = format!("mongodb://{user}:{password}@{}:{}/admin", host(), port());
    if tls {
        uri.push_str("?tls=true");
        let ca = ca_path();
        if with_ca && !ca.is_empty() {
            uri.push_str("&tlsCAFile=");
            uri.push_str(&ca.replace('\\', "%5C").replace(' ', "%20"));
        }
    }
    uri
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live MongoDB server in requireTLS mode"]
async fn tls_uri_completes_a_handshake() {
    let driver = MongoDriver::new(tokio::runtime::Handle::current(), config(uri(true, true)));
    driver.connect().await.expect("TLS connect failed");

    // `connect()` already round-trips a ping; list databases to prove the
    // encrypted session carries real traffic afterwards.
    let databases = driver.fetch_databases().await.expect("listDatabases failed");
    println!("tls=true -> databases={databases:?}");
    assert!(
        databases.iter().any(|d| d == "admin"),
        "expected the admin database in {databases:?}"
    );

    // Drop the client before the test runtime shuts down; the `mongodb`
    // crate's background workers panic if they outlive it.
    driver.disconnect();
}

/// Control: the server is in `requireTLS`, so the same credentials without TLS
/// must fail. Without this, a passing test above could mean "TLS was silently
/// skipped" rather than "the handshake succeeded".
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live MongoDB server in requireTLS mode"]
async fn plaintext_uri_is_refused() {
    let driver = MongoDriver::new(tokio::runtime::Handle::current(), config(uri(false, false)));
    match driver.connect().await {
        Ok(()) => panic!("a plaintext client connected to a requireTLS server"),
        Err(e) => println!("plaintext connection refused: {e}"),
    }
}

/// Control: certificate validation is on. The same TLS URI without a trust
/// anchor for the private CA has to be rejected — if this ever passes,
/// validation was lost somewhere.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live MongoDB server using a privately signed certificate"]
async fn tls_without_a_trust_anchor_is_rejected() {
    let driver = MongoDriver::new(tokio::runtime::Handle::current(), config(uri(true, false)));
    match driver.connect().await {
        Ok(()) => panic!("connected without a trust anchor for the server certificate"),
        Err(e) => println!("privately signed certificate rejected: {e}"),
    }
}
