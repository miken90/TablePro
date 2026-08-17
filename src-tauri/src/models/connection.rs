use serde::{Deserialize, Serialize};

/// A named folder for grouping connections in the sidebar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionGroup {
    pub id: String,
    pub name: String,
    /// Hex color string, e.g. "#ef4444".
    pub color: String,
    pub order: i32,
    pub collapsed: bool,
}

fn default_ssh_port() -> u16 {
    22
}

fn default_ssh_auth_method() -> String {
    "password".to_string()
}

/// Connection configuration for all supported database types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub db_type: String,
    pub ssl_mode: String,
    #[serde(default)]
    pub startup_commands: Option<String>,
    // SSH tunnel fields — all optional with defaults for backward compat
    #[serde(default)]
    pub ssh_enabled: bool,
    #[serde(default)]
    pub ssh_host: String,
    #[serde(default = "default_ssh_port")]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_user: String,
    #[serde(default = "default_ssh_auth_method")]
    pub ssh_auth_method: String,
    #[serde(default)]
    pub ssh_password: String,
    #[serde(default)]
    pub ssh_key_path: String,
    #[serde(default)]
    pub ssh_key_passphrase: String,
}

/// Runtime connection status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Failed(String),
}

/// A persisted connection entry (id + name + config).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub config: ConnectionConfig,
    /// Optional group this connection belongs to.
    #[serde(default)]
    pub group_id: Option<String>,
    /// Optional color used for sidebar/toolbar indicator.
    #[serde(default)]
    pub color: Option<String>,
    /// Optional environment tag.
    #[serde(default)]
    pub tag: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_config_serde_round_trip() {
        let cfg = ConnectionConfig {
            host: "localhost".to_string(),
            port: 5432,
            user: "admin".to_string(),
            password: "secret".to_string(),
            database: "mydb".to_string(),
            db_type: "postgresql".to_string(),
            ssl_mode: "prefer".to_string(),
            startup_commands: None,
            ssh_enabled: false,
            ssh_host: String::new(),
            ssh_port: 22,
            ssh_user: String::new(),
            ssh_auth_method: "password".to_string(),
            ssh_password: String::new(),
            ssh_key_path: String::new(),
            ssh_key_passphrase: String::new(),
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let deserialized: ConnectionConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.host, "localhost");
        assert_eq!(deserialized.port, 5432);
        assert_eq!(deserialized.db_type, "postgresql");
        assert!(!deserialized.ssh_enabled);
        assert_eq!(deserialized.ssh_port, 22);
        assert_eq!(deserialized.ssh_auth_method, "password");
    }

    #[test]
    fn test_connection_config_ssh_defaults() {
        // Deserializing JSON without any SSH fields should yield sensible defaults
        let json = r#"{"host":"db.example.com","port":5432,"user":"admin","password":"","database":"prod","dbType":"postgres","sslMode":"require"}"#;
        let cfg: ConnectionConfig = serde_json::from_str(json).unwrap();
        assert!(!cfg.ssh_enabled);
        assert_eq!(cfg.ssh_port, 22);
        assert_eq!(cfg.ssh_auth_method, "password");
        assert!(cfg.ssh_host.is_empty());
        assert!(cfg.ssh_user.is_empty());
    }

    #[test]
    fn test_saved_connection_serde_round_trip() {
        let conn = SavedConnection {
            id: "abc-123".to_string(),
            name: "Dev DB".to_string(),
            config: ConnectionConfig {
                host: "127.0.0.1".to_string(),
                port: 3306,
                user: "root".to_string(),
                password: "".to_string(),
                database: "test".to_string(),
                db_type: "mysql".to_string(),
                ssl_mode: "disabled".to_string(),
                startup_commands: None,
                ssh_enabled: false,
                ssh_host: String::new(),
                ssh_port: 22,
                ssh_user: String::new(),
                ssh_auth_method: "password".to_string(),
                ssh_password: String::new(),
                ssh_key_path: String::new(),
                ssh_key_passphrase: String::new(),
            },
            group_id: None,
            color: None,
            tag: None,
        };
        let json = serde_json::to_string(&conn).unwrap();
        let deserialized: SavedConnection = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "abc-123");
        assert_eq!(deserialized.name, "Dev DB");
        assert_eq!(deserialized.group_id, None);
    }

    #[test]
    fn test_saved_connection_with_group_id() {
        let conn = SavedConnection {
            id: "xyz-456".to_string(),
            name: "Prod DB".to_string(),
            config: ConnectionConfig {
                host: "prod.example.com".to_string(),
                port: 5432,
                user: "admin".to_string(),
                password: "secret".to_string(),
                database: "proddb".to_string(),
                db_type: "postgres".to_string(),
                ssl_mode: "require".to_string(),
                startup_commands: Some("SET search_path TO public;".to_string()),
                ssh_enabled: false,
                ssh_host: String::new(),
                ssh_port: 22,
                ssh_user: String::new(),
                ssh_auth_method: "password".to_string(),
                ssh_password: String::new(),
                ssh_key_path: String::new(),
                ssh_key_passphrase: String::new(),
            },
            group_id: Some("group-001".to_string()),
            color: Some("#ef4444".to_string()),
            tag: Some("production".to_string()),
        };
        let json = serde_json::to_string(&conn).unwrap();
        let deserialized: SavedConnection = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.group_id, Some("group-001".to_string()));
        assert_eq!(deserialized.color, Some("#ef4444".to_string()));
        assert_eq!(deserialized.tag, Some("production".to_string()));
    }

    #[test]
    fn test_saved_connection_backward_compat_no_group_id() {
        // Old format without groupId field should deserialize with group_id = None
        let json = r#"{"id":"old-1","name":"Old DB","config":{"host":"localhost","port":5432,"user":"u","password":"p","database":"d","dbType":"postgres","sslMode":"prefer"}}"#;
        let deserialized: SavedConnection = serde_json::from_str(json).unwrap();
        assert_eq!(deserialized.id, "old-1");
        assert_eq!(deserialized.group_id, None);
    }

    #[test]
    fn test_connection_group_serde_round_trip() {
        let group = ConnectionGroup {
            id: "g-001".to_string(),
            name: "Production".to_string(),
            color: "#ef4444".to_string(),
            order: 0,
            collapsed: false,
        };
        let json = serde_json::to_string(&group).unwrap();
        let deserialized: ConnectionGroup = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "g-001");
        assert_eq!(deserialized.name, "Production");
        assert_eq!(deserialized.color, "#ef4444");
        assert_eq!(deserialized.order, 0);
        assert!(!deserialized.collapsed);
    }

    #[test]
    fn test_connection_group_collapsed_serde() {
        let group = ConnectionGroup {
            id: "g-002".to_string(),
            name: "Staging".to_string(),
            color: "#3b82f6".to_string(),
            order: 1,
            collapsed: true,
        };
        let json = serde_json::to_string(&group).unwrap();
        let deserialized: ConnectionGroup = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "Staging");
        assert!(deserialized.collapsed);
    }

    #[test]
    fn test_connection_status_equality() {
        assert_eq!(ConnectionStatus::Connected, ConnectionStatus::Connected);
        assert_eq!(
            ConnectionStatus::Disconnected,
            ConnectionStatus::Disconnected
        );
        assert_ne!(ConnectionStatus::Connected, ConnectionStatus::Disconnected);
    }

    #[test]
    fn test_connection_status_failed_equality() {
        let a = ConnectionStatus::Failed("timeout".to_string());
        let b = ConnectionStatus::Failed("timeout".to_string());
        let c = ConnectionStatus::Failed("refused".to_string());
        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
