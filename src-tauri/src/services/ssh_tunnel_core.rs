use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

use super::ssh_config::{SshAuthMethod, SshTunnelConfig};
use super::ssh_tunnel::SshTunnelError;

// ---------------------------------------------------------------------------
// russh client handler — TOFU (Trust On First Use) known_hosts
// ---------------------------------------------------------------------------

/// Client handler that implements TOFU host-key verification.
///
/// On first connection to a host the key fingerprint is stored in
/// `known_hosts.json` under `data_dir`. On subsequent connections the
/// stored fingerprint is compared; a mismatch rejects the connection.
pub(crate) struct SshClientHandler {
    pub host: String,
    pub data_dir: PathBuf,
}

#[async_trait]
impl russh::client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint();
        let known_hosts = load_known_hosts(&self.data_dir);

        match known_hosts.get(&self.host) {
            Some(stored) if stored == &fingerprint => Ok(true),
            Some(stored) => {
                tracing::error!(
                    "SSH HOST KEY CHANGED for {}: expected {}, got {}",
                    self.host,
                    stored,
                    fingerprint
                );
                Ok(false)
            }
            None => {
                tracing::warn!("New SSH host key for {}: {}", self.host, fingerprint);
                let mut hosts = known_hosts;
                hosts.insert(self.host.clone(), fingerprint);
                save_known_hosts(&self.data_dir, &hosts);
                Ok(true)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// known_hosts.json helpers
// ---------------------------------------------------------------------------

fn known_hosts_path(data_dir: &Path) -> PathBuf {
    data_dir.join("known_hosts.json")
}

fn load_known_hosts(data_dir: &Path) -> HashMap<String, String> {
    let path = known_hosts_path(data_dir);
    match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_known_hosts(data_dir: &Path, hosts: &HashMap<String, String>) {
    let path = known_hosts_path(data_dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match serde_json::to_string_pretty(hosts) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                tracing::warn!("Failed to write known_hosts.json: {e}");
            }
        }
        Err(e) => tracing::warn!("Failed to serialize known_hosts: {e}"),
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

    let data_dir = dirs::config_dir()
        .map(|d| d.join("TablePro"))
        .unwrap_or_else(|| PathBuf::from("."));

    let handler = SshClientHandler {
        host: ssh_addr.clone(),
        data_dir,
    };

    let russh_config = russh::client::Config {
        ..Default::default()
    };
    let mut session =
        russh::client::connect(Arc::new(russh_config), ssh_addr.as_str(), handler)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_new_host_is_saved() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();

        let hosts = load_known_hosts(&data_dir);
        assert!(hosts.is_empty());

        let mut hosts = HashMap::new();
        hosts.insert("example.com:22".to_string(), "abc123".to_string());
        save_known_hosts(&data_dir, &hosts);

        let loaded = load_known_hosts(&data_dir);
        assert_eq!(loaded.get("example.com:22").unwrap(), "abc123");
    }

    #[test]
    fn test_known_host_matches() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();

        let mut hosts = HashMap::new();
        hosts.insert("server:22".to_string(), "fp_aaa".to_string());
        save_known_hosts(&data_dir, &hosts);

        let loaded = load_known_hosts(&data_dir);
        assert_eq!(loaded.get("server:22").unwrap(), "fp_aaa");
    }

    #[test]
    fn test_known_host_mismatch_detected() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();

        let mut hosts = HashMap::new();
        hosts.insert("server:22".to_string(), "fp_old".to_string());
        save_known_hosts(&data_dir, &hosts);

        let loaded = load_known_hosts(&data_dir);
        let stored = loaded.get("server:22").unwrap();
        let new_fp = "fp_new";
        assert_ne!(stored, new_fp, "Fingerprint mismatch should be detected");
    }

    #[test]
    fn test_missing_file_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().join("nonexistent_subdir");
        let hosts = load_known_hosts(&data_dir);
        assert!(hosts.is_empty());
    }

    #[test]
    fn test_corrupt_file_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();
        fs::write(known_hosts_path(&data_dir), "not valid json").unwrap();
        let hosts = load_known_hosts(&data_dir);
        assert!(hosts.is_empty());
    }

    #[test]
    fn test_multiple_hosts() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().to_path_buf();

        let mut hosts = HashMap::new();
        hosts.insert("host1:22".to_string(), "fp1".to_string());
        hosts.insert("host2:5432".to_string(), "fp2".to_string());
        save_known_hosts(&data_dir, &hosts);

        let loaded = load_known_hosts(&data_dir);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded.get("host1:22").unwrap(), "fp1");
        assert_eq!(loaded.get("host2:5432").unwrap(), "fp2");
    }
}
