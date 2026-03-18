use std::collections::HashMap;

use crate::models::ConnectionConfig;

pub use super::ssh_config::{SshAuthMethod, SshTunnelConfig, tunnel_config_from_connection};
pub use super::ssh_tunnel_core::{SshTunnel, open_tunnel};

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
// SshTunnelManager — keyed by session_id
// ---------------------------------------------------------------------------

/// Manages active SSH tunnels, keyed by database session ID.
pub struct SshTunnelManager {
    tunnels: HashMap<String, SshTunnel>,
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: HashMap::new(),
        }
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

    #[test]
    fn test_ssh_tunnel_manager_creation() {
        let mgr = SshTunnelManager::new();
        assert!(!mgr.has_tunnel("nonexistent"));
    }

    #[test]
    fn test_ssh_tunnel_manager_close_nonexistent() {
        // Closing a non-existent tunnel should be a no-op
        let mut mgr = SshTunnelManager::new();
        mgr.close_tunnel("does-not-exist"); // must not panic
    }
}
