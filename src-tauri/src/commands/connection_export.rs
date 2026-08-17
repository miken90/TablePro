use tauri::State;
use tokio::sync::Mutex;

use crate::models::export::{
    ExportResult, ImportPreviewItem, ImportPreviewResponse, ImportResolutionEntry, ImportResult,
};
use crate::models::AppError;
use crate::services::{connection_export, connection_export_crypto};
use crate::storage::ConnectionStore;

#[tauri::command]
pub async fn export_connections(
    connection_ids: Vec<String>,
    file_path: String,
    include_credentials: bool,
    passphrase: Option<String>,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<ExportResult, AppError> {
    if include_credentials && passphrase.as_ref().is_none_or(|p| p.is_empty()) {
        return Err(AppError::ConfigError(
            "Passphrase is required when exporting credentials".to_string(),
        ));
    }

    let (selected, groups) = {
        let store = store.lock().await;
        let all_connections = store.list();
        let groups = store.list_groups();
        let selected: Vec<_> = all_connections
            .into_iter()
            .filter(|c| connection_ids.contains(&c.id))
            .collect();
        (selected, groups)
    };

    if selected.is_empty() {
        return Err(AppError::NotFound(
            "No matching connections found".to_string(),
        ));
    }

    let envelope = connection_export::build_envelope(&selected, &groups, include_credentials);
    let json_bytes = connection_export::encode_envelope(&envelope)?;

    let file_data = if include_credentials {
        connection_export_crypto::encrypt(&json_bytes, passphrase.as_ref().unwrap())?
    } else {
        json_bytes
    };

    std::fs::write(&file_path, &file_data)?;
    tracing::info!(
        "Exported {} connections to {}",
        selected.len(),
        file_path
    );

    Ok(ExportResult {
        path: file_path,
        count: selected.len(),
    })
}

#[tauri::command]
pub async fn import_connections_preview(
    file_path: String,
    passphrase: Option<String>,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<ImportPreviewResponse, AppError> {
    let raw = std::fs::read(&file_path)?;

    let json_bytes = if connection_export_crypto::is_encrypted(&raw) {
        let pass = passphrase.as_deref().ok_or_else(|| {
            AppError::ConfigError("This file is encrypted. Enter passphrase.".to_string())
        })?;
        connection_export_crypto::decrypt(&raw, pass)?
    } else {
        raw
    };

    let envelope = connection_export::decode_envelope(&json_bytes)?;
    let store = store.lock().await;
    let existing = store.list();
    let existing_groups = store.list_groups();

    let items: Vec<ImportPreviewItem> =
        connection_export::preview_import(&envelope, &existing, &existing_groups);

    Ok(ImportPreviewResponse {
        format_version: envelope.format_version,
        app_version: envelope.app_version,
        exported_at: envelope.exported_at,
        items,
    })
}

#[tauri::command]
pub async fn confirm_import(
    file_path: String,
    passphrase: Option<String>,
    resolutions: Vec<ImportResolutionEntry>,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<ImportResult, AppError> {
    let raw = std::fs::read(&file_path)?;

    let json_bytes = if connection_export_crypto::is_encrypted(&raw) {
        let pass = passphrase.as_deref().ok_or_else(|| {
            AppError::ConfigError("This file is encrypted. Enter passphrase.".to_string())
        })?;
        connection_export_crypto::decrypt(&raw, pass)?
    } else {
        raw
    };

    let envelope = connection_export::decode_envelope(&json_bytes)?;
    let mut store = store.lock().await;

    let res: Vec<connection_export::ImportResolution<'_>> = resolutions
        .iter()
        .map(|r| connection_export::ImportResolution {
            index: r.index,
            action: r.action.as_str(),
            existing_id: r.existing_id.as_deref(),
        })
        .collect();

    let imported_count = connection_export::perform_import(&envelope, &res, &mut store)?;
    tracing::info!("Imported {imported_count} connections from {file_path}");

    Ok(ImportResult { imported_count })
}

#[tauri::command]
pub async fn build_import_link(
    connection_id: String,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<String, AppError> {
    let store = store.lock().await;
    let conn = store
        .list()
        .into_iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| AppError::NotFound(format!("Connection {connection_id} not found")))?;

    Ok(connection_export::build_import_link(&conn))
}
