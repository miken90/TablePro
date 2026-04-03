use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{watch, Mutex};
use tokio::task::JoinHandle;

use crate::models::ConnectionStatus;
use crate::plugin::DatabaseDriver;
use crate::services::ConnectionManager;

const PING_INTERVAL_SECS: u64 = 30;

/// Monitors active database connections with periodic pings.
///
/// Each monitored session gets its own spawned task that pings the driver
/// every 30 seconds. On failure the session status is set to `Failed` and
/// a `connection:lost` event is emitted to the frontend.
pub struct HealthMonitor {
    sessions: HashMap<String, (watch::Sender<bool>, JoinHandle<()>)>,
}

impl Default for HealthMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl HealthMonitor {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Begin monitoring a session.
    ///
    /// If a previous monitoring task for this session has already finished
    /// (e.g. after a connection-loss ping failure), the stale entry is cleaned
    /// up automatically so monitoring can restart after reconnect.
    #[allow(clippy::too_many_arguments)]
    pub fn start_monitoring(
        &mut self,
        session_id: String,
        driver: Arc<dyn DatabaseDriver>,
        db_type: String,
        host: String,
        database: String,
        app_handle: AppHandle,
    ) {
        // Clean up finished monitoring task so reconnect can re-register.
        if let Some((_, handle)) = self.sessions.get(&session_id) {
            if handle.is_finished() {
                self.sessions.remove(&session_id);
            } else {
                return; // still actively monitoring
            }
        }

        let (stop_tx, mut stop_rx) = watch::channel(false);

        let sid = session_id.clone();
        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(PING_INTERVAL_SECS)) => {
                        if let Err(e) = driver.ping().await {
                            // Update status via AppHandle state access
                            {
                                let state = app_handle.state::<Mutex<ConnectionManager>>();
                                let mut mgr = state.lock().await;
                                mgr.set_status(
                                    &sid,
                                    ConnectionStatus::Failed(format!("Connection lost: {e}")),
                                );
                            }

                            let _ = app_handle.emit(
                                "connection:lost",
                                serde_json::json!({
                                    "sessionId": sid,
                                    "host": host,
                                    "database": database,
                                    "dbType": db_type,
                                    "message": e.to_string(),
                                }),
                            );

                            tracing::warn!(session_id = %sid, "Connection lost: {e}");
                            break;
                        }
                    }
                    changed = stop_rx.changed() => {
                        if changed.is_err() || *stop_rx.borrow() {
                            break;
                        }
                    }
                }
            }
        });

        self.sessions.insert(session_id, (stop_tx, handle));
    }

    /// Stop monitoring a single session.
    pub fn stop_monitoring(&mut self, session_id: &str) {
        if let Some((tx, handle)) = self.sessions.remove(session_id) {
            let _ = tx.send(true);
            handle.abort();
        }
    }

    /// Stop monitoring all sessions (used on shutdown).
    pub fn stop_all(&mut self) {
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.stop_monitoring(&id);
        }
    }
}
