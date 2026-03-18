use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::models::{AppError, ConnectionConfig, ConnectionStatus};
use crate::plugin::{DatabaseDriver, PluginManager};
use crate::services::ssh_tunnel::SshTunnelManager;

/// A live connection session holding its driver and current status.
struct ActiveConnection {
    driver: Arc<dyn DatabaseDriver>,
    config: ConnectionConfig,
    status: ConnectionStatus,
}

/// Manages all active database connection sessions.
///
/// Holds a shared reference to the PluginManager to create drivers on demand.
/// SSH tunnels are tracked in a parallel `SshTunnelManager` keyed by session ID.
pub struct ConnectionManager {
    // Drop active connections before releasing plugin DLL/vtable state.
    connections: HashMap<String, ActiveConnection>,
    ssh_tunnels: SshTunnelManager,
    plugin_manager: Arc<PluginManager>,
}

impl ConnectionManager {
    pub fn new(plugin_manager: Arc<PluginManager>) -> Self {
        Self {
            plugin_manager,
            connections: HashMap::new(),
            ssh_tunnels: SshTunnelManager::new(),
        }
    }

    pub fn plugin_manager(&self) -> Arc<PluginManager> {
        Arc::clone(&self.plugin_manager)
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

    /// Open a new session and return its UUID.
    ///
    /// If `config.ssh_enabled`, first creates an SSH tunnel and overrides the
    /// DB host/port to point at the local tunnel endpoint.
    pub async fn connect(&mut self, config: &ConnectionConfig) -> Result<String, AppError> {
        // Prepare the effective config (potentially SSH-tunnelled) and session ID.
        // If SSH is enabled we pre-generate the session ID so it can be used as
        // the tunnel key before we know the final session ID.
        let (session_id, connect_config) = if config.ssh_enabled {
            let id = Uuid::new_v4().to_string();
            let local_port = self
                .ssh_tunnels
                .create_tunnel(&id, config)
                .await
                .map_err(|e| AppError::Other(format!("SSH tunnel failed: {e}")))?;

            let mut cfg = config.clone();
            cfg.host = "127.0.0.1".to_string();
            cfg.port = local_port;
            (id, cfg)
        } else {
            (Uuid::new_v4().to_string(), config.clone())
        };

        let driver: Arc<dyn DatabaseDriver> = Arc::from(
            self.plugin_manager
                .create_driver(&connect_config.db_type, &connect_config)?,
        );
        driver.connect().await.map_err(|e| {
            tracing::error!(db_type = %connect_config.db_type, "connect failed: {e}");
            e
        })?;

        self.insert_connection(session_id.clone(), driver, connect_config.clone());
        tracing::info!(session_id = %session_id, db_type = %connect_config.db_type, ssh = config.ssh_enabled, "Session opened");
        Ok(session_id)
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

    /// Test a config without persisting a session.
    ///
    /// If SSH is enabled, creates a temporary tunnel, tests the DB, then closes both.
    pub async fn test_connection(&self, config: &ConnectionConfig) -> Result<(), AppError> {
        if config.ssh_enabled {
            // Spin up a temporary SSH tunnel for the test
            let mut temp_mgr = SshTunnelManager::new();
            let local_port = temp_mgr
                .create_tunnel("__test__", config)
                .await
                .map_err(|e| AppError::Other(format!("SSH tunnel failed: {e}")))?;

            let mut test_cfg = config.clone();
            test_cfg.host = "127.0.0.1".to_string();
            test_cfg.port = local_port;

            let driver: Arc<dyn DatabaseDriver> = Arc::from(
                self.plugin_manager
                    .create_driver(&test_cfg.db_type, &test_cfg)?,
            );
            driver.connect().await?;
            let ping = driver.ping().await;
            driver.disconnect();
            temp_mgr.close_tunnel("__test__");
            ping
        } else {
            let driver: Arc<dyn DatabaseDriver> =
                Arc::from(self.plugin_manager.create_driver(&config.db_type, config)?);
            driver.connect().await?;
            let ping = driver.ping().await;
            driver.disconnect();
            ping
        }
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
            self.plugin_manager
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
