use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, ConnectionGroup, SavedConnection};
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

/// Return all connection groups.
#[tauri::command]
pub async fn list_groups(
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<Vec<ConnectionGroup>, AppError> {
    let store = store.lock().await;
    Ok(store.list_groups())
}

/// Create or update a connection group.
#[tauri::command]
pub async fn save_group(
    group: ConnectionGroup,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.save_group(group)
}

/// Delete a connection group by id; affected connections become ungrouped.
#[tauri::command]
pub async fn delete_group(
    id: String,
    store: State<'_, Mutex<ConnectionStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.delete_group(&id)
}
