use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::ConnectionConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConnection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub db_type: String,
    pub ssl_mode: String,
    pub ssl_ca_cert_path: String,
    pub ssl_client_cert_path: String,
    pub ssl_client_key_path: String,
    pub ssh_enabled: bool,
    pub ssh_host: String,
    pub ssh_port: u16,
    pub ssh_username: String,
    pub ssh_auth_method: String,
    pub ssh_private_key_path: String,
    pub color: String,
    pub tag_id: Option<String>,
    pub group_id: Option<String>,
    pub is_read_only: bool,
}

impl From<&ConnectionConfig> for StoredConnection {
    fn from(config: &ConnectionConfig) -> Self {
        Self {
            id: config.id.clone(),
            name: config.name.clone(),
            host: config.host.clone(),
            port: config.port,
            database: config.database.clone(),
            username: config.username.clone(),
            db_type: serde_json::to_value(&config.db_type)
                .ok()
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| "mysql".to_string()),
            ssl_mode: "disabled".to_string(),
            ssl_ca_cert_path: config.ssl_config.ca_cert_path.clone().unwrap_or_default(),
            ssl_client_cert_path: config.ssl_config.client_cert_path.clone().unwrap_or_default(),
            ssl_client_key_path: config.ssl_config.client_key_path.clone().unwrap_or_default(),
            ssh_enabled: config.ssh_config.enabled,
            ssh_host: config.ssh_config.host.clone(),
            ssh_port: config.ssh_config.port,
            ssh_username: config.ssh_config.username.clone(),
            ssh_auth_method: serde_json::to_value(&config.ssh_config.auth_method)
                .ok()
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| "password".to_string()),
            ssh_private_key_path: config.ssh_config.private_key_path.clone().unwrap_or_default(),
            color: config.color.clone().unwrap_or_else(|| "none".to_string()),
            tag_id: None,
            group_id: None,
            is_read_only: config.is_read_only,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredGroup {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StorageData {
    connections: Vec<StoredConnection>,
    groups: Vec<StoredGroup>,
}

pub struct ConnectionStorage {
    file_path: PathBuf,
}

impl ConnectionStorage {
    pub fn new() -> Self {
        let dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("TablePro");
        fs::create_dir_all(&dir).ok();
        Self {
            file_path: dir.join("connections.json"),
        }
    }

    fn load_data(&self) -> StorageData {
        match fs::read_to_string(&self.file_path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| StorageData {
                connections: Vec::new(),
                groups: Vec::new(),
            }),
            Err(_) => StorageData {
                connections: Vec::new(),
                groups: Vec::new(),
            },
        }
    }

    fn save_data(&self, data: &StorageData) -> Result<(), String> {
        let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
        fs::write(&self.file_path, json).map_err(|e| e.to_string())
    }

    pub fn get_connections(&self) -> Vec<StoredConnection> {
        self.load_data().connections
    }

    pub fn save_connection(&self, connection: StoredConnection) -> Result<(), String> {
        let mut data = self.load_data();
        if let Some(idx) = data.connections.iter().position(|c| c.id == connection.id) {
            data.connections[idx] = connection;
        } else {
            data.connections.push(connection);
        }
        self.save_data(&data)
    }

    pub fn delete_connection(&self, id: &str) -> Result<(), String> {
        let mut data = self.load_data();
        data.connections.retain(|c| c.id != id);
        self.save_data(&data)
    }

    pub fn get_groups(&self) -> Vec<StoredGroup> {
        self.load_data().groups
    }

    pub fn save_group(&self, group: StoredGroup) -> Result<(), String> {
        let mut data = self.load_data();
        if let Some(idx) = data.groups.iter().position(|g| g.id == group.id) {
            data.groups[idx] = group;
        } else {
            data.groups.push(group);
        }
        self.save_data(&data)
    }

    pub fn delete_group(&self, id: &str) -> Result<(), String> {
        let mut data = self.load_data();
        data.groups.retain(|g| g.id != id);
        self.save_data(&data)
    }

    pub fn save_password(&self, connection_id: &str, password: &str) -> Result<(), String> {
        let entry = keyring::Entry::new("TablePro", connection_id).map_err(|e| e.to_string())?;
        entry.set_password(password).map_err(|e| e.to_string())
    }

    pub fn load_password(&self, connection_id: &str) -> Option<String> {
        let entry = keyring::Entry::new("TablePro", connection_id).ok()?;
        entry.get_password().ok()
    }

    pub fn delete_password(&self, connection_id: &str) {
        if let Ok(entry) = keyring::Entry::new("TablePro", connection_id) {
            entry.delete_credential().ok();
        }
    }
}
