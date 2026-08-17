//! Tauri commands for crash dump UI (Phase 3 Item 4).

use crate::services::crash_handler::{
    delete_crash_dump as svc_delete, list_crash_dumps as svc_list, CrashDumpEntry,
};

#[tauri::command]
pub fn list_crash_dumps() -> Vec<CrashDumpEntry> {
    svc_list()
}

#[tauri::command]
pub fn delete_crash_dump(path: String) -> Result<(), String> {
    svc_delete(&path)
}
