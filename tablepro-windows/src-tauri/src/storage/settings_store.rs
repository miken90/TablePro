use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::models::AppError;
use crate::services::credential_store;

/// AI provider configuration stored in settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfigStore {
    pub id: String,
    pub provider_type: String,
    pub display_name: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
}

/// Maps an AI feature to a specific provider + model.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFeatureRouteStore {
    pub feature: String,
    pub provider_id: String,
    #[serde(default)]
    pub model: String,
}

/// AI-related settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsConfig {
    #[serde(default)]
    pub providers: Vec<AiProviderConfigStore>,
    #[serde(default)]
    pub feature_routing: Vec<AiFeatureRouteStore>,
    #[serde(default = "default_max_schema_tables")]
    pub max_schema_tables: u32,
    #[serde(default = "default_true")]
    pub enable_inline_suggestions: bool,
}

impl Default for AiSettingsConfig {
    fn default() -> Self {
        Self {
            providers: Vec::new(),
            feature_routing: Vec::new(),
            max_schema_tables: 20,
            enable_inline_suggestions: true,
        }
    }
}

fn default_max_schema_tables() -> u32 {
    20
}
fn default_true() -> bool {
    true
}

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
    #[serde(default)]
    pub ai: AiSettingsConfig,
    #[serde(default)]
    pub has_completed_onboarding: bool,
    #[serde(default = "default_streaming_threshold")]
    pub streaming_threshold: usize,
    #[serde(default = "default_store_max_rows")]
    pub store_max_rows: usize,
}

fn default_streaming_threshold() -> usize {
    10_000
}
fn default_store_max_rows() -> usize {
    100_000
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
            ai: AiSettingsConfig::default(),
            has_completed_onboarding: false,
            streaming_threshold: 10_000,
            store_max_rows: 100_000,
        }
    }
}

impl AppSettings {
    /// Clamp performance-related fields to safe ranges.
    pub fn clamp_perf(&mut self) {
        self.streaming_threshold = self.streaming_threshold.clamp(1_000, 1_000_000);
        self.store_max_rows = self.store_max_rows.clamp(10_000, 10_000_000);
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

        let mut settings: AppSettings = serde_json::from_str(&data)?;
        let needs_migration = Self::decrypt_ai_keys(&mut settings)?;
        self.settings = settings;
        tracing::info!("Settings loaded from {}", path.display());

        if needs_migration {
            tracing::info!("Detected plaintext AI API keys; migrating to encrypted format");
            if let Err(e) = self.save() {
                tracing::warn!("Failed to auto-migrate AI API keys: {e}");
            }
        }

        Ok(())
    }

    /// Persist current settings to disk.
    pub fn save(&self) -> Result<(), AppError> {
        let path = Self::settings_path()?;
        let log_path = path.clone();
        let mut to_persist = self.settings.clone();
        Self::encrypt_ai_keys(&mut to_persist)?;
        let data = serde_json::to_string_pretty(&to_persist)?;

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

    /// Decrypt API keys in-place after loading. Returns true if any were
    /// plaintext (legacy) and need re-saving in encrypted form.
    fn decrypt_ai_keys(settings: &mut AppSettings) -> Result<bool, AppError> {
        let mut needs_migration = false;
        for provider in &mut settings.ai.providers {
            if provider.api_key.is_empty() {
                continue;
            }
            let was_encrypted = credential_store::is_encrypted(&provider.api_key);
            provider.api_key = credential_store::decrypt_secret(&provider.api_key)?;
            if !was_encrypted {
                needs_migration = true;
            }
        }
        Ok(needs_migration)
    }

    /// Encrypt API keys in a cloned settings before persisting.
    fn encrypt_ai_keys(settings: &mut AppSettings) -> Result<(), AppError> {
        for provider in &mut settings.ai.providers {
            provider.api_key = credential_store::encrypt_secret(&provider.api_key)?;
        }
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
            let s = AppSettings {
                safe_mode_level: level,
                ..AppSettings::default()
            };
            let json = serde_json::to_string(&s).unwrap();
            let d: AppSettings = serde_json::from_str(&json).unwrap();
            assert_eq!(d.safe_mode_level, level);
        }
    }

    #[test]
    fn test_default_perf_settings() {
        let s = AppSettings::default();
        assert_eq!(s.streaming_threshold, 10_000);
        assert_eq!(s.store_max_rows, 100_000);
    }

    #[test]
    fn test_clamp_perf_clamps_out_of_range() {
        let mut s = AppSettings {
            streaming_threshold: 10,
            store_max_rows: 100,
            ..AppSettings::default()
        };
        s.clamp_perf();
        assert_eq!(s.streaming_threshold, 1_000);
        assert_eq!(s.store_max_rows, 10_000);

        let mut s = AppSettings {
            streaming_threshold: 9_999_999,
            store_max_rows: 99_999_999,
            ..AppSettings::default()
        };
        s.clamp_perf();
        assert_eq!(s.streaming_threshold, 1_000_000);
        assert_eq!(s.store_max_rows, 10_000_000);
    }

    #[test]
    fn test_perf_serde_with_missing_fields_uses_defaults() {
        let json = r#"{
            "pageSize": 100,
            "editorFont": "Consolas",
            "editorFontSize": 14,
            "vimMode": false,
            "theme": "system",
            "nullDisplay": "NULL",
            "defaultTimeoutSecs": 30
        }"#;
        let d: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(d.streaming_threshold, 10_000);
        assert_eq!(d.store_max_rows, 100_000);
    }
}
