use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::models::AppError;

/// A single persisted editor tab.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTab {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub connection_id: Option<String>,
    #[serde(default = "default_tab_type")]
    pub tab_type: String,
    #[serde(default)]
    pub table_name: Option<String>,
    #[serde(default)]
    pub table_schema: Option<String>,
}

fn default_tab_type() -> String {
    "query".to_string()
}

/// Top-level tab state file persisted to disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabStateFile {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub migrated_from_local_storage: bool,
    #[serde(default)]
    pub tabs: Vec<PersistedTab>,
    #[serde(default)]
    pub active_tab_id: Option<String>,
}

fn default_version() -> u32 {
    1
}

impl Default for TabStateFile {
    fn default() -> Self {
        Self {
            version: 1,
            migrated_from_local_storage: false,
            tabs: Vec::new(),
            active_tab_id: None,
        }
    }
}

/// Persists tab state to `%APPDATA%/TablePro/tab-state.json`.
pub struct TabStateStore {
    state: TabStateFile,
}

impl TabStateStore {
    pub fn new() -> Self {
        Self {
            state: TabStateFile::default(),
        }
    }

    fn file_path() -> Result<PathBuf, AppError> {
        let base = dirs::config_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve config directory".to_string()))?;
        Ok(base.join("TablePro").join("tab-state.json"))
    }

    /// Load tab state from disk; falls back to defaults if file missing.
    pub fn load(&mut self) -> Result<(), AppError> {
        let path = Self::file_path()?;
        if !path.exists() {
            self.state = TabStateFile::default();
            return Ok(());
        }
        let data = std::fs::read_to_string(&path)?;
        self.state = serde_json::from_str(&data)?;
        tracing::info!("Tab state loaded from {}", path.display());
        Ok(())
    }

    /// Persist current tab state to disk.
    pub fn save(&self) -> Result<(), AppError> {
        let path = Self::file_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(&self.state)?;
        std::fs::write(&path, data)?;
        tracing::info!("Tab state saved to {}", path.display());
        Ok(())
    }

    pub fn get(&self) -> &TabStateFile {
        &self.state
    }

    pub fn set(&mut self, state: TabStateFile) {
        self.state = state;
    }

    pub fn mark_migrated(&mut self) {
        self.state.migrated_from_local_storage = true;
    }
}

impl Default for TabStateStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_tab_state_file() {
        let s = TabStateFile::default();
        assert_eq!(s.version, 1);
        assert!(!s.migrated_from_local_storage);
        assert!(s.tabs.is_empty());
        assert!(s.active_tab_id.is_none());
    }

    #[test]
    fn serde_round_trip() {
        let state = TabStateFile {
            version: 1,
            migrated_from_local_storage: true,
            tabs: vec![PersistedTab {
                id: "tab-1".to_string(),
                title: "Query 1".to_string(),
                content: "SELECT 1".to_string(),
                is_pinned: false,
                connection_id: Some("conn-1".to_string()),
                tab_type: "query".to_string(),
                table_name: None,
                table_schema: None,
            }],
            active_tab_id: Some("tab-1".to_string()),
        };
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: TabStateFile = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.version, 1);
        assert!(deserialized.migrated_from_local_storage);
        assert_eq!(deserialized.tabs.len(), 1);
        assert_eq!(deserialized.tabs[0].id, "tab-1");
        assert_eq!(deserialized.tabs[0].tab_type, "query");
        assert_eq!(deserialized.active_tab_id, Some("tab-1".to_string()));
    }

    #[test]
    fn serde_with_missing_fields_uses_defaults() {
        let json = r#"{"version": 1}"#;
        let state: TabStateFile = serde_json::from_str(json).unwrap();
        assert!(!state.migrated_from_local_storage);
        assert!(state.tabs.is_empty());
        assert!(state.active_tab_id.is_none());
    }

    #[test]
    fn serde_tab_with_missing_optional_fields() {
        let json = r#"{"id":"t1","title":"T1"}"#;
        let tab: PersistedTab = serde_json::from_str(json).unwrap();
        assert_eq!(tab.id, "t1");
        assert_eq!(tab.content, "");
        assert!(!tab.is_pinned);
        assert!(tab.connection_id.is_none());
        assert_eq!(tab.tab_type, "query");
        assert!(tab.table_name.is_none());
    }

    #[test]
    fn store_get_set() {
        let mut store = TabStateStore::new();
        let mut state = store.get().clone();
        state.migrated_from_local_storage = true;
        state.tabs.push(PersistedTab {
            id: "tab-2".to_string(),
            title: "Q2".to_string(),
            content: String::new(),
            is_pinned: true,
            connection_id: None,
            tab_type: "query".to_string(),
            table_name: None,
            table_schema: None,
        });
        store.set(state);
        assert!(store.get().migrated_from_local_storage);
        assert_eq!(store.get().tabs.len(), 1);
        assert!(store.get().tabs[0].is_pinned);
    }

    #[test]
    fn mark_migrated() {
        let mut store = TabStateStore::new();
        assert!(!store.get().migrated_from_local_storage);
        store.mark_migrated();
        assert!(store.get().migrated_from_local_storage);
    }

    #[test]
    fn save_and_load_from_temp_dir() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tab-state.json");

        // Write directly to test load
        let state = TabStateFile {
            version: 1,
            migrated_from_local_storage: true,
            tabs: vec![PersistedTab {
                id: "t1".to_string(),
                title: "Test".to_string(),
                content: "SELECT 42".to_string(),
                is_pinned: false,
                connection_id: Some("c1".to_string()),
                tab_type: "table".to_string(),
                table_name: Some("users".to_string()),
                table_schema: Some("public".to_string()),
            }],
            active_tab_id: Some("t1".to_string()),
        };
        let data = serde_json::to_string_pretty(&state).unwrap();
        std::fs::write(&path, &data).unwrap();

        // Verify we can parse what we wrote
        let read_back = std::fs::read_to_string(&path).unwrap();
        let loaded: TabStateFile = serde_json::from_str(&read_back).unwrap();
        assert!(loaded.migrated_from_local_storage);
        assert_eq!(loaded.tabs.len(), 1);
        assert_eq!(loaded.tabs[0].table_name, Some("users".to_string()));
    }

    #[test]
    fn camel_case_serialization() {
        let state = TabStateFile::default();
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("migratedFromLocalStorage"));
        assert!(json.contains("activeTabId"));
        assert!(!json.contains("migrated_from_local_storage"));
    }
}
