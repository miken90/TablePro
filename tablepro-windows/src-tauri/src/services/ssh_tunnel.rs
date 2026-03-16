/// SSH tunnel manager using russh (pure Rust, async-native).
///
/// Architecture:
///   App driver → TCP → 127.0.0.1:{local_port} → SSH channel → db_host:db_port
///
/// Each tunnel:
///   1. Opens TCP connection to SSH server
///   2. Authenticates (password or key file)
///   3. Binds a random local port (127.0.0.1:0)
///   4. Spawns forwarding loop: each incoming local TCP conn →
///      channel_open_direct_tcpip → db_host:db_port
///   5. Returns local_port so connection_manager can override host/port
use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

use crate::models::ConnectionConfig;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum SshTunnelError {
    ConnectionFailed(String),
    AuthFailed(String),
    PortBindFailed(String),
    Io(std::io::Error),
    Russh(russh::Error),
    RusshKeys(russh_keys::Error),
}

impl std::fmt::Display for SshTunnelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConnectionFailed(m) => write!(f, "SSH connection failed: {m}"),
            Self::AuthFailed(m) => write!(f, "SSH authentication failed: {m}"),
            Self::PortBindFailed(m) => write!(f, "Local port bind failed: {m}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Russh(e) => write!(f, "russh error: {e}"),
            Self::RusshKeys(e) => write!(f, "russh-keys error: {e}"),
        }
    }
}

impl std::error::Error for SshTunnelError {}

impl From<std::io::Error> for SshTunnelError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<russh::Error> for SshTunnelError {
    fn from(e: russh::Error) -> Self {
        Self::Russh(e)
    }
}

impl From<russh_keys::Error> for SshTunnelError {
    fn from(e: russh_keys::Error) -> Self {
        Self::RusshKeys(e)
    }
}

// ---------------------------------------------------------------------------
// russh client handler
// ---------------------------------------------------------------------------

/// Minimal client handler that accepts all host keys (P1 — no strict checking).
struct SshClientHandler;

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
    shutdown_tx: Option<oneshot::Sender<()>>,
    /// Handle to the background forwarding task.
    _task: tokio::task::JoinHandle<()>,
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
// Tunnel configuration
// ---------------------------------------------------------------------------

/// SSH tunnel configuration extracted from ConnectionConfig.
pub struct SshTunnelConfig<'a> {
    pub ssh_host: &'a str,
    pub ssh_port: u16,
    pub ssh_user: &'a str,
    pub auth_method: SshAuthMethod<'a>,
    pub db_host: &'a str,
    pub db_port: u16,
}

pub enum SshAuthMethod<'a> {
    Password(&'a str),
    PublicKey { key_path: &'a str, passphrase: Option<&'a str> },
}

/// Build a `SshTunnelConfig` from a `ConnectionConfig`.
/// Returns `None` if SSH is not enabled.
pub fn tunnel_config_from_connection(config: &ConnectionConfig) -> Option<SshTunnelConfig<'_>> {
    if !config.ssh_enabled {
        return None;
    }
    let auth_method = if config.ssh_auth_method == "key" {
        SshAuthMethod::PublicKey {
            key_path: &config.ssh_key_path,
            passphrase: if config.ssh_key_passphrase.is_empty() {
                None
            } else {
                Some(&config.ssh_key_passphrase)
            },
        }
    } else {
        SshAuthMethod::Password(&config.ssh_password)
    };

    Some(SshTunnelConfig {
        ssh_host: &config.ssh_host,
        ssh_port: config.ssh_port,
        ssh_user: &config.ssh_user,
        auth_method,
        db_host: &config.host,
        db_port: config.port,
    })
}

