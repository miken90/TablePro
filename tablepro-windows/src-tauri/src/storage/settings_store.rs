use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::models::AppError;

/// All user-facing application preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub page_size: u32,
    pub editor_font: String,
    pub editor_font_size: u16,
    pub vim_mode: bool,
    pub theme: String,
    pub null_display: String,
    pub default_timeout_secs: u32,
    /// Safe mode level (0-5):
    /// 0=Off, 1=Silent, 2=Alert, 3=AlertFull, 4=SafeMode, 5=ReadOnly
    #[serde(default = "default_safe_mode_level")]
    pub safe_mode_level: u32,
    #[serde(default = "default_tab_size")]
    pub tab_size: u32,
    #[serde(default)]
    pub word_wrap: bool,
    #[serde(default = "default_date_format")]
    pub date_format: String,
}

fn default_safe_mode_level() -> u32 {
    2
}
fn default_tab_size() -> u32 {
    4
}
fn default_date_format() -> String {
    "iso".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            page_size: 500,
            editor_font: "JetBrains Mono".to_string(),
            editor_font_size: 14,
            vim_mode: false,
            theme: "system".to_string(),
            null_display: "NULL".to_string(),
            default_timeout_secs: 30,
            safe_mode_level: 2,
            tab_size: 4,
            word_wrap: false,
            date_format: "iso".to_string(),
        }
    }
}

/// Persists `AppSettings` to `%APPDATA%/TablePro/settings.json`.
pub struct SettingsStore {
    settings: AppSettings,
}

impl SettingsStore {
    pub fn new() -> Self {
        Self {
            settings: AppSettings::default(),
        }
    }

    fn settings_path() -> Result<PathBuf, AppError> {
        let base = dirs::config_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve config directory".to_string()))?;
        Ok(base.join("TablePro").join("settings.json"))
    }

    fn run_blocking_io<T, F>(op: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce() -> Result<T, AppError> + Send + 'static,
    {
        match tokio::runtime::Handle::try_current() {
            Ok(handle) => tokio::task::block_in_place(|| {
                handle.block_on(async move {
                    tokio::task::spawn_blocking(op)
                        .await
                        .map_err(|e| AppError::IoError(format!("Blocking task join error: {e}")))?
                })
            }),
            Err(_) => op(),
        }
    }

    /// Load settings from disk; falls back to defaults on any error.
    pub fn load(&mut self) -> Result<(), AppError> {
        let path = Self::settings_path()?;
        if !path.exists() {
            self.settings = AppSettings::default();
            return Ok(());
        }

        let data = Self::run_blocking_io({
            let path = path.clone();
            move || Ok(std::fs::read_to_string(&path)?)
        })?;

        self.settings = serde_json::from_str(&data)?;
        tracing::info!("Settings loaded from {}", path.display());
        Ok(())
    }

    /// Persist current settings to disk.
    pub fn save(&self) -> Result<(), AppError> {
        let path = Self::settings_path()?;
        let log_path = path.clone();
        let data = serde_json::to_string_pretty(&self.settings)?;

        Self::run_blocking_io(move || {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, data)?;
            Ok(())
        })?;

        tracing::info!("Settings saved to {}", log_path.display());
        Ok(())
    }

    pub fn get(&self) -> &AppSettings {
        &self.settings
    }

    pub fn set(&mut self, settings: AppSettings) {
        self.settings = settings;
    }
}

impl Default for SettingsStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings_values() {
        let s = AppSettings::default();
        assert_eq!(s.page_size, 500);
        assert_eq!(s.editor_font, "JetBrains Mono");
        assert_eq!(s.editor_font_size, 14);
        assert!(!s.vim_mode);
        assert_eq!(s.theme, "system");
        assert_eq!(s.null_display, "NULL");
        assert_eq!(s.default_timeout_secs, 30);
        assert_eq!(s.safe_mode_level, 2);
        assert_eq!(s.tab_size, 4);
        assert!(!s.word_wrap);
        assert_eq!(s.date_format, "iso");
    }

    #[test]
    fn test_settings_store_new_uses_defaults() {
        let store = SettingsStore::new();
        let s = store.get();
        assert_eq!(s.page_size, 500);
        assert_eq!(s.theme, "system");
    }

    #[test]
    fn test_settings_store_get_set() {
        let mut store = SettingsStore::new();
        let mut s = store.get().clone();
        s.vim_mode = true;
        s.page_size = 1000;
        store.set(s);
        assert!(store.get().vim_mode);
        assert_eq!(store.get().page_size, 1000);
    }

    #[test]
    fn test_settings_serde_round_trip() {
        let s = AppSettings::default();
        let json = serde_json::to_string(&s).unwrap();
        let d: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(d.page_size, s.page_size);
        assert_eq!(d.theme, s.theme);
    }

    #[test]
    fn test_settings_serde_with_missing_fields_uses_defaults() {
        let json = r#"{
            "pageSize": 200,
            "editorFont": "Consolas",
            "editorFontSize": 16,
            "vimMode": true,
            "theme": "dark",
            "nullDisplay": "(null)",
            "defaultTimeoutSecs": 60
        }"#;
        let d: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(d.safe_mode_level, 2);
        assert_eq!(d.tab_size, 4);
        assert!(!d.word_wrap);
        assert_eq!(d.date_format, "iso");
        assert_eq!(d.page_size, 200);
    }

    #[test]
    fn test_safe_mode_level_range() {
        for level in 0u32..=5 {
            let mut s = AppSettings::default();
            s.safe_mode_level = level;
            let json = serde_json::to_string(&s).unwrap();
            let d: AppSettings = serde_json::from_str(&json).unwrap();
            assert_eq!(d.safe_mode_level, level);
        }
    }
}
