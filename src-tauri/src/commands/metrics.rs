//! Local metrics sink.
//!
//! Appends renderer-produced JSONL records to
//! `%LOCALAPPDATA%\TablePro\logs\metrics.jsonl`, next to the backend log and
//! the crash dumps. Local file only — this command writes to disk and does
//! nothing else.

use crate::models::AppError;
use crate::services::app_logging;
use crate::services::bounded_log;

/// Cap for `metrics.jsonl`. One backup generation is kept, so the metrics
/// cost at most 16 MiB on disk. A ~400-byte record per query means roughly
/// 20,000 queries before the oldest generation is dropped.
const METRICS_MAX_BYTES: u64 = 8 * 1024 * 1024;

/// Longest single record accepted. Records are fixed-shape; anything larger
/// is a bug on the caller's side and must not be allowed to bloat the file.
const MAX_RECORD_BYTES: usize = 8 * 1024;

/// Append one JSONL metrics record.
#[tauri::command]
pub async fn metrics_append(line: String) -> Result<(), AppError> {
    if line.len() > MAX_RECORD_BYTES {
        return Err(AppError::Other(format!(
            "metrics record too large: {} bytes",
            line.len()
        )));
    }
    // Records must stay one-per-line for the file to be parseable.
    if line.contains('\n') {
        return Err(AppError::Other(
            "metrics record must not contain a newline".into(),
        ));
    }
    let dir = app_logging::log_dir()
        .ok_or_else(|| AppError::IoError("Cannot resolve local app data directory".into()))?;
    bounded_log::append_line(&dir.join("metrics.jsonl"), &line, METRICS_MAX_BYTES)
        .map_err(|e| AppError::IoError(e.to_string()))
}

/// Reveal the log folder (backend log, metrics, renderer errors) in Explorer
/// so the user can hand the files over without hunting for the path.
#[tauri::command]
pub async fn open_logs_folder() -> Result<String, AppError> {
    let dir = app_logging::log_dir()
        .ok_or_else(|| AppError::IoError("Cannot resolve local app data directory".into()))?;
    std::fs::create_dir_all(&dir)?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(&dir)
            // Explorer returns a non-zero exit code even on success, so the
            // status is deliberately not checked.
            .spawn()
            .map_err(|e| AppError::IoError(e.to_string()))?;
    }
    Ok(dir.to_string_lossy().to_string())
}
