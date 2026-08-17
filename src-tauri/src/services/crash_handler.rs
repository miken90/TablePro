//! Crash dump auto-collect (Phase 3 Item 4).
//!
//! Two collection paths:
//! 1. **Rust panics** — `install_panic_hook` serialises a JSON record to
//!    `%LOCALAPPDATA%\TablePro\crashes\<timestamp>.json` before the
//!    process exits.
//! 2. **WER native dumps** — Windows Error Reporting writes `.dmp` files
//!    into `%LOCALAPPDATA%\CrashDumps\` (or a TablePro-specific subdir);
//!    on startup we surface their paths via [`list_crash_dumps`].
//!
//! Validation Q5: dumps stay **local only**. We never upload anywhere; the
//! user attaches them manually to a bug report.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashRecord {
    pub timestamp_ms: u128,
    pub kind: String,
    pub message: String,
    pub location: Option<String>,
    pub backtrace: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashDumpEntry {
    /// Absolute path to the dump (`.json` for Rust panics, `.dmp` for WER).
    pub path: String,
    /// File name only (display).
    pub name: String,
    /// File size in bytes.
    pub size: u64,
    /// "rust" | "wer"
    pub kind: String,
}

/// Resolve `%LOCALAPPDATA%\TablePro\crashes\`. Falls back to a
/// platform-neutral cache dir on non-Windows hosts (useful for tests).
pub fn crash_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else {
        dirs::cache_dir()
    }?;
    Some(base.join("TablePro").join("crashes"))
}

/// `%LOCALAPPDATA%\CrashDumps\` — WER's default user-mode dump location.
pub fn wer_dump_dir() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("CrashDumps"))
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Write a single crash record to `crash_dir()/panic-<ts>.json`.
/// Best-effort: any I/O error is swallowed because the process is dying.
fn write_panic_record(record: &CrashRecord) {
    let Some(dir) = crash_dir() else { return };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join(format!("panic-{}.json", record.timestamp_ms));
    if let Ok(json) = serde_json::to_string_pretty(record) {
        let _ = fs::write(&path, json);
    }
}

/// Install a `std::panic::set_hook` that writes a JSON crash record to
/// `%LOCALAPPDATA%\TablePro\crashes\` and also logs to stderr.
///
/// Idempotent: subsequent calls overwrite the previous hook.
pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()));
        let message = info
            .payload()
            .downcast_ref::<&'static str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());

        let record = CrashRecord {
            timestamp_ms: timestamp_ms(),
            kind: "rust_panic".to_string(),
            message: redact_secrets(&message),
            location,
            backtrace: redact_secrets(&format!("{bt}")),
            version: env!("CARGO_PKG_VERSION").to_string(),
        };

        eprintln!(
            "PANIC: {} @ {}\n{}",
            record.message,
            record.location.as_deref().unwrap_or("?"),
            record.backtrace
        );
        write_panic_record(&record);
    }));
}

/// Crude secret redaction: removes anything that looks like
/// `password=`, `pwd=`, `passwd=` URI/query fragments. Applied to
/// panic payload + backtrace before writing.
fn redact_secrets(input: &str) -> String {
    let needles = ["password=", "pwd=", "passwd=", "api_key=", "apikey=", "token="];
    let mut out = input.to_string();
    for n in needles {
        // Replace from `<needle>` up to the next whitespace / '&' / quote.
        let mut start = 0;
        while let Some(idx) = out[start..].to_ascii_lowercase().find(n) {
            let begin = start + idx + n.len();
            let end = out[begin..]
                .find(|c: char| c.is_whitespace() || c == '&' || c == '"' || c == '\'')
                .map(|p| begin + p)
                .unwrap_or(out.len());
            out.replace_range(begin..end, "<redacted>");
            start = begin + "<redacted>".len();
        }
    }
    out
}

/// List crash dumps (Rust JSON + WER `.dmp`) currently on disk.
pub fn list_crash_dumps() -> Vec<CrashDumpEntry> {
    let mut entries = Vec::new();

    if let Some(dir) = crash_dir() {
        collect_files(&dir, "rust", &mut entries);
    }
    if let Some(dir) = wer_dump_dir() {
        collect_files(&dir, "wer", &mut entries);
    }

    // Newest first.
    entries.sort_by(|a, b| b.name.cmp(&a.name));
    entries
}

fn collect_files(dir: &Path, kind: &str, out: &mut Vec<CrashDumpEntry>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for ent in read.flatten() {
        let path = ent.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        // For WER, only surface our own process dumps.
        if kind == "wer"
            && !name.to_lowercase().starts_with("tablepro")
            && !name.to_lowercase().contains("tablepro")
        {
            continue;
        }
        let size = ent.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(CrashDumpEntry {
            path: path.to_string_lossy().to_string(),
            name,
            size,
            kind: kind.to_string(),
        });
    }
}

/// Delete a single crash dump by absolute path. Sanity-checks the path
/// lives in either `crash_dir()` or `wer_dump_dir()` to prevent traversal.
pub fn delete_crash_dump(absolute_path: &str) -> Result<(), String> {
    let p = PathBuf::from(absolute_path);
    let ours = crash_dir().is_some_and(|d| p.starts_with(&d))
        || wer_dump_dir().is_some_and(|d| p.starts_with(&d));
    if !ours {
        return Err("Refusing to delete path outside known crash directories".into());
    }
    fs::remove_file(&p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_password_in_query_string() {
        let raw = "postgres://u:password=hunter2 host=x";
        let out = redact_secrets(raw);
        assert!(out.contains("password=<redacted>"));
        assert!(!out.contains("hunter2"));
    }

    #[test]
    fn redact_api_key_in_token() {
        let raw = r#"{"api_key":"abc123","other":"ok"}"#;
        // No `api_key=` here (uses JSON `:`), so should NOT redact — proving
        // the redactor is conservative and doesn't touch random JSON.
        let out = redact_secrets(raw);
        assert!(out.contains("abc123"));

        let raw2 = "GET /?api_key=abc123&x=1";
        let out2 = redact_secrets(raw2);
        assert!(out2.contains("api_key=<redacted>"));
        assert!(!out2.contains("abc123"));
    }

    #[test]
    fn list_crash_dumps_handles_missing_dirs() {
        // Should not panic when both dirs are missing.
        let _ = list_crash_dumps();
    }

    #[test]
    fn delete_rejects_paths_outside_known_dirs() {
        let r = delete_crash_dump("C:\\Windows\\System32\\config\\SAM");
        assert!(r.is_err());
    }

    #[test]
    fn crash_record_round_trip() {
        let r = CrashRecord {
            timestamp_ms: 1_234_567,
            kind: "rust_panic".into(),
            message: "boom".into(),
            location: Some("file.rs:1:1".into()),
            backtrace: "...".into(),
            version: "0.0.0".into(),
        };
        let json = serde_json::to_string(&r).unwrap();
        let back: CrashRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(back.message, "boom");
        assert_eq!(back.kind, "rust_panic");
    }
}
