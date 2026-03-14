use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::storage::{AppSettings, SettingsStore};

/// Return the current application settings.
#[tauri::command]
pub async fn get_settings(
    store: State<'_, Mutex<SettingsStore>>,
) -> Result<AppSettings, AppError> {
    let store = store.lock().await;
    Ok(store.get().clone())
}

/// Persist updated application settings.
#[tauri::command]
pub async fn set_settings(
    settings: AppSettings,
    store: State<'_, Mutex<SettingsStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.set(settings);
    store.save()
}
