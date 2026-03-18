use std::path::PathBuf;

use crate::models::{AppError, ConnectionGroup, SavedConnection};

#[path = "../services/credential_store.rs"]
mod credential_store;

/// Persists saved connections and groups to `%APPDATA%/TablePro/`.
pub struct ConnectionStore {
    connections: Vec<SavedConnection>,
    groups: Vec<ConnectionGroup>,
}

impl ConnectionStore {
    pub fn new() -> Self {
        Self {
            connections: vec![],
            groups: vec![],
        }
    }

    fn connections_path() -> Result<PathBuf, AppError> {
        let base = dirs::config_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve config directory".to_string()))?;
        Ok(base.join("TablePro").join("connections.json"))
    }

    fn groups_path() -> Result<PathBuf, AppError> {
        let base = dirs::config_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve config directory".to_string()))?;
        Ok(base.join("TablePro").join("groups.json"))
    }

    fn run_blocking_io<T, F>(op: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce() -> Result<T, AppError> + Send + 'static,
    {
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => tokio::task::block_in_place(|| {
                handle.block_on(async move {
                    tokio::task::spawn_blocking(op)
                        .await
                        .map_err(|e| AppError::IoError(format!("Blocking task join error: {e}")))?
                })
            }),
            Err(_) => op(),
        }
    }

    fn decrypt_connection_credentials(conn: &mut SavedConnection) -> Result<bool, AppError> {
        let mut needs_migration = false;

        needs_migration |= Self::decrypt_field(&mut conn.config.password)?;
        needs_migration |= Self::decrypt_field(&mut conn.config.ssh_password)?;
        needs_migration |= Self::decrypt_field(&mut conn.config.ssh_key_passphrase)?;

        Ok(needs_migration)
    }

    fn decrypt_field(value: &mut String) -> Result<bool, AppError> {
        if value.is_empty() {
            return Ok(false);
        }

        let is_encrypted = credential_store::is_encrypted(value);
        *value = credential_store::decrypt_secret(value)?;

        Ok(!is_encrypted)
    }

    fn encrypt_connection_credentials(conn: &mut SavedConnection) -> Result<(), AppError> {
        conn.config.password = credential_store::encrypt_secret(&conn.config.password)?;
        conn.config.ssh_password = credential_store::encrypt_secret(&conn.config.ssh_password)?;
        conn.config.ssh_key_passphrase =
            credential_store::encrypt_secret(&conn.config.ssh_key_passphrase)?;
        Ok(())
    }

    /// Load connections from disk; starts empty on any error.
    pub fn load(&mut self) -> Result<(), AppError> {
        let path = Self::connections_path()?;
        if !path.exists() {
            self.connections = vec![];
            return Ok(());
        }

        let data = Self::run_blocking_io({
            let path = path.clone();
            move || Ok(std::fs::read_to_string(&path)?)
        })?;

        let mut connections: Vec<SavedConnection> = serde_json::from_str(&data)?;
        let mut needs_migration = false;

        for conn in &mut connections {
            needs_migration |= Self::decrypt_connection_credentials(conn)?;
        }

        self.connections = connections;
        tracing::info!("Loaded {} connections from disk", self.connections.len());

        if needs_migration {
            tracing::info!("Detected legacy plaintext credentials; migrating to DPAPI format");
            if let Err(error) = self.persist() {
                tracing::warn!("Failed to auto-migrate legacy credentials: {error}");
            }
        }

        Ok(())
    }

    fn persist(&self) -> Result<(), AppError> {
        let path = Self::connections_path()?;
        let mut to_persist = self.connections.clone();
        for conn in &mut to_persist {
            Self::encrypt_connection_credentials(conn)?;
        }

        let data = serde_json::to_string_pretty(&to_persist)?;

        Self::run_blocking_io(move || {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, data)?;
            Ok(())
        })
    }

    /// Load groups from disk; starts empty if file not present.
    pub fn load_groups(&mut self) -> Result<(), AppError> {
        let path = Self::groups_path()?;
        if !path.exists() {
            self.groups = vec![];
            return Ok(());
        }

        let data = Self::run_blocking_io({
            let path = path.clone();
            move || Ok(std::fs::read_to_string(&path)?)
        })?;

        self.groups = serde_json::from_str(&data)?;
        tracing::info!("Loaded {} connection groups from disk", self.groups.len());
        Ok(())
    }

    fn persist_groups(&self) -> Result<(), AppError> {
        let path = Self::groups_path()?;
        let data = serde_json::to_string_pretty(&self.groups)?;

        Self::run_blocking_io(move || {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, data)?;
            Ok(())
        })
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

    /// Return all groups.
    pub fn list_groups(&self) -> Vec<ConnectionGroup> {
        self.groups.clone()
    }

    /// Upsert a group by id. Rejects empty group names.
    pub fn save_group(&mut self, group: ConnectionGroup) -> Result<(), AppError> {
        if group.name.trim().is_empty() {
            return Err(AppError::ConfigError(
                "Group name cannot be empty".to_string(),
            ));
        }
        if let Some(existing) = self.groups.iter_mut().find(|g| g.id == group.id) {
            *existing = group;
        } else {
            self.groups.push(group);
        }
        self.persist_groups()
    }

    /// Delete a group and clear group_id from any connections that belonged to it.
    pub fn delete_group(&mut self, id: &str) -> Result<(), AppError> {
        let before = self.groups.len();
        self.groups.retain(|g| g.id != id);
        if self.groups.len() == before {
            return Err(AppError::NotFound(format!("Group {id} not found")));
        }

        let mut connections_changed = false;
        for conn in &mut self.connections {
            if conn.group_id.as_deref() == Some(id) {
                conn.group_id = None;
                connections_changed = true;
            }
        }

        self.persist_groups()?;
        if connections_changed {
            self.persist()?;
        }

        Ok(())
    }
}

