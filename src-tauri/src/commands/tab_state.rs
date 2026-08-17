use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::storage::{TabStateFile, TabStateStore};

/// Return the current persisted tab state.
#[tauri::command]
pub async fn get_tab_state(
    store: State<'_, Mutex<TabStateStore>>,
) -> Result<TabStateFile, AppError> {
    let store = store.lock().await;
    Ok(store.get().clone())
}

/// Persist updated tab state to disk.
#[tauri::command]
pub async fn set_tab_state(
    state: TabStateFile,
    store: State<'_, Mutex<TabStateStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.set(state);
    store.save()
}

/// Mark localStorage migration as complete so it is not re-imported.
#[tauri::command]
pub async fn mark_localstorage_migrated(
    store: State<'_, Mutex<TabStateStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.mark_migrated();
    store.save()
}
