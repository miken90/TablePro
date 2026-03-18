use std::sync::Arc;

use async_trait::async_trait;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

use super::ssh_config::{SshAuthMethod, SshTunnelConfig};
use super::ssh_tunnel::SshTunnelError;

// ---------------------------------------------------------------------------
// russh client handler
// ---------------------------------------------------------------------------

/// Minimal client handler that accepts all host keys (P1 — no strict checking).
pub(crate) struct SshClientHandler;

#[async_trait]
impl russh::client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all host keys for P1.
        // TODO: implement known_hosts verification in a future phase.
        Ok(true)
    }
}

// ---------------------------------------------------------------------------
// SshTunnel — one active tunnel
// ---------------------------------------------------------------------------

/// A running SSH port-forward tunnel.
pub struct SshTunnel {
    /// The local port the DB driver should connect to.
    pub local_port: u16,
    /// Send () to this to shut down the forwarding loop.
    pub(crate) shutdown_tx: Option<oneshot::Sender<()>>,
    /// Handle to the background forwarding task.
    pub(crate) _task: tokio::task::JoinHandle<()>,
}

impl SshTunnel {
    pub fn local_port(&self) -> u16 {
        self.local_port
    }

    /// Signal the forwarding loop to stop.
    pub fn shutdown(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        self.shutdown();
    }
}

// ---------------------------------------------------------------------------
// open_tunnel
// ---------------------------------------------------------------------------

/// Open an SSH tunnel and return a running `SshTunnel`.
pub async fn open_tunnel(cfg: SshTunnelConfig<'_>) -> Result<SshTunnel, SshTunnelError> {
    let ssh_addr = format!("{}:{}", cfg.ssh_host, cfg.ssh_port);
    tracing::debug!(ssh_addr = %ssh_addr, "Opening SSH tunnel");

    let russh_config = russh::client::Config {
        ..Default::default()
    };
    let mut session =
        russh::client::connect(Arc::new(russh_config), ssh_addr.as_str(), SshClientHandler)
            .await
            .map_err(|e| SshTunnelError::ConnectionFailed(e.to_string()))?;

    let authed = match cfg.auth_method {
        SshAuthMethod::Password(pwd) => session
            .authenticate_password(cfg.ssh_user, pwd)
            .await
            .map_err(|e| SshTunnelError::AuthFailed(e.to_string()))?,
        SshAuthMethod::PublicKey {
            key_path,
            passphrase,
        } => {
            let key = russh_keys::load_secret_key(key_path, passphrase)
                .map_err(|e| SshTunnelError::AuthFailed(e.to_string()))?;
            session
                .authenticate_publickey(cfg.ssh_user, Arc::new(key))
                .await
                .map_err(|e| SshTunnelError::AuthFailed(e.to_string()))?
        }
    };

    if !authed {
        return Err(SshTunnelError::AuthFailed(
            "Authentication rejected by server".to_string(),
        ));
    }

    tracing::debug!(user = cfg.ssh_user, "SSH authenticated");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| SshTunnelError::PortBindFailed(e.to_string()))?;
    let local_port = listener
        .local_addr()
        .map_err(|e| SshTunnelError::PortBindFailed(e.to_string()))?
        .port();

    tracing::info!(
        local_port,
        db_host = cfg.db_host,
        db_port = cfg.db_port,
        "SSH tunnel ready"
    );

    let db_host = cfg.db_host.to_string();
    let db_port = cfg.db_port;
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

    let task = tokio::spawn(async move {
        loop {
            tokio::select! {
                accept_result = listener.accept() => {
                    match accept_result {
                        Ok((tcp_stream, _peer)) => {
                            let db_host = db_host.clone();
                            match session
                                .channel_open_direct_tcpip(
                                    &db_host,
                                    db_port as u32,
                                    "127.0.0.1",
                                    local_port as u32,
                                )
                                .await
                            {
                                Ok(channel) => {
                                    tokio::spawn(forward_connection(tcp_stream, channel));
                                }
                                Err(e) => {
                                    tracing::warn!("channel_open_direct_tcpip failed: {e}");
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("SSH tunnel accept error: {e}");
                            break;
                        }
                    }
                }
                _ = &mut shutdown_rx => {
                    tracing::debug!("SSH tunnel shutdown signal received");
                    break;
                }
            }
        }
    });

    Ok(SshTunnel {
        local_port,
        shutdown_tx: Some(shutdown_tx),
        _task: task,
    })
}

/// Bidirectional copy between a local TCP stream and an SSH channel.
async fn forward_connection(mut tcp: TcpStream, channel: russh::Channel<russh::client::Msg>) {
    let mut ssh_stream = channel.into_stream();
    let mut tcp_buf = vec![0u8; 16 * 1024];
    let mut ssh_buf = vec![0u8; 16 * 1024];

    loop {
        tokio::select! {
            n = tcp.read(&mut tcp_buf) => {
                match n {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if ssh_stream.write_all(&tcp_buf[..n]).await.is_err() {
                            break;
                        }
                    }
                }
            }
            n = ssh_stream.read(&mut ssh_buf) => {
                match n {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tcp.write_all(&ssh_buf[..n]).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }
}
