use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub general: GeneralSettings,
    pub appearance: AppearanceSettings,
    pub editor: EditorSettings,
    pub data_grid: DataGridSettings,
    pub ai: AISettings,
    pub history: HistorySettings,
    pub keyboard: KeyboardSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings::default(),
            appearance: AppearanceSettings::default(),
            editor: EditorSettings::default(),
            data_grid: DataGridSettings::default(),
            ai: AISettings::default(),
            history: HistorySettings::default(),
            keyboard: KeyboardSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub startup_behavior: String,
    pub language: String,
    pub automatically_check_for_updates: bool,
    pub query_timeout_seconds: u32,
    pub share_analytics: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            startup_behavior: "showWelcome".into(),
            language: "system".into(),
            automatically_check_for_updates: true,
            query_timeout_seconds: 60,
            share_analytics: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub theme: String,
    pub accent_color: String,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            accent_color: "blue".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSettings {
    pub font_family: String,
    pub font_size: u32,
    pub show_line_numbers: bool,
    pub highlight_current_line: bool,
    pub tab_width: u32,
    pub auto_indent: bool,
    pub word_wrap: bool,
    pub vim_mode_enabled: bool,
    pub show_minimap: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_family: "Consolas".into(),
            font_size: 13,
            show_line_numbers: true,
            highlight_current_line: true,
            tab_width: 4,
            auto_indent: true,
            word_wrap: false,
            vim_mode_enabled: false,
            show_minimap: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataGridSettings {
    pub row_height: String,
    pub date_format: String,
    pub null_display: String,
    pub default_page_size: u32,
    pub show_alternate_rows: bool,
}

impl Default for DataGridSettings {
    fn default() -> Self {
        Self {
            row_height: "normal".into(),
            date_format: "yyyy-MM-dd HH:mm:ss".into(),
            null_display: "NULL".into(),
            default_page_size: 1000,
            show_alternate_rows: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AISettings {
    pub openai_api_key: String,
    pub anthropic_api_key: String,
    pub gemini_api_key: String,
    pub ollama_host: String,
    pub default_provider: String,
    pub include_schema: bool,
    pub include_current_query: bool,
}

impl Default for AISettings {
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            gemini_api_key: String::new(),
            ollama_host: "http://localhost:11434".into(),
            default_provider: "openai".into(),
            include_schema: true,
            include_current_query: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySettings {
    pub max_entries: u32,
    pub max_days: u32,
    pub auto_cleanup: bool,
}

impl Default for HistorySettings {
    fn default() -> Self {
        Self {
            max_entries: 10_000,
            max_days: 90,
            auto_cleanup: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardSettings {
    pub vim_mode: bool,
    pub custom_shortcuts: std::collections::HashMap<String, String>,
}

impl Default for KeyboardSettings {
    fn default() -> Self {
        Self {
            vim_mode: false,
            custom_shortcuts: std::collections::HashMap::new(),
        }
    }
}

fn settings_path() -> PathBuf {
    let config = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = config.join("TablePro");
    let _ = fs::create_dir_all(&dir);
    dir.join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let path = settings_path();
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn reset_settings() -> AppSettings {
    let settings = AppSettings::default();
    let _ = save_settings(&settings);
    settings
}
