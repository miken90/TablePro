use std::fs::OpenOptions;
use std::io::Write;

use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::storage::{AppSettings, SettingsStore};

/// Return the current application settings.
#[tauri::command]
pub async fn get_settings(store: State<'_, Mutex<SettingsStore>>) -> Result<AppSettings, AppError> {
    let store = store.lock().await;
    Ok(store.get().clone())
}

/// Persist updated application settings.
#[tauri::command]
pub async fn set_settings(
    settings: AppSettings,
    store: State<'_, Mutex<SettingsStore>>,
) -> Result<(), AppError> {
    let mut settings = settings;
    settings.clamp_perf();
    let mut store = store.lock().await;
    store.set(settings);
    store.save()
}

/// Append a renderer-side error to a log file under the app data directory.
#[tauri::command]
pub async fn log_renderer_error(message: String) -> Result<(), AppError> {
    let base = dirs::data_dir()
        .ok_or_else(|| AppError::IoError("Cannot resolve data directory".into()))?
        .join("TablePro");
    std::fs::create_dir_all(&base)?;
    let path = base.join("renderer-errors.log");
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{message}").map_err(|e| AppError::IoError(e.to_string()))
}
