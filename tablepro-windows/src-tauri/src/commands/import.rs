use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::import_service::{self, ImportOptions, ImportPreview, ImportResult};
use crate::services::ConnectionManager;

// ---------------------------------------------------------------------------
// Progress event payload
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProgress {
    current: usize,
    total: usize,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Return a lightweight preview of the SQL file without executing anything.
///
/// Reads the file, scans statements, and returns the count plus the first
/// 50 statements (each truncated to 200 chars).
#[tauri::command]
pub async fn import_preview(path: String) -> Result<ImportPreview, AppError> {
    tracing::info!(path = %path, "import_preview");
    import_service::preview(&path)
}

/// Execute all SQL statements in the file against an active session.
///
/// Progress is emitted as `import_progress` events with `{ current, total }`.
/// Supports `.gz` files (decompressed transparently).
/// When `options.wrap_in_transaction` is true the entire import is wrapped in
/// a `BEGIN` / `COMMIT` (or `ROLLBACK` on error).
#[tauri::command]
pub async fn import_sql_file(
    app: AppHandle,
    session_id: String,
    path: String,
    options: ImportOptions,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<ImportResult, AppError> {
    tracing::info!(
        session_id = %session_id,
        path = %path,
        wrap_in_transaction = options.wrap_in_transaction,
        "import_sql_file"
    );

    // We need to lock the manager only to borrow the driver. The borrow must
    // not span across await points (the driver execute calls), so we hold the
    // lock for the entire import. This matches how export_to_file works.
    let mgr = manager.lock().await;
    let driver = mgr.get_driver(&session_id)?;

    let result = import_service::execute(&path, &options, driver, |current, total| {
        let _ = app.emit("import_progress", ImportProgress { current, total });
    })
    .await?;

    Ok(result)
}

// ---------------------------------------------------------------------------
// Note: no unit tests here — logic lives in import_service; tested there.
// ---------------------------------------------------------------------------
