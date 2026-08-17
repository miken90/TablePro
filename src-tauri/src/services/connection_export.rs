use std::collections::HashMap;

use crate::models::export::{
    ConnectionExportEnvelope, ExportableConnection, ExportableCredentials, ExportableGroup,
    ExportableSshConfig, ExportableTag, ImportPreviewItem,
};
use crate::models::{AppError, ConnectionGroup, SavedConnection};
use crate::storage::ConnectionStore;

const CURRENT_FORMAT_VERSION: u32 = 1;

/// Build an export envelope from the given connections and groups.
pub fn build_envelope(
    connections: &[SavedConnection],
    groups: &[ConnectionGroup],
    include_credentials: bool,
) -> ConnectionExportEnvelope {
    let mut group_names: Vec<String> = Vec::new();
    let mut tag_names: Vec<String> = Vec::new();
    let mut exportable_connections = Vec::with_capacity(connections.len());
    let mut credentials_map: HashMap<String, ExportableCredentials> = HashMap::new();

    for (i, conn) in connections.iter().enumerate() {
        // Resolve group name from group_id
        let group_name = conn.group_id.as_ref().and_then(|gid| {
            groups.iter().find(|g| g.id == *gid).map(|g| g.name.clone())
        });

        // Build SSH config if enabled
        let ssh_config = if conn.config.ssh_enabled {
            Some(ExportableSshConfig {
                enabled: true,
                host: conn.config.ssh_host.clone(),
                port: conn.config.ssh_port,
                username: conn.config.ssh_user.clone(),
                auth_method: conn.config.ssh_auth_method.clone(),
                private_key_path: contract_home(&conn.config.ssh_key_path),
                use_ssh_config: false,
                agent_socket_path: String::new(),
                jump_hosts: None,
            })
        } else {
            None
        };

        let exportable = ExportableConnection {
            name: conn.name.clone(),
            host: conn.config.host.clone(),
            port: conn.config.port,
            database: conn.config.database.clone(),
            username: conn.config.user.clone(),
            db_type: conn.config.db_type.clone(),
            ssh_config,
            ssl_config: None,
            color: conn.color.clone(),
            tag_name: conn.tag.clone(),
            group_name: group_name.clone(),
            safe_mode_level: None,
            ai_policy: None,
            additional_fields: None,
            redis_database: None,
            startup_commands: conn.config.startup_commands.clone(),
        };

        exportable_connections.push(exportable);

        // Collect credentials separately
        if include_credentials {
            let has_creds = !conn.config.password.is_empty()
                || !conn.config.ssh_password.is_empty()
                || !conn.config.ssh_key_passphrase.is_empty();
            if has_creds {
                credentials_map.insert(
                    i.to_string(),
                    ExportableCredentials {
                        password: non_empty(&conn.config.password),
                        ssh_password: non_empty(&conn.config.ssh_password),
                        key_passphrase: non_empty(&conn.config.ssh_key_passphrase),
                        totp_secret: None,
                        plugin_secure_fields: None,
                    },
                );
            }
        }

        // Collect unique group/tag names
        if let Some(ref name) = group_name {
            if !group_names.iter().any(|n| n.eq_ignore_ascii_case(name)) {
                group_names.push(name.clone());
            }
        }
        if let Some(ref tag) = conn.tag {
            if !tag_names.iter().any(|n| n.eq_ignore_ascii_case(tag)) {
                tag_names.push(tag.clone());
            }
        }
    }

    // Build group array with colors
    let exportable_groups: Option<Vec<ExportableGroup>> = if group_names.is_empty() {
        None
    } else {
        Some(
            group_names
                .iter()
                .map(|name| {
                    let color = groups
                        .iter()
                        .find(|g| g.name.eq_ignore_ascii_case(name))
                        .map(|g| g.color.clone());
                    ExportableGroup {
                        name: name.clone(),
                        color,
                    }
                })
                .collect(),
        )
    };

    let exportable_tags: Option<Vec<ExportableTag>> = if tag_names.is_empty() {
        None
    } else {
        Some(
            tag_names
                .iter()
                .map(|name| ExportableTag {
                    name: name.clone(),
                    color: None,
                })
                .collect(),
        )
    };

    let app_version = env!("CARGO_PKG_VERSION").to_string();

    ConnectionExportEnvelope {
        format_version: CURRENT_FORMAT_VERSION,
        exported_at: chrono_now_iso(),
        app_version,
        connections: exportable_connections,
        groups: exportable_groups,
        tags: exportable_tags,
        credentials: if credentials_map.is_empty() {
            None
        } else {
            Some(credentials_map)
        },
    }
}

