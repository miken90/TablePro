use std::path::PathBuf;

use crate::models::{AppError, SavedConnection};

/// Persists saved connections to `%APPDATA%/TablePro/connections.json`.
pub struct ConnectionStore {
    connections: Vec<SavedConnection>,
}

impl ConnectionStore {
    pub fn new() -> Self {
        Self {
            connections: vec![],
        }
    }

    fn connections_path() -> Result<PathBuf, AppError> {
        let base = dirs::config_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve config directory".to_string()))?;
        Ok(base.join("TablePro").join("connections.json"))
    }

    /// Load connections from disk; starts empty on any error.
    pub fn load(&mut self) -> Result<(), AppError> {
        let path = Self::connections_path()?;
        if !path.exists() {
            self.connections = vec![];
            return Ok(());
        }
        let data = std::fs::read_to_string(&path)?;
        self.connections = serde_json::from_str(&data)?;
        tracing::info!("Loaded {} connections from disk", self.connections.len());
        Ok(())
    }

    fn persist(&self) -> Result<(), AppError> {
        let path = Self::connections_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(&self.connections)?;
        std::fs::write(&path, data)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<SavedConnection> {
        self.connections.clone()
    }

    /// Upsert a connection by id.
    pub fn save(&mut self, conn: SavedConnection) -> Result<(), AppError> {
        if let Some(existing) = self.connections.iter_mut().find(|c| c.id == conn.id) {
            *existing = conn;
        } else {
            self.connections.push(conn);
        }
        self.persist()
    }

    /// Remove connection by id.
    pub fn delete(&mut self, id: &str) -> Result<(), AppError> {
        let before = self.connections.len();
        self.connections.retain(|c| c.id != id);
        if self.connections.len() == before {
            return Err(AppError::NotFound(format!("Connection {id} not found")));
        }
        self.persist()
    }
}

impl Default for ConnectionStore {
    fn default() -> Self {
        Self::new()
    }
}
