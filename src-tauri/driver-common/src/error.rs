use serde::{Deserialize, Serialize};
use std::fmt;

/// Errors returned by `DatabaseDriver` implementations.
///
/// Drivers should map their backend-specific errors to one of these variants.
/// The host (`tablepro-windows`) converts `DriverError` into its `AppError`
/// for IPC propagation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "message")]
pub enum DriverError {
    /// Failed to establish or maintain a network/socket connection.
    Connection(String),
    /// Query execution failed (syntax error, constraint violation, etc).
    Query(String),
    /// Authentication or authorization failure.
    Auth(String),
    /// Operation timed out.
    Timeout(String),
    /// Operation is not supported by this driver/backend.
    Unsupported(String),
    /// Catch-all for errors that don't fit other variants.
    Other(String),
}

impl fmt::Display for DriverError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DriverError::Connection(msg) => write!(f, "Connection error: {msg}"),
            DriverError::Query(msg) => write!(f, "Query error: {msg}"),
            DriverError::Auth(msg) => write!(f, "Authentication error: {msg}"),
            DriverError::Timeout(msg) => write!(f, "Timeout: {msg}"),
            DriverError::Unsupported(msg) => write!(f, "Unsupported: {msg}"),
            DriverError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for DriverError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_display_variants() {
        assert_eq!(
            format!("{}", DriverError::Connection("refused".to_string())),
            "Connection error: refused"
        );
        assert_eq!(
            format!("{}", DriverError::Query("syntax".to_string())),
            "Query error: syntax"
        );
        assert_eq!(
            format!("{}", DriverError::Auth("bad creds".to_string())),
            "Authentication error: bad creds"
        );
        assert_eq!(
            format!("{}", DriverError::Timeout("30s".to_string())),
            "Timeout: 30s"
        );
        assert_eq!(
            format!("{}", DriverError::Unsupported("cursors".to_string())),
            "Unsupported: cursors"
        );
        assert_eq!(
            format!("{}", DriverError::Other("misc".to_string())),
            "misc"
        );
    }

    #[test]
    fn test_serde_round_trip() {
        let e = DriverError::Connection("timeout".to_string());
        let json = serde_json::to_string(&e).unwrap();
        let back: DriverError = serde_json::from_str(&json).unwrap();
        assert_eq!(e, back);
    }
}
