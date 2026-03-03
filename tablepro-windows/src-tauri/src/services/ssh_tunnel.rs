//! SSH tunnel management for database connections via bastion hosts.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;

use ssh2::Session;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::models::{SshAuthMethod, SshConfig};

#[derive(Debug)]
pub enum SshTunnelError {
    ConnectionFailed(String),
    AuthenticationFailed(String),
    TunnelCreationFailed(String),
    NoAvailablePort,
    TunnelNotFound(String),
}

impl std::fmt::Display for SshTunnelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConnectionFailed(msg) => write!(f, "SSH connection failed: {}", msg),
            Self::AuthenticationFailed(msg) => write!(f, "SSH authentication failed: {}", msg),
            Self::TunnelCreationFailed(msg) => write!(f, "SSH tunnel creation failed: {}", msg),
            Self::NoAvailablePort => write!(f, "No available local port for SSH tunnel"),
            Self::TunnelNotFound(id) => write!(f, "SSH tunnel not found for connection: {}", id),
        }
    }
}

impl std::error::Error for SshTunnelError {}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TunnelInfo {
    pub connection_id: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub ssh_host: String,
    pub is_active: bool,
}

struct ActiveTunnel {
    local_port: u16,
    remote_host: String,
    remote_port: u16,
    ssh_host: String,
    task_handle: JoinHandle<()>,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
}

pub struct SshTunnelManager {
    tunnels: Arc<Mutex<HashMap<String, ActiveTunnel>>>,
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_tunnel(
        &self,
        connection_id: &str,
        ssh_config: &SshConfig,
        ssh_password: Option<&str>,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<u16, SshTunnelError> {
        // Close existing tunnel for this connection if any
        self.close_tunnel(connection_id).await.ok();

        // Find an available local port
        let local_port = find_available_port()?;

        // Validate SSH connection before spawning the tunnel task
        let session = create_ssh_session(ssh_config, ssh_password)?;
        drop(session);

        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        let ssh_config_clone = ssh_config.clone();
        let ssh_password_owned = ssh_password.map(|s| s.to_string());
        let remote_host_owned = remote_host.to_string();
        let connection_id_owned = connection_id.to_string();

        let task_handle = tokio::spawn(async move {
            run_tunnel_loop(
                &connection_id_owned,
                local_port,
                &ssh_config_clone,
                ssh_password_owned.as_deref(),
                &remote_host_owned,
                remote_port,
                shutdown_rx,
            )
            .await;
        });

        let tunnel = ActiveTunnel {
            local_port,
            remote_host: remote_host.to_string(),
            remote_port,
            ssh_host: ssh_config.host.clone(),
            task_handle,
            shutdown_tx,
        };

        let mut tunnels = self.tunnels.lock().await;
        tunnels.insert(connection_id.to_string(), tunnel);

        Ok(local_port)
    }

    pub async fn close_tunnel(&self, connection_id: &str) -> Result<(), SshTunnelError> {
        let mut tunnels = self.tunnels.lock().await;
        if let Some(tunnel) = tunnels.remove(connection_id) {
            let _ = tunnel.shutdown_tx.send(true);
            tunnel.task_handle.abort();
            Ok(())
        } else {
            Err(SshTunnelError::TunnelNotFound(connection_id.to_string()))
        }
    }

    pub async fn close_all_tunnels(&self) {
        let mut tunnels = self.tunnels.lock().await;
        for (_, tunnel) in tunnels.drain() {
            let _ = tunnel.shutdown_tx.send(true);
            tunnel.task_handle.abort();
        }
    }

    pub async fn get_tunnel_info(&self, connection_id: &str) -> Option<TunnelInfo> {
        let tunnels = self.tunnels.lock().await;
        tunnels.get(connection_id).map(|t| TunnelInfo {
            connection_id: connection_id.to_string(),
            local_port: t.local_port,
            remote_host: t.remote_host.clone(),
            remote_port: t.remote_port,
            ssh_host: t.ssh_host.clone(),
            is_active: !t.task_handle.is_finished(),
        })
    }

    pub async fn get_local_port(&self, connection_id: &str) -> Option<u16> {
        let tunnels = self.tunnels.lock().await;
        tunnels
            .get(connection_id)
            .filter(|t| !t.task_handle.is_finished())
            .map(|t| t.local_port)
    }
}

fn find_available_port() -> Result<u16, SshTunnelError> {
    // Bind to port 0 to let the OS assign an available port
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| {
        SshTunnelError::TunnelCreationFailed(format!("Failed to find available port: {}", e))
    })?;
    let port = listener.local_addr().map_err(|e| {
        SshTunnelError::TunnelCreationFailed(format!("Failed to get local address: {}", e))
    })?;
    Ok(port.port())
}

