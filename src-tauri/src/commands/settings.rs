use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::bounded_log;
use crate::storage::{AppSettings, SettingsStore};

/// Cap for `renderer-errors.log`. One backup generation is kept, so the log
/// costs at most 2 MiB on disk.
const RENDERER_LOG_MAX_BYTES: u64 = 1024 * 1024;

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

/// Append a renderer-side error to a size-bounded log under the app data
/// directory. Rotates at [`RENDERER_LOG_MAX_BYTES`]; the file used to grow
/// without limit.
#[tauri::command]
pub async fn log_renderer_error(message: String) -> Result<(), AppError> {
    let path = dirs::data_dir()
        .ok_or_else(|| AppError::IoError("Cannot resolve data directory".into()))?
        .join("TablePro")
        .join("renderer-errors.log");
    bounded_log::append_line(&path, &message, RENDERER_LOG_MAX_BYTES)
        .map_err(|e| AppError::IoError(e.to_string()))
}
