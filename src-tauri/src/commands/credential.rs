//! Tauri commands for Windows Credential Manager (Phase 3 Item 2).
//!
//! Opt-in dual-credential store: when the
//! `remember_credentials_in_os_keychain` setting is enabled, the renderer
//! calls these commands to persist/retrieve connection passwords from
//! Windows Credential Manager in addition to the existing DPAPI flow.

use crate::models::AppError;
use crate::services::credential_manager;

#[tauri::command]
pub fn cred_save(connection_id: String, password: String) -> Result<(), AppError> {
    credential_manager::save_password(&connection_id, &password)
}

#[tauri::command]
pub fn cred_load(connection_id: String) -> Result<Option<String>, AppError> {
    credential_manager::load_password(&connection_id)
}

#[tauri::command]
pub fn cred_delete(connection_id: String) -> Result<(), AppError> {
    credential_manager::delete_password(&connection_id)
}
