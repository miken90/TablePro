use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::{AppError, ConnectionConfig, ConnectionStatus, DriverCapabilities};
use crate::plugin::{DatabaseDriver, PluginMetadataInfo};
use crate::services::health_monitor::HealthMonitor;
use crate::services::ssh_tunnel::SshTunnelManager;
use crate::services::ConnectionManager;

/// Verify that a config can connect — returns Ok(()) on success.
///
/// For SSH connections, the entire test runs *without* holding the
/// ConnectionManager lock so the Tauri runtime stays free to service
/// the SSH tunnel's async tasks.
#[tauri::command]
pub async fn test_connection(
    config: ConnectionConfig,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<(), AppError> {
    // Grab plugin_manager briefly, then release the lock.
    let plugin_manager = {
        let mgr = manager.lock().await;
        mgr.plugin_manager()
    };

    if config.ssh_enabled {
        let mut temp_tunnels = SshTunnelManager::new();
        let local_port = temp_tunnels
            .create_tunnel("__test__", &config)
            .await
            .map_err(|e| AppError::Other(format!("SSH tunnel failed: {e}")))?;

        let mut test_cfg = config.clone();
        test_cfg.host = "127.0.0.1".to_string();
        test_cfg.port = local_port;

        let driver: Arc<dyn DatabaseDriver> =
            Arc::from(plugin_manager.create_driver(&test_cfg.db_type, &test_cfg)?);
        driver.connect().await?;
        let ping = driver.ping().await;
        driver.disconnect();
        temp_tunnels.close_tunnel("__test__");
        return ping;
    }

    let driver: Arc<dyn DatabaseDriver> =
        Arc::from(plugin_manager.create_driver(&config.db_type, &config)?);
    driver.connect().await?;
    let ping = driver.ping().await;
    driver.disconnect();
    ping
}

/// Open a persistent connection and return its session ID.
///
/// For SSH connections, the tunnel is created and the driver connects
/// *without* holding the ConnectionManager lock. The lock is only
/// re-acquired briefly to insert the finished connection.
#[tauri::command]
pub async fn connect(
    app: AppHandle,
    config: ConnectionConfig,
    manager: State<'_, Mutex<ConnectionManager>>,
    health_monitor: State<'_, Mutex<HealthMonitor>>,
) -> Result<String, AppError> {
    // Both SSH and non-SSH paths: grab plugin_manager, release lock.
    let plugin_manager = {
        let mgr = manager.lock().await;
        mgr.plugin_manager()
    };

    let (session_id, driver): (String, Arc<dyn DatabaseDriver>) = if config.ssh_enabled {
        let session_id = Uuid::new_v4().to_string();

        // Create SSH tunnel without holding the manager lock.
        let local_port = {
            let mut mgr = manager.lock().await;
            mgr.create_ssh_tunnel(&session_id, &config).await?
        };

        let mut connect_cfg = config.clone();
        connect_cfg.host = "127.0.0.1".to_string();
        connect_cfg.port = local_port;

        let driver: Arc<dyn DatabaseDriver> =
            Arc::from(plugin_manager.create_driver(&connect_cfg.db_type, &connect_cfg)?);
        driver.connect().await.map_err(|e| {
            tracing::error!(db_type = %connect_cfg.db_type, "SSH connect failed: {e}");
            e
        })?;

        {
            let mut mgr = manager.lock().await;
            mgr.insert_connection(session_id.clone(), Arc::clone(&driver), connect_cfg);
        }

        (session_id, driver)
    } else {
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

    // Start health monitoring (skip SQLite — local file, no network)
    if config.db_type != "sqlite" {
        let mut hm = health_monitor.lock().await;
        hm.start_monitoring(
            session_id.clone(),
            Arc::clone(&driver),
            config.db_type.clone(),
            config.host.clone(),
            config.database.clone(),
            app,
        );
    }

    Ok(session_id)
}

/// Close an existing session.
#[tauri::command]
pub async fn disconnect(
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
    health_monitor: State<'_, Mutex<HealthMonitor>>,
) -> Result<(), AppError> {
    {
        let mut hm = health_monitor.lock().await;
        hm.stop_monitoring(&session_id);
    }
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

/// Reconnect a failed session using its stored config.
#[tauri::command]
pub async fn reconnect_session(
    app: AppHandle,
    session_id: String,
    manager: State<'_, Mutex<ConnectionManager>>,
    health_monitor: State<'_, Mutex<HealthMonitor>>,
) -> Result<(), AppError> {
    // Stop any existing monitoring
    {
        let mut hm = health_monitor.lock().await;
        hm.stop_monitoring(&session_id);
    }

    // Get config + plugin manager, then release lock
    let (config, plugin_manager) = {
        let mgr = manager.lock().await;
        let config = mgr.get_config(&session_id)?.clone();
        let pm = mgr.plugin_manager();
        (config, pm)
    };

    // Disconnect old driver
    {
        let mut mgr = manager.lock().await;
        let _ = mgr.disconnect(&session_id);
    }

    // Create new driver + connect (no lock held)
    let driver: Arc<dyn DatabaseDriver> =
        Arc::from(plugin_manager.create_driver(&config.db_type, &config)?);
    driver.connect().await?;

    // Insert new connection
    {
        let mut mgr = manager.lock().await;
        mgr.insert_connection(session_id.clone(), Arc::clone(&driver), config.clone());
    }

    // Restart health monitoring (skip SQLite)
    if config.db_type != "sqlite" {
        let mut hm = health_monitor.lock().await;
        hm.start_monitoring(
            session_id.clone(),
            Arc::clone(&driver),
            config.db_type.clone(),
            config.host.clone(),
            config.database.clone(),
            app.clone(),
        );
    }

    let _ = app.emit(
        "connection:reconnected",
        serde_json::json!({ "sessionId": session_id }),
    );

    tracing::info!(session_id = %session_id, "Session reconnected");
    Ok(())
}

/// Return metadata (including capabilities) for all loaded driver plugins.
#[tauri::command]
pub async fn list_drivers(
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<PluginMetadataInfo>, AppError> {
    let mgr = manager.lock().await;
    Ok(mgr.plugin_manager().list_plugins())
}

/// Return capabilities for a specific driver type.
#[tauri::command]
pub async fn get_driver_capabilities(
    db_type: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<DriverCapabilities, AppError> {
    let mgr = manager.lock().await;
    Ok(mgr.plugin_manager().get_capabilities(&db_type))
}

/// List parsed SSH hosts from `~/.ssh/config`.
#[tauri::command]
pub async fn list_ssh_hosts() -> Vec<crate::services::ssh_config_parser::SshHostEntry> {
    crate::services::ssh_config_parser::parse_ssh_config()
}