fn create_ssh_session(
    ssh_config: &SshConfig,
    ssh_password: Option<&str>,
) -> Result<Session, SshTunnelError> {
    let tcp = std::net::TcpStream::connect(format!("{}:{}", ssh_config.host, ssh_config.port))
        .map_err(|e| {
            SshTunnelError::ConnectionFailed(format!(
                "Cannot connect to {}:{} — {}",
                ssh_config.host, ssh_config.port, e
            ))
        })?;

    let mut session = Session::new().map_err(|e| {
        SshTunnelError::ConnectionFailed(format!("Failed to create SSH session: {}", e))
    })?;

    session.set_tcp_stream(tcp);
    session.set_timeout(15_000); // 15s handshake timeout
    session.handshake().map_err(|e| {
        SshTunnelError::ConnectionFailed(format!("SSH handshake failed: {}", e))
    })?;

    match ssh_config.auth_method {
        SshAuthMethod::PrivateKey => {
            let key_path = resolve_key_path(ssh_config.private_key_path.as_deref());
            let key_path = key_path.ok_or_else(|| {
                SshTunnelError::AuthenticationFailed(
                    "No SSH private key found. Checked: custom path, ~/.ssh/id_ed25519, ~/.ssh/id_rsa".to_string(),
                )
            })?;

            session
                .userauth_pubkey_file(
                    &ssh_config.username,
                    None,
                    &key_path,
                    ssh_password,
                )
                .map_err(|e| {
                    SshTunnelError::AuthenticationFailed(format!(
                        "Private key auth failed ({}): {}",
                        key_path.display(),
                        e
                    ))
                })?;
        }
        SshAuthMethod::Password => {
            let password = ssh_password.unwrap_or_default();
            session
                .userauth_password(&ssh_config.username, password)
                .map_err(|e| {
                    SshTunnelError::AuthenticationFailed(format!("Password auth failed: {}", e))
                })?;
        }
    }

    if !session.authenticated() {
        return Err(SshTunnelError::AuthenticationFailed(
            "SSH session not authenticated after auth attempt".to_string(),
        ));
    }

    // Keep-alive every 30s, max 3 missed before disconnect
    session.set_keepalive(true, 30);

    Ok(session)
}

fn resolve_key_path(custom_path: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = custom_path {
        if !path.is_empty() {
            let expanded = expand_tilde(path);
            if expanded.exists() {
                return Some(expanded);
            }
        }
    }

    // Try standard key locations
    if let Some(home) = dirs_home() {
        let ssh_dir = home.join(".ssh");
        for name in &["id_ed25519", "id_rsa"] {
            let p = ssh_dir.join(name);
            if p.exists() {
                return Some(p);
            }
        }
    }

    None
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs_home() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

fn dirs_home() -> Option<PathBuf> {
    dirs::home_dir()
}

async fn run_tunnel_loop(
    _connection_id: &str,
    local_port: u16,
    ssh_config: &SshConfig,
    ssh_password: Option<&str>,
    remote_host: &str,
    remote_port: u16,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    let listener = match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", local_port)).await {
        Ok(l) => l,
        Err(_) => return,
    };

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                break;
            }
            accept_result = listener.accept() => {
                let (client_stream, _) = match accept_result {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let ssh_config = ssh_config.clone();
                let ssh_password = ssh_password.map(|s| s.to_string());
                let remote_host = remote_host.to_string();

                tokio::spawn(async move {
                    handle_tunnel_connection(
                        client_stream,
                        &ssh_config,
                        ssh_password.as_deref(),
                        &remote_host,
                        remote_port,
                    )
                    .await;
                });
            }
        }
    }
}

async fn handle_tunnel_connection(
    mut client_stream: TcpStream,
    ssh_config: &SshConfig,
    ssh_password: Option<&str>,
    remote_host: &str,
    remote_port: u16,
) {
    // Create SSH session and channel in a blocking context (ssh2 is sync)
    let ssh_config = ssh_config.clone();
    let ssh_password = ssh_password.map(|s| s.to_string());
    let remote_host = remote_host.to_string();

    let channel_result = tokio::task::spawn_blocking(move || -> Result<(Session, ssh2::Channel), SshTunnelError> {
        let session = create_ssh_session(&ssh_config, ssh_password.as_deref())?;
        session.set_blocking(true);

        let channel = session
            .channel_direct_tcpip(&remote_host, remote_port, None)
            .map_err(|e| {
                SshTunnelError::TunnelCreationFailed(format!(
                    "Failed to open direct-tcpip channel to {}:{} — {}",
                    remote_host, remote_port, e
                ))
            })?;

        Ok((session, channel))
    })
    .await;

    let (session, mut channel) = match channel_result {
        Ok(Ok(v)) => v,
        _ => return,
    };

    // Set non-blocking for the forwarding loop
    session.set_blocking(false);

    let mut client_buf = vec![0u8; 32768];
    let mut channel_buf = vec![0u8; 32768];

    loop {
        let mut did_work = false;

        // Client → SSH channel
        match client_stream.try_read(&mut client_buf) {
            Ok(0) => break,
            Ok(n) => {
                if channel.write_all(&client_buf[..n]).is_err() {
                    break;
                }
                did_work = true;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        // SSH channel → Client
        match channel.read(&mut channel_buf) {
            Ok(0) => break,
            Ok(n) => {
                if client_stream.try_write(&channel_buf[..n]).is_err() {
                    break;
                }
                did_work = true;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }

        if channel.eof() {
            break;
        }

        if !did_work {
            tokio::time::sleep(std::time::Duration::from_millis(1)).await;
        }
    }

    let _ = channel.close();
    let _ = channel.wait_close();
}
