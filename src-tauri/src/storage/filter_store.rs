use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::models::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterCondition {
    pub id: String,
    pub column: String,
    pub operator: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterPreset {
    pub id: String,
    pub name: String,
    pub table_name: String,
    pub conditions: Vec<FilterCondition>,
    pub logic: String,
}

pub struct FilterStore {
    presets: Vec<FilterPreset>,
}

impl FilterStore {
    pub fn new() -> Self {
        Self { presets: vec![] }
    }

    fn presets_path() -> Result<PathBuf, AppError> {
        let base = dirs::config_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve config directory".to_string()))?;
        Ok(base.join("TablePro").join("filter-presets.json"))
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

    pub fn load(&mut self) -> Result<(), AppError> {
        let path = Self::presets_path()?;
        if !path.exists() {
            self.presets = vec![];
            return Ok(());
        }

        let data = Self::run_blocking_io({
            let path = path.clone();
            move || Ok(std::fs::read_to_string(&path)?)
        })?;

        self.presets = serde_json::from_str(&data)?;
        Ok(())
    }

    fn persist(&self) -> Result<(), AppError> {
        let path = Self::presets_path()?;
        let data = serde_json::to_string_pretty(&self.presets)?;

        Self::run_blocking_io(move || {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, data)?;
            Ok(())
        })
    }

    pub fn save_preset(&mut self, preset: FilterPreset) -> Result<FilterPreset, AppError> {
        if preset.name.trim().is_empty() {
            return Err(AppError::ConfigError("Preset name cannot be empty".to_string()));
        }

        if let Some(existing) = self.presets.iter_mut().find(|p| p.id == preset.id) {
            *existing = preset.clone();
        } else {
            self.presets.push(preset.clone());
        }

        self.persist()?;
        Ok(preset)
    }

    pub fn load_for_table(&self, table_name: &str) -> Vec<FilterPreset> {
        self.presets
            .iter()
            .filter(|p| p.table_name == table_name)
            .cloned()
            .collect()
    }

    pub fn delete_preset(&mut self, id: &str) -> Result<(), AppError> {
        let before = self.presets.len();
        self.presets.retain(|p| p.id != id);
        if self.presets.len() == before {
            return Err(AppError::NotFound(format!("Filter preset {id} not found")));
        }

        self.persist()
    }
}

impl Default for FilterStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_preset_serde_round_trip() {
        let preset = FilterPreset {
            id: "preset-1".to_string(),
            name: "Active Users".to_string(),
            table_name: "users".to_string(),
            conditions: vec![FilterCondition {
                id: "1".to_string(),
                column: "status".to_string(),
                operator: "=".to_string(),
                value: "active".to_string(),
                enabled: true,
            }],
            logic: "AND".to_string(),
        };

        let json = serde_json::to_string(&preset).expect("serialize preset");
        let decoded: FilterPreset = serde_json::from_str(&json).expect("deserialize preset");

        assert_eq!(decoded.id, preset.id);
        assert_eq!(decoded.name, preset.name);
        assert_eq!(decoded.table_name, preset.table_name);
        assert_eq!(decoded.logic, preset.logic);
        assert_eq!(decoded.conditions.len(), 1);
        assert_eq!(decoded.conditions[0].column, "status");
    }
}
