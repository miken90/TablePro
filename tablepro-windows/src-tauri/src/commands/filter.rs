use tauri::State;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::AppError;
use crate::storage::filter_store::{FilterCondition, FilterPreset, FilterStore};

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFilterPresetPayload {
    pub name: String,
    pub table_name: String,
    pub conditions: Vec<FilterCondition>,
    pub logic: String,
}

#[tauri::command]
pub async fn save_filter_preset(
    payload: SaveFilterPresetPayload,
    store: State<'_, Mutex<FilterStore>>,
) -> Result<FilterPreset, AppError> {
    let mut store = store.lock().await;

    let preset = FilterPreset {
        id: Uuid::new_v4().to_string(),
        name: payload.name,
        table_name: payload.table_name,
        conditions: payload.conditions,
        logic: payload.logic,
    };

    store.save_preset(preset)
}

#[tauri::command]
pub async fn load_filter_presets(
    table_name: String,
    store: State<'_, Mutex<FilterStore>>,
) -> Result<Vec<FilterPreset>, AppError> {
    let store = store.lock().await;
    Ok(store.load_for_table(&table_name))
}

#[tauri::command]
pub async fn delete_filter_preset(
    id: String,
    store: State<'_, Mutex<FilterStore>>,
) -> Result<(), AppError> {
    let mut store = store.lock().await;
    store.delete_preset(&id)
}