/// Encode an envelope to pretty JSON bytes.
pub fn encode_envelope(envelope: &ConnectionExportEnvelope) -> Result<Vec<u8>, AppError> {
    serde_json::to_vec_pretty(envelope).map_err(|e| AppError::ConfigError(e.to_string()))
}

/// Decode JSON bytes into an envelope, validating format version.
pub fn decode_envelope(data: &[u8]) -> Result<ConnectionExportEnvelope, AppError> {
    let envelope: ConnectionExportEnvelope =
        serde_json::from_slice(data).map_err(|e| AppError::ConfigError(e.to_string()))?;

    if envelope.format_version > CURRENT_FORMAT_VERSION {
        return Err(AppError::ConfigError(format!(
            "Unsupported format version {}. Please update TablePro.",
            envelope.format_version
        )));
    }

    Ok(envelope)
}

/// Build a preview of what importing the envelope would do.
pub fn preview_import(
    envelope: &ConnectionExportEnvelope,
    existing: &[SavedConnection],
    _existing_groups: &[ConnectionGroup],
) -> Vec<ImportPreviewItem> {
    envelope
        .connections
        .iter()
        .enumerate()
        .map(|(i, conn)| {
            let mut warnings = Vec::new();

            // Check for duplicate by case-insensitive name match
            let duplicate = existing
                .iter()
                .find(|e| e.name.eq_ignore_ascii_case(&conn.name));

            // SSH key path check (Windows path)
            if let Some(ref ssh) = conn.ssh_config {
                let key_path = expand_home(&ssh.private_key_path);
                if !key_path.is_empty() && !std::path::Path::new(&key_path).exists() {
                    warnings.push(format!("SSH key not found: {}", ssh.private_key_path));
                }
            }

            let (status, existing_id, existing_name) = if let Some(dup) = duplicate {
                (
                    "duplicate".to_string(),
                    Some(dup.id.clone()),
                    Some(dup.name.clone()),
                )
            } else if !warnings.is_empty() {
                ("warnings".to_string(), None, None)
            } else {
                ("ready".to_string(), None, None)
            };

            ImportPreviewItem {
                index: i,
                name: conn.name.clone(),
                host: conn.host.clone(),
                port: conn.port,
                db_type: conn.db_type.clone(),
                status,
                existing_id,
                existing_name,
                warnings,
            }
        })
        .collect()
}

/// A resolved import action with optional existing connection ID for replace.
pub struct ImportResolution<'a> {
    pub index: usize,
    pub action: &'a str,
    pub existing_id: Option<&'a str>,
}