/// Open an SSH tunnel and return a running `SshTunnel`.
///
/// Steps:
/// 1. TCP-connect to SSH server
/// 2. Authenticate (password or key)
/// 3. Bind `127.0.0.1:0` — OS assigns a free port
/// 4. Spawn forwarding loop in background
pub async fn open_tunnel(cfg: SshTunnelConfig<'_>) -> Result<SshTunnel, SshTunnelError> {
    let ssh_addr = format!("{}:{}", cfg.ssh_host, cfg.ssh_port);
    tracing::debug!(ssh_addr = %ssh_addr, "Opening SSH tunnel");

    // --- Connect to SSH server ---
    let russh_config = russh::client::Config {
        ..Default::default()
    };
    let mut session = russh::client::connect(
        Arc::new(russh_config),
        ssh_addr.as_str(),
        SshClientHandler,
    )
    .await
    .map_err(|e| SshTunnelError::ConnectionFailed(e.to_string()))?;

    // --- Authenticate ---
    let authed = match cfg.auth_method {
        SshAuthMethod::Password(pwd) => {
            session
                .authenticate_password(cfg.ssh_user, pwd)
                .await
                .map_err(|e| SshTunnelError::AuthFailed(e.to_string()))?
        }
        SshAuthMethod::PublicKey { key_path, passphrase } => {
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

    // --- Bind local port ---
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| SshTunnelError::PortBindFailed(e.to_string()))?;
    let local_port = listener
        .local_addr()
        .map_err(|e| SshTunnelError::PortBindFailed(e.to_string()))?
        .port();

    tracing::info!(local_port, db_host = cfg.db_host, db_port = cfg.db_port, "SSH tunnel ready");

    // Clone strings for the forwarding loop (must be 'static for tokio::spawn)
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
                            // Open a new direct-tcpip channel for this connection
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
async fn forward_connection(
    mut tcp: TcpStream,
    channel: russh::Channel<russh::client::Msg>,
) {
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

// ---------------------------------------------------------------------------
// SshTunnelManager — keyed by session_id
// ---------------------------------------------------------------------------

/// Manages active SSH tunnels, keyed by database session ID.
pub struct SshTunnelManager {
    tunnels: HashMap<String, SshTunnel>,
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self { tunnels: HashMap::new() }
    }

    /// Create a tunnel for a session and return the local port.
    pub async fn create_tunnel(
        &mut self,
        session_id: &str,
        config: &ConnectionConfig,
    ) -> Result<u16, SshTunnelError> {
        let tunnel_cfg = tunnel_config_from_connection(config)
            .ok_or_else(|| SshTunnelError::ConnectionFailed("SSH not enabled".to_string()))?;

        let tunnel = open_tunnel(tunnel_cfg).await?;
        let port = tunnel.local_port();
        self.tunnels.insert(session_id.to_string(), tunnel);
        tracing::info!(session_id, local_port = port, "SSH tunnel registered");
        Ok(port)
    }

    /// Close and remove the tunnel for a session (if any).
    pub fn close_tunnel(&mut self, session_id: &str) {
        if let Some(mut tunnel) = self.tunnels.remove(session_id) {
            tunnel.shutdown();
            tracing::info!(session_id, "SSH tunnel closed");
        }
    }

    /// Returns true if a tunnel exists for the given session.
    pub fn has_tunnel(&self, session_id: &str) -> bool {
        self.tunnels.contains_key(session_id)
    }
}

impl Default for SshTunnelManager {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ssh_config(ssh_enabled: bool) -> ConnectionConfig {
        ConnectionConfig {
            host: "db.internal".to_string(),
            port: 5432,
            user: "dbuser".to_string(),
            password: "dbpass".to_string(),
            database: "mydb".to_string(),
            db_type: "postgres".to_string(),
            ssl_mode: "prefer".to_string(),
            ssh_enabled,
            ssh_host: "bastion.example.com".to_string(),
            ssh_port: 22,
            ssh_user: "ec2-user".to_string(),
            ssh_auth_method: "password".to_string(),
            ssh_password: "sshpass".to_string(),
            ssh_key_path: String::new(),
            ssh_key_passphrase: String::new(),
        }
    }

    #[test]
    fn test_ssh_tunnel_manager_creation() {
        let mgr = SshTunnelManager::new();
        assert!(!mgr.has_tunnel("nonexistent"));
    }

    #[test]
    fn test_tunnel_config_from_connection_disabled() {
        let config = make_ssh_config(false);
        assert!(tunnel_config_from_connection(&config).is_none());
    }

    #[test]
    fn test_tunnel_config_from_connection_password_auth() {
        let config = make_ssh_config(true);
        let tunnel_cfg = tunnel_config_from_connection(&config).unwrap();
        assert_eq!(tunnel_cfg.ssh_host, "bastion.example.com");
        assert_eq!(tunnel_cfg.ssh_port, 22);
        assert_eq!(tunnel_cfg.ssh_user, "ec2-user");
        assert_eq!(tunnel_cfg.db_host, "db.internal");
        assert_eq!(tunnel_cfg.db_port, 5432);
        assert!(matches!(tunnel_cfg.auth_method, SshAuthMethod::Password("sshpass")));
    }

    #[test]
    fn test_tunnel_config_from_connection_key_auth() {
        let config = ConnectionConfig {
            host: "db.internal".to_string(),
            port: 5432,
            user: "dbuser".to_string(),
            password: String::new(),
            database: "prod".to_string(),
            db_type: "postgres".to_string(),
            ssl_mode: "require".to_string(),
            ssh_enabled: true,
            ssh_host: "jump.example.com".to_string(),
            ssh_port: 2222,
            ssh_user: "ubuntu".to_string(),
            ssh_auth_method: "key".to_string(),
            ssh_password: String::new(),
            ssh_key_path: "/home/user/.ssh/id_rsa".to_string(),
            ssh_key_passphrase: String::new(),
        };
        let tunnel_cfg = tunnel_config_from_connection(&config).unwrap();
        assert_eq!(tunnel_cfg.ssh_port, 2222);
        assert!(matches!(
            tunnel_cfg.auth_method,
            SshAuthMethod::PublicKey { key_path: "/home/user/.ssh/id_rsa", passphrase: None }
        ));
    }

    #[test]
    fn test_tunnel_config_key_with_passphrase() {
        let config = ConnectionConfig {
            host: "db.internal".to_string(),
            port: 5432,
            user: "dbuser".to_string(),
            password: String::new(),
            database: "prod".to_string(),
            db_type: "postgres".to_string(),
            ssl_mode: "require".to_string(),
            ssh_enabled: true,
            ssh_host: "jump.example.com".to_string(),
            ssh_port: 22,
            ssh_user: "ubuntu".to_string(),
            ssh_auth_method: "key".to_string(),
            ssh_password: String::new(),
            ssh_key_path: "/home/user/.ssh/id_ed25519".to_string(),
            ssh_key_passphrase: "my-passphrase".to_string(),
        };
        let tunnel_cfg = tunnel_config_from_connection(&config).unwrap();
        assert!(matches!(
            tunnel_cfg.auth_method,
            SshAuthMethod::PublicKey {
                key_path: "/home/user/.ssh/id_ed25519",
                passphrase: Some("my-passphrase")
            }
        ));
    }

    #[test]
    fn test_ssh_tunnel_manager_close_nonexistent() {
        // Closing a non-existent tunnel should be a no-op
        let mut mgr = SshTunnelManager::new();
        mgr.close_tunnel("does-not-exist"); // must not panic
    }

    #[test]
    fn test_ssh_default_port_in_connection_config() {
        // Deserializing JSON without sshPort should give default 22
        let json = r#"{"host":"db.example.com","port":5432,"user":"admin","password":"","database":"prod","dbType":"postgres","sslMode":"require"}"#;
        let cfg: ConnectionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.ssh_port, 22);
        assert!(!cfg.ssh_enabled);
        assert_eq!(cfg.ssh_auth_method, "password");
    }
}
