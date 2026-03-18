use crate::models::ConnectionConfig;

/// SSH tunnel configuration extracted from ConnectionConfig.
pub struct SshTunnelConfig<'a> {
    pub ssh_host: &'a str,
    pub ssh_port: u16,
    pub ssh_user: &'a str,
    pub auth_method: SshAuthMethod<'a>,
    pub db_host: &'a str,
    pub db_port: u16,
}

pub enum SshAuthMethod<'a> {
    Password(&'a str),
    PublicKey {
        key_path: &'a str,
        passphrase: Option<&'a str>,
    },
}

/// Build a `SshTunnelConfig` from a `ConnectionConfig`.
/// Returns `None` if SSH is not enabled.
pub fn tunnel_config_from_connection(config: &ConnectionConfig) -> Option<SshTunnelConfig<'_>> {
    if !config.ssh_enabled {
        return None;
    }
    let auth_method = if config.ssh_auth_method == "key" {
        SshAuthMethod::PublicKey {
            key_path: &config.ssh_key_path,
            passphrase: if config.ssh_key_passphrase.is_empty() {
                None
            } else {
                Some(&config.ssh_key_passphrase)
            },
        }
    } else {
        SshAuthMethod::Password(&config.ssh_password)
    };

    Some(SshTunnelConfig {
        ssh_host: &config.ssh_host,
        ssh_port: config.ssh_port,
        ssh_user: &config.ssh_user,
        auth_method,
        db_host: &config.host,
        db_port: config.port,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ssh_config(ssh_enabled: bool) -> ConnectionConfig {
        ConnectionConfig {
            host: "db.internal".to_string(),
            port: 5432,
            user: "dbuser".to_string(),
            password: "dbpass".to_string(),
            database: "mydb".to_string(),
            db_type: "postgres".to_string(),
            ssl_mode: "prefer".to_string(),
            ssh_enabled,
            ssh_host: "bastion.example.com".to_string(),
            ssh_port: 22,
            ssh_user: "ec2-user".to_string(),
            ssh_auth_method: "password".to_string(),
            ssh_password: "sshpass".to_string(),
            ssh_key_path: String::new(),
            ssh_key_passphrase: String::new(),
        }
    }

    #[test]
    fn test_tunnel_config_from_connection_disabled() {
        let config = make_ssh_config(false);
        assert!(tunnel_config_from_connection(&config).is_none());
    }

    #[test]
    fn test_tunnel_config_from_connection_password_auth() {
        let config = make_ssh_config(true);
        let tunnel_cfg = tunnel_config_from_connection(&config).unwrap();
        assert_eq!(tunnel_cfg.ssh_host, "bastion.example.com");
        assert_eq!(tunnel_cfg.ssh_port, 22);
        assert_eq!(tunnel_cfg.ssh_user, "ec2-user");
        assert_eq!(tunnel_cfg.db_host, "db.internal");
        assert_eq!(tunnel_cfg.db_port, 5432);
        assert!(matches!(
            tunnel_cfg.auth_method,
            SshAuthMethod::Password("sshpass")
        ));
    }

    #[test]
    fn test_tunnel_config_from_connection_key_auth() {
        let config = ConnectionConfig {
            host: "db.internal".to_string(),
            port: 5432,
            user: "dbuser".to_string(),
            password: String::new(),
            database: "prod".to_string(),
            db_type: "postgres".to_string(),
            ssl_mode: "require".to_string(),
            ssh_enabled: true,
            ssh_host: "jump.example.com".to_string(),
            ssh_port: 2222,
            ssh_user: "ubuntu".to_string(),
            ssh_auth_method: "key".to_string(),
            ssh_password: String::new(),
            ssh_key_path: "/home/user/.ssh/id_rsa".to_string(),
            ssh_key_passphrase: String::new(),
        };
        let tunnel_cfg = tunnel_config_from_connection(&config).unwrap();
        assert_eq!(tunnel_cfg.ssh_port, 2222);
        assert!(matches!(
            tunnel_cfg.auth_method,
            SshAuthMethod::PublicKey {
                key_path: "/home/user/.ssh/id_rsa",
                passphrase: None
            }
        ));
    }

    #[test]
    fn test_tunnel_config_key_with_passphrase() {
        let config = ConnectionConfig {
            host: "db.internal".to_string(),
            port: 5432,
            user: "dbuser".to_string(),
            password: String::new(),
            database: "prod".to_string(),
            db_type: "postgres".to_string(),
            ssl_mode: "require".to_string(),
            ssh_enabled: true,
            ssh_host: "jump.example.com".to_string(),
            ssh_port: 22,
            ssh_user: "ubuntu".to_string(),
            ssh_auth_method: "key".to_string(),
            ssh_password: String::new(),
            ssh_key_path: "/home/user/.ssh/id_ed25519".to_string(),
            ssh_key_passphrase: "my-passphrase".to_string(),
        };
        let tunnel_cfg = tunnel_config_from_connection(&config).unwrap();
        assert!(matches!(
            tunnel_cfg.auth_method,
            SshAuthMethod::PublicKey {
                key_path: "/home/user/.ssh/id_ed25519",
                passphrase: Some("my-passphrase")
            }
        ));
    }

    #[test]
    fn test_ssh_default_port_in_connection_config() {
        let json = r#"{"host":"db.example.com","port":5432,"user":"admin","password":"","database":"prod","dbType":"postgres","sslMode":"require"}"#;
        let cfg: ConnectionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.ssh_port, 22);
        assert!(!cfg.ssh_enabled);
        assert_eq!(cfg.ssh_auth_method, "password");
    }
}