/// Apply import resolutions and persist to the store.
pub fn perform_import(
    envelope: &ConnectionExportEnvelope,
    resolutions: &[ImportResolution<'_>],
    store: &mut ConnectionStore,
) -> Result<usize, AppError> {
    let existing_groups = store.list_groups();

    // Create missing groups from envelope
    if let Some(ref env_groups) = envelope.groups {
        for eg in env_groups {
            let exists = existing_groups
                .iter()
                .any(|g| g.name.eq_ignore_ascii_case(&eg.name));
            if !exists {
                let group = ConnectionGroup {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: eg.name.clone(),
                    color: eg.color.clone().unwrap_or_else(|| "#6b7280".to_string()),
                    order: existing_groups.len() as i32,
                    collapsed: false,
                };
                store.save_group(group)?;
            }
        }
    }

    let groups_after = store.list_groups();
    let mut imported_count = 0;

    for res in resolutions {
        if res.index >= envelope.connections.len() {
            continue;
        }
        let conn = &envelope.connections[res.index];

        match res.action {
            "skip" => continue,
            "import_new" | "import_as_copy" => {
                let mut name = conn.name.clone();
                if res.action == "import_as_copy" {
                    name.push_str(" (Imported)");
                }
                let saved = build_saved_connection(conn, envelope, res.index, &name, &groups_after);
                store.save(saved)?;
                imported_count += 1;
            }
            "replace" => {
                // Use the existing_id from preview if provided, else fallback to name match
                let replace_id = if let Some(eid) = res.existing_id {
                    Some(eid.to_string())
                } else {
                    let existing = store.list();
                    existing
                        .iter()
                        .find(|e| e.name.eq_ignore_ascii_case(&conn.name))
                        .map(|e| e.id.clone())
                };

                if let Some(id) = replace_id {
                    let mut saved = build_saved_connection(
                        conn,
                        envelope,
                        res.index,
                        &conn.name,
                        &groups_after,
                    );
                    saved.id = id;
                    store.save(saved)?;
                    imported_count += 1;
                }
            }
            _ => continue,
        }
    }

    Ok(imported_count)
}

/// Build a `tablepro://import?...` URL for sharing.
pub fn build_import_link(conn: &SavedConnection) -> String {
    let mut params = vec![
        format!("name={}", urlencodevalue(&conn.name)),
        format!("host={}", urlencodevalue(&conn.config.host)),
        format!("port={}", conn.config.port),
        format!("type={}", urlencodevalue(&conn.config.db_type)),
    ];
    if !conn.config.user.is_empty() {
        params.push(format!("username={}", urlencodevalue(&conn.config.user)));
    }
    if !conn.config.database.is_empty() {
        params.push(format!(
            "database={}",
            urlencodevalue(&conn.config.database)
        ));
    }
    format!("tablepro://import?{}", params.join("&"))
}

// --- private helpers ---

fn build_saved_connection(
    conn: &ExportableConnection,
    envelope: &ConnectionExportEnvelope,
    index: usize,
    name: &str,
    groups: &[ConnectionGroup],
) -> SavedConnection {
    // Resolve group_id from group name
    let group_id = conn.group_name.as_ref().and_then(|gname| {
        groups
            .iter()
            .find(|g| g.name.eq_ignore_ascii_case(gname))
            .map(|g| g.id.clone())
    });

    // Merge credentials if present
    let creds = envelope
        .credentials
        .as_ref()
        .and_then(|c| c.get(&index.to_string()));

    let password = creds
        .and_then(|c| c.password.clone())
        .unwrap_or_default();
    let ssh_password = creds
        .and_then(|c| c.ssh_password.clone())
        .unwrap_or_default();
    let ssh_key_passphrase = creds
        .and_then(|c| c.key_passphrase.clone())
        .unwrap_or_default();

    SavedConnection {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        config: crate::models::ConnectionConfig {
            host: conn.host.clone(),
            port: conn.port,
            user: conn.username.clone(),
            password,
            database: conn.database.clone(),
            db_type: conn.db_type.clone(),
            ssl_mode: String::new(),
            startup_commands: conn.startup_commands.clone(),
            ssh_enabled: conn
                .ssh_config
                .as_ref()
                .map(|s| s.enabled)
                .unwrap_or(false),
            ssh_host: conn
                .ssh_config
                .as_ref()
                .map(|s| s.host.clone())
                .unwrap_or_default(),
            ssh_port: conn
                .ssh_config
                .as_ref()
                .map(|s| s.port)
                .unwrap_or(22),
            ssh_user: conn
                .ssh_config
                .as_ref()
                .map(|s| s.username.clone())
                .unwrap_or_default(),
            ssh_auth_method: conn
                .ssh_config
                .as_ref()
                .map(|s| s.auth_method.clone())
                .unwrap_or_else(|| "password".to_string()),
            ssh_password,
            ssh_key_path: conn
                .ssh_config
                .as_ref()
                .map(|s| expand_home(&s.private_key_path))
                .unwrap_or_default(),
            ssh_key_passphrase,
        },
        group_id,
        color: conn.color.clone(),
        tag: conn.tag_name.clone(),
    }
}

fn non_empty(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

/// Replace home directory prefix with `~`.
pub fn contract_home(path: &str) -> String {
    if path.is_empty() {
        return path.to_string();
    }
    if let Some(home) = dirs::home_dir() {
        let home_str = home.to_string_lossy();
        if let Some(rest) = path.strip_prefix(home_str.as_ref()) {
            return format!("~{rest}");
        }
    }
    path.to_string()
}

/// Expand `~/` to the actual home directory.
pub fn expand_home(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    path.to_string()
}

fn chrono_now_iso() -> String {
    // Simple ISO-8601 timestamp without chrono dependency
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format as "2026-04-10T12:00:00Z" — good enough for export metadata
    let secs_per_day = 86400u64;
    let secs_per_hour = 3600u64;
    let secs_per_min = 60u64;

    let days = now / secs_per_day;
    let time_of_day = now % secs_per_day;
    let hours = time_of_day / secs_per_hour;
    let minutes = (time_of_day % secs_per_hour) / secs_per_min;
    let seconds = time_of_day % secs_per_min;

    // Compute date from days since epoch (1970-01-01)
    let (year, month, day) = days_to_date(days);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

fn days_to_date(days: u64) -> (u64, u64, u64) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

fn urlencodevalue(s: &str) -> String {
    let mut encoded = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => {
                encoded.push_str(&format!("%{b:02X}"));
            }
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ConnectionConfig, ConnectionGroup, SavedConnection};

    fn make_conn(name: &str, group_id: Option<&str>) -> SavedConnection {
        SavedConnection {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            config: ConnectionConfig {
                host: "localhost".to_string(),
                port: 5432,
                user: "admin".to_string(),
                password: "secret123".to_string(),
                database: "mydb".to_string(),
                db_type: "PostgreSQL".to_string(),
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
            },
            group_id: group_id.map(|s| s.to_string()),
            color: Some("#ef4444".to_string()),
            tag: Some("production".to_string()),
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
    fn test_build_envelope_without_credentials() {
        let groups = vec![make_group("g1", "Production")];
        let conns = vec![make_conn("Dev DB", Some("g1"))];

        let envelope = build_envelope(&conns, &groups, false);

        assert_eq!(envelope.format_version, 1);
        assert_eq!(envelope.connections.len(), 1);
        assert_eq!(envelope.connections[0].name, "Dev DB");
        assert_eq!(envelope.connections[0].username, "admin");
        assert!(envelope.credentials.is_none());
        assert!(envelope.groups.is_some());
        assert_eq!(envelope.groups.as_ref().unwrap()[0].name, "Production");
    }

    #[test]
    fn test_build_envelope_with_credentials() {
        let groups = vec![];
        let conns = vec![make_conn("Staging", None)];

        let envelope = build_envelope(&conns, &groups, true);

        let creds = envelope.credentials.as_ref().unwrap();
        assert_eq!(creds["0"].password.as_deref(), Some("secret123"));
    }

    #[test]
    fn test_encode_decode_round_trip() {
        let groups = vec![make_group("g1", "Prod")];
        let conns = vec![make_conn("Test", Some("g1"))];
        let envelope = build_envelope(&conns, &groups, false);

        let encoded = encode_envelope(&envelope).unwrap();
        let decoded = decode_envelope(&encoded).unwrap();

        assert_eq!(decoded.format_version, envelope.format_version);
        assert_eq!(decoded.connections.len(), 1);
        assert_eq!(decoded.connections[0].name, "Test");
    }

    #[test]
    fn test_password_not_in_connection_json() {
        let conns = vec![make_conn("SecretDB", None)];
        let envelope = build_envelope(&conns, &[], false);

        let json = serde_json::to_string(&envelope).unwrap();
        assert!(!json.contains("secret123"));
    }

    #[test]
    fn test_duplicate_detection() {
        let existing = vec![make_conn("Dev DB", None), make_conn("Staging", None)];
        let envelope = ConnectionExportEnvelope {
            format_version: 1,
            exported_at: "2026-04-10T00:00:00Z".to_string(),
            app_version: "0.5.0".to_string(),
            connections: vec![
                crate::models::export::ExportableConnection {
                    name: "dev db".to_string(), // case-insensitive match
                    host: "new-host".to_string(),
                    port: 5432,
                    database: "db".to_string(),
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
                },
                crate::models::export::ExportableConnection {
                    name: "Brand New".to_string(),
                    host: "h".to_string(),
                    port: 3306,
                    database: "d".to_string(),
                    username: "u".to_string(),
                    db_type: "MySQL".to_string(),
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
                },
            ],
            groups: None,
            tags: None,
            credentials: None,
        };

        let preview = preview_import(&envelope, &existing, &[]);
        assert_eq!(preview[0].status, "duplicate");
        assert!(preview[0].existing_id.is_some());
        assert_eq!(preview[1].status, "ready");
    }

    #[test]
    fn test_build_import_link() {
        let conn = make_conn("My DB", None);
        let link = build_import_link(&conn);
        assert!(link.starts_with("tablepro://import?"));
        assert!(link.contains("name=My%20DB"));
        assert!(link.contains("host=localhost"));
        assert!(link.contains("port=5432"));
        assert!(link.contains("type=PostgreSQL"));
    }

    #[test]
    fn test_contract_expand_home() {
        let expanded = expand_home("~/some/path");
        assert!(!expanded.starts_with("~/"));

        let contracted = contract_home(&expanded);
        assert!(contracted.starts_with("~"));
    }
}
