use std::collections::HashMap;
use std::sync::Arc;

use crate::drivers::DriverRegistry;
use crate::models::{AppError, ConnectionConfig, ConnectionStatus};
use crate::drivers::DatabaseDriver;
use crate::services::ssh_tunnel::SshTunnelManager;

/// A live connection session holding its driver and current status.
struct ActiveConnection {
    driver: Arc<dyn DatabaseDriver>,
    config: ConnectionConfig,
    status: ConnectionStatus,
}

/// Manages all active database connection sessions.
///
/// Holds a shared reference to the `DriverRegistry` to create drivers on
/// demand. SSH tunnels are tracked in a parallel `SshTunnelManager` keyed
/// by session ID.
pub struct ConnectionManager {
    // Drop active connections before releasing driver state.
    connections: HashMap<String, ActiveConnection>,
    ssh_tunnels: SshTunnelManager,
    driver_registry: Arc<DriverRegistry>,
}

impl ConnectionManager {
    pub fn new(driver_registry: Arc<DriverRegistry>) -> Self {
        Self {
            driver_registry,
            connections: HashMap::new(),
            ssh_tunnels: SshTunnelManager::new(),
        }
    }

    pub fn driver_registry(&self) -> Arc<DriverRegistry> {
        Arc::clone(&self.driver_registry)
    }

    pub fn insert_connection(
        &mut self,
        session_id: String,
        driver: Arc<dyn DatabaseDriver>,
        config: ConnectionConfig,
    ) {
        self.connections.insert(
            session_id,
            ActiveConnection {
                driver,
                config,
                status: ConnectionStatus::Connected,
            },
        );
    }

    /// Create an SSH tunnel for `session_id` and return the local port.
    ///
    /// The caller is responsible for creating the driver and connecting to
    /// `127.0.0.1:<local_port>` *after* releasing the manager lock, so the
    /// Tauri runtime stays free to service the tunnel's async tasks.
    pub async fn create_ssh_tunnel(
        &mut self,
        session_id: &str,
        config: &ConnectionConfig,
    ) -> Result<u16, AppError> {
        self.ssh_tunnels
            .create_tunnel(session_id, config)
            .await
            .map_err(|e| AppError::Other(format!("SSH tunnel failed: {e}")))
    }

    /// Disconnect all active sessions and close all SSH tunnels.
    pub fn disconnect_all(&mut self) {
        let ids: Vec<String> = self.connections.keys().cloned().collect();
        for id in ids {
            if let Some(conn) = self.connections.remove(&id) {
                conn.driver.disconnect();
                self.ssh_tunnels.close_tunnel(&id);
                tracing::info!(session_id = %id, "Session closed (shutdown)");
            }
        }
    }

    /// Close a session (and its SSH tunnel if any).
    pub fn disconnect(&mut self, id: &str) -> Result<(), AppError> {
        let conn = self
            .connections
            .remove(id)
            .ok_or_else(|| AppError::NotFound(format!("Session {id} not found")))?;
        conn.driver.disconnect();
        // Close tunnel if one was opened for this session
        self.ssh_tunnels.close_tunnel(id);
        tracing::info!(session_id = %id, "Session closed");
        Ok(())
    }

    /// Return the current status of a session.
    pub fn get_status(&self, id: &str) -> ConnectionStatus {
        self.connections
            .get(id)
            .map(|c| c.status.clone())
            .unwrap_or(ConnectionStatus::Disconnected)
    }

    /// Borrow the driver for a session (for query/schema calls).
    pub fn get_driver(&self, id: &str) -> Result<Arc<dyn DatabaseDriver>, AppError> {
        self.connections
            .get(id)
            .map(|c| Arc::clone(&c.driver))
            .ok_or(AppError::NotConnected)
    }

    /// Return the config used to open a session.
    pub fn get_config(&self, id: &str) -> Result<&ConnectionConfig, AppError> {
        self.connections
            .get(id)
            .map(|c| &c.config)
            .ok_or(AppError::NotConnected)
    }

    /// Update the status of a session. Callers drive this from connection
    /// lifecycle events; there is no background health monitor.
    pub fn set_status(&mut self, id: &str, status: ConnectionStatus) {
        if let Some(conn) = self.connections.get_mut(id) {
            conn.status = status;
        }
    }

    /// Switch the database for an existing session.
    ///
    /// PostgreSQL (and others) require a new connection to change databases.
    /// This disconnects the current driver, creates a fresh one with the
    /// updated database name, and replaces it in-place — keeping the same
    /// session ID so the frontend mapping stays valid.
    pub async fn switch_database(&mut self, id: &str, database: &str) -> Result<(), AppError> {
        let conn = self.connections.get(id).ok_or(AppError::NotConnected)?;

        let mut new_config = conn.config.clone();
        new_config.database = database.to_string();

        let new_driver: Arc<dyn DatabaseDriver> = Arc::from(
            self.driver_registry
                .create_driver(&new_config.db_type, &new_config)?,
        );
        new_driver.connect().await.map_err(|e| {
            tracing::error!(session_id = %id, database, "switch_database connect failed: {e}");
            e
        })?;

        // Disconnect old driver, replace with new one (tunnel stays open — same local port)
        let old = self.connections.remove(id).unwrap(); // safe: checked above
        old.driver.disconnect();

        self.connections.insert(
            id.to_string(),
            ActiveConnection {
                driver: new_driver,
                config: new_config,
                status: ConnectionStatus::Connected,
            },
        );

        tracing::info!(session_id = %id, database, "Switched database");
        Ok(())
    }
}
