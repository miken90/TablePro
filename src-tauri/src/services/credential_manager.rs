//! Windows Credential Manager wrapper (Phase 3 Item 2 — dual credential).
//!
//! Layer 1 (DPAPI at-rest encryption in `connection_store.json`) already
//! exists in [`crate::services::credential_store`]. This module adds the
//! optional Layer 2: persisting connection passwords in Windows Credential
//! Manager so the OS handles vault-style retrieval and the user is never
//! prompted for the master DPAPI key on a re-login.
//!
//! Opt-in via the `remember_credentials_in_os_keychain` setting (default
//! `false`). When disabled, the DPAPI-only flow is preserved unchanged.
//!
//! Target naming: `TablePro/<connection-uuid>` per plan §Item 2.

use crate::models::AppError;

const SERVICE_PREFIX: &str = "TablePro";

/// Build the credential-manager target name for a connection.
pub fn target_for_connection(connection_uuid: &str) -> String {
    format!("{SERVICE_PREFIX}/{connection_uuid}")
}

#[cfg(windows)]
fn entry(connection_uuid: &str) -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(&target_for_connection(connection_uuid), "tablepro")
        .map_err(|e| AppError::IoError(format!("keyring entry init: {e}")))
}

/// Store a connection's password in Windows Credential Manager.
#[cfg(windows)]
pub fn save_password(connection_uuid: &str, password: &str) -> Result<(), AppError> {
    let entry = entry(connection_uuid)?;
    entry
        .set_password(password)
        .map_err(|e| AppError::IoError(format!("keyring save: {e}")))
}

/// Retrieve a connection's password from Windows Credential Manager.
/// Returns `Ok(None)` when no entry exists.
#[cfg(windows)]
pub fn load_password(connection_uuid: &str) -> Result<Option<String>, AppError> {
    let entry = entry(connection_uuid)?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::IoError(format!("keyring load: {e}"))),
    }
}

/// Remove a connection's password from Windows Credential Manager.
/// Idempotent: a missing entry is treated as success.
#[cfg(windows)]
pub fn delete_password(connection_uuid: &str) -> Result<(), AppError> {
    let entry = entry(connection_uuid)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::IoError(format!("keyring delete: {e}"))),
    }
}

// ── Non-Windows stubs (linux/macOS dev hosts) ────────────────────────────

#[cfg(not(windows))]
pub fn save_password(_connection_uuid: &str, _password: &str) -> Result<(), AppError> {
    Err(AppError::IoError(
        "Credential Manager only available on Windows".into(),
    ))
}

#[cfg(not(windows))]
pub fn load_password(_connection_uuid: &str) -> Result<Option<String>, AppError> {
    Ok(None)
}

#[cfg(not(windows))]
pub fn delete_password(_connection_uuid: &str) -> Result<(), AppError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_name_format() {
        assert_eq!(
            target_for_connection("abc-123"),
            "TablePro/abc-123"
        );
        // Empty UUID still produces a valid (if useless) target.
        assert_eq!(target_for_connection(""), "TablePro/");
    }

    #[test]
    #[cfg(not(windows))]
    fn non_windows_save_returns_error() {
        let r = save_password("u", "p");
        assert!(r.is_err());
    }

    #[test]
    #[cfg(not(windows))]
    fn non_windows_load_returns_none() {
        let r = load_password("u").unwrap();
        assert!(r.is_none());
    }

    /// End-to-end round trip on Windows hosts only. Marked `#[ignore]` so
    /// it doesn't run in normal CI (which lacks a credential vault), but
    /// can be invoked manually with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    #[cfg(windows)]
    fn windows_round_trip() {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let uuid = format!("test-{}", ts);
        save_password(&uuid, "hunter2").unwrap();
        assert_eq!(load_password(&uuid).unwrap().as_deref(), Some("hunter2"));
        delete_password(&uuid).unwrap();
        assert!(load_password(&uuid).unwrap().is_none());
    }
}
