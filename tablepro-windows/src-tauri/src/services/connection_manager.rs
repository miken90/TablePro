use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::models::{AppError, ConnectionConfig, ConnectionStatus};
use crate::plugin::{DatabaseDriver, PluginManager};

/// A live connection session holding its driver and current status.
struct ActiveConnection {
    driver: Box<dyn DatabaseDriver>,
    config: ConnectionConfig,
    status: ConnectionStatus,
}

/// Manages all active database connection sessions.
///
/// Holds a shared reference to the PluginManager to create drivers on demand.
pub struct ConnectionManager {
    plugin_manager: Arc<PluginManager>,
    connections: HashMap<String, ActiveConnection>,
}

impl ConnectionManager {
    pub fn new(plugin_manager: Arc<PluginManager>) -> Self {
        Self { plugin_manager, connections: HashMap::new() }
    }

    /// Open a new session and return its UUID.
    pub async fn connect(&mut self, config: &ConnectionConfig) -> Result<String, AppError> {
        let driver = self.plugin_manager.create_driver(&config.db_type, config)?;

        driver.connect().await.map_err(|e| {
            tracing::error!(db_type = %config.db_type, "connect failed: {e}");
            e
        })?;

        let id = Uuid::new_v4().to_string();
        self.connections.insert(
            id.clone(),
            ActiveConnection {
                driver,
                config: config.clone(),
                status: ConnectionStatus::Connected,
            },
        );
        tracing::info!(session_id = %id, db_type = %config.db_type, "Session opened");
        Ok(id)
    }

    /// Close a session.
    pub fn disconnect(&mut self, id: &str) -> Result<(), AppError> {
        let conn = self
            .connections
            .remove(id)
            .ok_or_else(|| AppError::NotFound(format!("Session {id} not found")))?;
        conn.driver.disconnect();
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
    pub async fn test_connection(&self, config: &ConnectionConfig) -> Result<(), AppError> {
        let driver = self.plugin_manager.create_driver(&config.db_type, config)?;
        driver.connect().await?;
        let ping = driver.ping().await;
        driver.disconnect();
        ping
    }

    /// Borrow the driver for a session (for query/schema calls).
    pub fn get_driver(&self, id: &str) -> Result<&dyn DatabaseDriver, AppError> {
        self.connections
            .get(id)
            .map(|c| c.driver.as_ref())
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
    pub async fn switch_database(
        &mut self,
        id: &str,
        database: &str,
    ) -> Result<(), AppError> {
        let conn = self
            .connections
            .get(id)
            .ok_or(AppError::NotConnected)?;

        let mut new_config = conn.config.clone();
        new_config.database = database.to_string();

        let new_driver = self
            .plugin_manager
            .create_driver(&new_config.db_type, &new_config)?;
        new_driver.connect().await.map_err(|e| {
            tracing::error!(session_id = %id, database, "switch_database connect failed: {e}");
            e
        })?;

        // Disconnect old driver, replace with new one
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
