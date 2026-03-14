use serde::{Deserialize, Serialize};

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
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub config: ConnectionConfig,
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
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let deserialized: ConnectionConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.host, "localhost");
        assert_eq!(deserialized.port, 5432);
        assert_eq!(deserialized.db_type, "postgresql");
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
            },
        };
        let json = serde_json::to_string(&conn).unwrap();
        let deserialized: SavedConnection = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "abc-123");
        assert_eq!(deserialized.name, "Dev DB");
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
