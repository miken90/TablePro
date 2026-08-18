//! Live probe: the SSH tunnel completes a real key exchange and forwards.
//!
//! Ignored by default because it needs a reachable SSH server — point it at a
//! throwaway instance:
//!
//! ```text
//! docker run -d --name tp-tls-ssh -p 52222:2222 -e PASSWORD_ACCESS=true \
//!   -e USER_NAME=tptest -e USER_PASSWORD=TpTls_pass1 -e SUDO_ACCESS=false \
//!   lscr.io/linuxserver/openssh-server:latest
//!
//! docker exec tp-tls-ssh sed -i "s/^AllowTcpForwarding no/AllowTcpForwarding yes/" \
//!   /config/sshd/sshd_config
//! docker restart tp-tls-ssh
//!
//! cargo test -p tablepro-windows --test live_ssh_tunnel -- --ignored --nocapture
//! ```
//!
//! That image ships with `AllowTcpForwarding no`; without the edit above the
//! session authenticates but every forwarded connection closes with no bytes.
//!
//! `open_tunnel` records the server fingerprint in `known_hosts.json` under the
//! app data directory (TOFU), so running this adds an entry for the probe host.
//!
//! Traffic is forwarded to the SSH server's own listener, so a byte read back
//! through the tunnel is its version banner: that single assertion covers key
//! exchange, password auth, `direct-tcpip` channel open, and both directions of
//! the forwarding loop, without needing a second container.

use std::time::Duration;

use tablepro_windows::services::ssh_tunnel::{open_tunnel, SshAuthMethod, SshTunnelConfig};
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn ssh_host() -> String {
    env_or("TABLEPRO_SSH_HOST", "127.0.0.1")
}

fn ssh_port() -> u16 {
    env_or("TABLEPRO_SSH_PORT", "52222").parse().unwrap_or(52222)
}

/// Port the SSH server itself listens on inside its own network namespace —
/// used as the forwarding destination so the tunnel has something to talk to.
fn forwarded_port() -> u16 {
    env_or("TABLEPRO_SSH_FORWARD_PORT", "2222")
        .parse()
        .unwrap_or(2222)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live SSH server; writes a known_hosts.json entry"]
async fn tunnel_authenticates_and_forwards_traffic() {
    let host = ssh_host();
    let user = env_or("TABLEPRO_SSH_USER", "tptest");
    let password = env_or("TABLEPRO_SSH_PASSWORD", "TpTls_pass1");

    let tunnel = open_tunnel(SshTunnelConfig {
        ssh_host: &host,
        ssh_port: ssh_port(),
        ssh_user: &user,
        auth_method: SshAuthMethod::Password(&password),
        db_host: "127.0.0.1",
        db_port: forwarded_port(),
    })
    .await
    .expect("SSH tunnel failed to open");

    println!("tunnel listening on 127.0.0.1:{}", tunnel.local_port());

    let mut stream = TcpStream::connect(("127.0.0.1", tunnel.local_port()))
        .await
        .expect("could not connect to the local tunnel port");

    let mut buf = [0u8; 64];
    let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut buf))
        .await
        .expect("timed out waiting for forwarded bytes")
        .expect("read from the forwarded connection failed");

    let banner = String::from_utf8_lossy(&buf[..read]);
    println!("bytes forwarded back through the tunnel: {}", banner.trim());
    assert!(
        banner.starts_with("SSH-2.0"),
        "unexpected payload through the tunnel: {banner}"
    );
}

/// Control: the same tunnel setup with a wrong password must fail, so a pass
/// above really means authentication succeeded.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live SSH server"]
async fn tunnel_rejects_a_wrong_password() {
    let host = ssh_host();
    let user = env_or("TABLEPRO_SSH_USER", "tptest");

    let result = open_tunnel(SshTunnelConfig {
        ssh_host: &host,
        ssh_port: ssh_port(),
        ssh_user: &user,
        auth_method: SshAuthMethod::Password("definitely-not-the-password"),
        db_host: "127.0.0.1",
        db_port: forwarded_port(),
    })
    .await;

    match result {
        Ok(_) => panic!("tunnel opened with a wrong password"),
        Err(e) => println!("tunnel rejected the wrong password: {e}"),
    }
}
