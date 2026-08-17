use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Top-level envelope for `.tablepro` export files.
/// Wire-compatible with Mac's `formatVersion: 1` layout.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionExportEnvelope {
    pub format_version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub connections: Vec<ExportableConnection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub groups: Option<Vec<ExportableGroup>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<ExportableTag>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credentials: Option<HashMap<String, ExportableCredentials>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportableConnection {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    #[serde(rename = "type")]
    pub db_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh_config: Option<ExportableSshConfig>,
    /// Preserved as opaque JSON to avoid data loss on re-export.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssl_config: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub safe_mode_level: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additional_fields: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub redis_database: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub startup_commands: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportableSshConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: String,
    #[serde(default)]
    pub use_ssh_config: bool,
    #[serde(default)]
    pub agent_socket_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jump_hosts: Option<Vec<ExportableJumpHost>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportableJumpHost {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportableGroup {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportableTag {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportableCredentials {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh_password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_passphrase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub totp_secret: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin_secure_fields: Option<HashMap<String, String>>,
}

/// Result of a preview scan before confirming import.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewItem {
    pub index: usize,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub db_type: String,
    /// "ready" | "duplicate" | "warnings"
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_name: Option<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// Describes how to handle a single connection during import.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResolutionEntry {
    pub index: usize,
    /// "import_new" | "skip" | "replace" | "import_as_copy"
    pub action: String,
    /// For "replace" action: the ID of the existing connection to overwrite.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewResponse {
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub items: Vec<ImportPreviewItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_envelope_round_trip() {
        let envelope = ConnectionExportEnvelope {
            format_version: 1,
            exported_at: "2026-04-10T12:00:00Z".to_string(),
            app_version: "0.5.0".to_string(),
            connections: vec![ExportableConnection {
                name: "Dev DB".to_string(),
                host: "localhost".to_string(),
                port: 5432,
                database: "mydb".to_string(),
                username: "admin".to_string(),
                db_type: "PostgreSQL".to_string(),
                ssh_config: None,
                ssl_config: None,
                color: Some("#ef4444".to_string()),
                tag_name: None,
                group_name: Some("Production".to_string()),
                safe_mode_level: None,
                ai_policy: None,
                additional_fields: None,
                redis_database: None,
                startup_commands: None,
            }],
            groups: Some(vec![ExportableGroup {
                name: "Production".to_string(),
                color: Some("#ef4444".to_string()),
            }]),
            tags: None,
            credentials: None,
        };

        let json = serde_json::to_string_pretty(&envelope).unwrap();
        let decoded: ConnectionExportEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.format_version, 1);
        assert_eq!(decoded.connections.len(), 1);
        assert_eq!(decoded.connections[0].name, "Dev DB");
        assert_eq!(decoded.connections[0].db_type, "PostgreSQL");
        assert_eq!(decoded.groups.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn test_exportable_connection_never_contains_password() {
        let conn = ExportableConnection {
            name: "Test".to_string(),
            host: "h".to_string(),
            port: 5432,
            database: "d".to_string(),
            username: "u".to_string(),
            db_type: "PostgreSQL".to_string(),
            ssh_config: None,
            ssl_config: None,
            color: None,
            tag_name: None,
            group_name: None,
            safe_mode_level: None,
            ai_policy: None,
            additional_fields: None,
            redis_database: None,
            startup_commands: None,
        };
        let json = serde_json::to_string(&conn).unwrap();
        assert!(!json.contains("password"));
        assert!(!json.contains("passphrase"));
    }

    #[test]
    fn test_mac_only_fields_deserialize() {
        // Simulate a Mac-exported envelope with fields Windows doesn't use
        let json = r#"{
            "formatVersion": 1,
            "exportedAt": "2026-04-10T00:00:00Z",
            "appVersion": "3.0.0",
            "connections": [{
                "name": "Mac DB",
                "host": "mac.local",
                "port": 5432,
                "database": "db",
                "username": "user",
                "type": "PostgreSQL",
                "sslConfig": {"mode": "require", "caCertificatePath": "~/certs/ca.pem"},
                "aiPolicy": "readOnly",
                "safeModeLevel": "warning",
                "additionalFields": {"customKey": "customValue"}
            }]
        }"#;

        let envelope: ConnectionExportEnvelope = serde_json::from_str(json).unwrap();
        assert_eq!(envelope.connections[0].name, "Mac DB");
        assert!(envelope.connections[0].ssl_config.is_some());
        assert_eq!(
            envelope.connections[0].ai_policy.as_deref(),
            Some("readOnly")
        );
    }

    #[test]
    fn test_credentials_serde() {
        let mut creds = std::collections::HashMap::new();
        creds.insert(
            "0".to_string(),
            ExportableCredentials {
                password: Some("secret".to_string()),
                ssh_password: None,
                key_passphrase: None,
                totp_secret: None,
                plugin_secure_fields: None,
            },
        );
        let envelope = ConnectionExportEnvelope {
            format_version: 1,
            exported_at: "2026-04-10T00:00:00Z".to_string(),
            app_version: "0.5.0".to_string(),
            connections: vec![],
            groups: None,
            tags: None,
            credentials: Some(creds),
        };
        let json = serde_json::to_string(&envelope).unwrap();
        let decoded: ConnectionExportEnvelope = serde_json::from_str(&json).unwrap();
        let c = decoded.credentials.unwrap();
        assert_eq!(c["0"].password.as_deref(), Some("secret"));
    }
}
