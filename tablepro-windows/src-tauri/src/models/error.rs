use serde::{Deserialize, Serialize};
use std::fmt;

/// Unified application error type propagated over Tauri IPC.
/// Must impl `serde::Serialize` so Tauri can serialise it to the frontend.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    DatabaseError(String),
    IoError(String),
    ConfigError(String),
    NotFound(String),
    NotConnected,
    PluginError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::DatabaseError(msg) => write!(f, "Database error: {msg}"),
            AppError::IoError(msg) => write!(f, "I/O error: {msg}"),
            AppError::ConfigError(msg) => write!(f, "Configuration error: {msg}"),
            AppError::NotFound(msg) => write!(f, "Not found: {msg}"),
            AppError::NotConnected => write!(f, "Not connected"),
            AppError::PluginError(msg) => write!(f, "Plugin error: {msg}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::IoError(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::ConfigError(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_display_database_error() {
        let e = AppError::DatabaseError("timeout".to_string());
        assert_eq!(format!("{e}"), "Database error: timeout");
    }

    #[test]
    fn test_display_io_error() {
        let e = AppError::IoError("file not found".to_string());
        assert_eq!(format!("{e}"), "I/O error: file not found");
    }

    #[test]
    fn test_display_config_error() {
        let e = AppError::ConfigError("invalid json".to_string());
        assert_eq!(format!("{e}"), "Configuration error: invalid json");
    }

    #[test]
    fn test_display_not_found() {
        let e = AppError::NotFound("session 123".to_string());
        assert_eq!(format!("{e}"), "Not found: session 123");
    }

    #[test]
    fn test_display_not_connected() {
        let e = AppError::NotConnected;
        assert_eq!(format!("{e}"), "Not connected");
    }

    #[test]
    fn test_display_plugin_error() {
        let e = AppError::PluginError("dll load failed".to_string());
        assert_eq!(format!("{e}"), "Plugin error: dll load failed");
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "gone");
        let app_err: AppError = io_err.into();
        match app_err {
            AppError::IoError(msg) => assert!(msg.contains("gone")),
            other => panic!("Expected IoError, got: {other:?}"),
        }
    }

    #[test]
    fn test_from_serde_error() {
        let serde_err = serde_json::from_str::<String>("not json").unwrap_err();
        let app_err: AppError = serde_err.into();
        match app_err {
            AppError::ConfigError(msg) => assert!(!msg.is_empty()),
            other => panic!("Expected ConfigError, got: {other:?}"),
        }
    }
}