impl Default for ConnectionStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ConnectionConfig;

    fn make_connection(id: &str, group_id: Option<&str>) -> SavedConnection {
        SavedConnection {
            id: id.to_string(),
            name: format!("DB {id}"),
            config: ConnectionConfig {
                host: "localhost".to_string(),
                port: 5432,
                user: "user".to_string(),
                password: "pass".to_string(),
                database: "db".to_string(),
                db_type: "postgres".to_string(),
                ssl_mode: "prefer".to_string(),
                ssh_enabled: false,
                ssh_host: String::new(),
                ssh_port: 22,
                ssh_user: String::new(),
                ssh_auth_method: String::new(),
                ssh_password: String::new(),
                ssh_key_path: String::new(),
                ssh_key_passphrase: String::new(),
            },
            group_id: group_id.map(|s| s.to_string()),
        }
    }

    fn make_group(id: &str, name: &str) -> ConnectionGroup {
        ConnectionGroup {
            id: id.to_string(),
            name: name.to_string(),
            color: "#ef4444".to_string(),
            order: 0,
            collapsed: false,
        }
    }

    #[test]
    fn test_list_groups_empty() {
        let store = ConnectionStore::new();
        assert!(store.list_groups().is_empty());
    }

    #[test]
    fn test_save_group_rejects_empty_name() {
        let mut store = ConnectionStore::new();
        let group = ConnectionGroup {
            id: "g1".to_string(),
            name: "  ".to_string(),
            color: "#fff".to_string(),
            order: 0,
            collapsed: false,
        };
        assert!(store.save_group(group).is_err());
    }

    #[test]
    fn test_delete_group_clears_connection_group_id() {
        let mut store = ConnectionStore::new();
        store
            .connections
            .push(make_connection("conn-1", Some("g1")));
        store
            .connections
            .push(make_connection("conn-2", Some("g1")));
        store
            .connections
            .push(make_connection("conn-3", Some("g2")));
        store.groups.push(make_group("g1", "Group 1"));
        store.groups.push(make_group("g2", "Group 2"));

        let id = "g1";
        store.groups.retain(|g| g.id != id);
        for conn in &mut store.connections {
            if conn.group_id.as_deref() == Some(id) {
                conn.group_id = None;
            }
        }

        assert_eq!(store.list_groups().len(), 1);
        assert_eq!(store.list_groups()[0].id, "g2");
        let conns = store.list();
        assert_eq!(conns[0].group_id, None);
        assert_eq!(conns[1].group_id, None);
        assert_eq!(conns[2].group_id, Some("g2".to_string()));
    }

    #[test]
    fn test_upsert_group_updates_existing() {
        let mut store = ConnectionStore::new();
        store.groups.push(make_group("g1", "Original Name"));

        let updated = ConnectionGroup {
            id: "g1".to_string(),
            name: "Updated Name".to_string(),
            color: "#3b82f6".to_string(),
            order: 2,
            collapsed: true,
        };
        if let Some(existing) = store.groups.iter_mut().find(|g| g.id == updated.id) {
            *existing = updated;
        }

        let groups = store.list_groups();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "Updated Name");
        assert_eq!(groups[0].color, "#3b82f6");
        assert!(groups[0].collapsed);
    }

    #[test]
    fn test_delete_nonexistent_group_errors() {
        let mut store = ConnectionStore::new();
        store.groups.push(make_group("g1", "Group 1"));
        let before = store.groups.len();
        store.groups.retain(|g| g.id != "nonexistent");
        assert_eq!(store.groups.len(), before);
    }
}
