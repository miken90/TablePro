use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::storage::history_store::{HistoryEntry, HistoryStore};

/// Return the most recent history entries.
#[tauri::command]
pub async fn history_fetch_recent(
    store: State<'_, Mutex<HistoryStore>>,
) -> Result<Vec<HistoryEntry>, AppError> {
    let store = store.lock().await;
    store
        .fetch_recent_for_async(100)
        .map_err(AppError::DatabaseError)
}

/// Full-text search across query history.
#[tauri::command]
pub async fn history_search(
    query: String,
    store: State<'_, Mutex<HistoryStore>>,
) -> Result<Vec<HistoryEntry>, AppError> {
    let store = store.lock().await;
    store.search_for_async(&query).map_err(AppError::DatabaseError)
}

/// Delete all history entries.
#[tauri::command]
pub async fn history_clear_all(store: State<'_, Mutex<HistoryStore>>) -> Result<(), AppError> {
    let store = store.lock().await;
    store.clear_all_for_async().map_err(AppError::DatabaseError)
}

/// Delete a single history entry by id.
#[tauri::command]
pub async fn history_delete_entry(
    id: i64,
    store: State<'_, Mutex<HistoryStore>>,
) -> Result<(), AppError> {
    let store = store.lock().await;
    store
        .delete_entry_for_async(id)
        .map_err(AppError::DatabaseError)
}

/// Record a new query execution in history.
#[tauri::command]
pub async fn history_record(
    query: String,
    database: Option<String>,
    execution_time_ms: i64,
    row_count: i64,
    status: String,
    store: State<'_, Mutex<HistoryStore>>,
) -> Result<(), AppError> {
    let store = store.lock().await;
    store
        .insert_for_async(
            &query,
            database.as_deref(),
            execution_time_ms,
            row_count,
            &status,
        )
        .map_err(AppError::DatabaseError)
}
