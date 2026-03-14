use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, ConnectionConfig, ConnectionStatus};
use crate::services::ConnectionManager;

/// Verify that a config can connect — returns Ok(()) on success.
#[tauri::command]
pub async fn test_connection(
    config: ConnectionConfig,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<(), AppError> {
    let mgr = manager.lock().await;
    mgr.test_connection(&config).await
}

/// Open a persistent connection and return its session ID.
#[tauri::command]
pub async fn connect(
    config: ConnectionConfig,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    let mut mgr = manager.lock().await;
    mgr.connect(&config).await
}

/// Close an existing session.
#[tauri::command]
pub async fn disconnect(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<(), AppError> {
    let mut mgr = manager.lock().await;
    mgr.disconnect(&session_id)
}

/// Return current status for a session.
#[tauri::command]
pub async fn get_connection_status(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<ConnectionStatus, AppError> {
    let mgr = manager.lock().await;
    Ok(mgr.get_status(&session_id))
}
