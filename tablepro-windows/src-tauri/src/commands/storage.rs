use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, SavedConnection};
use crate::storage::ConnectionStore;

/// Return all saved connections.
#[tauri::command]
pub async fn list_connections(
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<Vec<SavedConnection>, AppError> {
    let store = store.lock().await;
    Ok(store.list())
}

/// Create or update a saved connection.
#[tauri::command]
pub async fn save_connection(
    connection: SavedConnection,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.save(connection)
}

/// Delete a saved connection by id.
#[tauri::command]
pub async fn delete_connection(
    id: String,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.delete(&id)
}
