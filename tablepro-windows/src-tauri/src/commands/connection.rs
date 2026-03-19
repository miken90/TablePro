use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::{AppError, ConnectionConfig, ConnectionStatus};
use crate::plugin::DatabaseDriver;
use crate::services::ConnectionManager;

/// Verify that a config can connect — returns Ok(()) on success.
#[tauri::command]
pub async fn test_connection(
    config: ConnectionConfig,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<(), AppError> {
    if config.ssh_enabled {
        let mgr = manager.lock().await;
        return mgr.test_connection(&config).await;
    }

    let plugin_manager = {
        let mgr = manager.lock().await;
        mgr.plugin_manager()
    };
    let driver: Arc<dyn DatabaseDriver> =
        Arc::from(plugin_manager.create_driver(&config.db_type, &config)?);
    driver.connect().await?;
    let ping = driver.ping().await;
    driver.disconnect();
    ping
}

/// Open a persistent connection and return its session ID.
#[tauri::command]
pub async fn connect(
    config: ConnectionConfig,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    let (session_id, driver): (String, Arc<dyn DatabaseDriver>) = if config.ssh_enabled {
        let mut mgr = manager.lock().await;
        let session_id = mgr.connect(&config).await?;
        let driver = mgr.get_driver(&session_id)?;
        (session_id, driver)
    } else {
        let plugin_manager = {
            let mgr = manager.lock().await;
            mgr.plugin_manager()
        };
        let session_id = Uuid::new_v4().to_string();
        let driver: Arc<dyn DatabaseDriver> =
            Arc::from(plugin_manager.create_driver(&config.db_type, &config)?);
        driver.connect().await.map_err(|e| {
            tracing::error!(db_type = %config.db_type, "connect failed: {e}");
            e
        })?;

        {
            let mut mgr = manager.lock().await;
            mgr.insert_connection(session_id.clone(), Arc::clone(&driver), config.clone());
        }

        (session_id, driver)
    };

    if let Some(startup_commands) = config
        .startup_commands
        .as_deref()
        .map(str::trim)
        .filter(|sql| !sql.is_empty())
    {
        if let Err(error) = driver.execute(startup_commands).await {
            tracing::warn!(
                session_id = %session_id,
                db_type = %config.db_type,
                "startup commands failed (connection remains open): {error}"
            );
        } else {
            tracing::info!(session_id = %session_id, "startup commands executed");
        }
    }

    tracing::info!(session_id = %session_id, db_type = %config.db_type, ssh = config.ssh_enabled, "Session opened");
    Ok(session_id)
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
