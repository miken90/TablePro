//! Size-bounded append-only text files.
//!
//! Used for the local diagnostic files the app writes to the user's own
//! machine (`renderer-errors.log`, `metrics.jsonl`). An append-only log with
//! no bound is a disk leak, and the two callers here are both written on a
//! per-event basis, so they need the same rotation.
//!
//! Rotation keeps exactly one previous generation (`<name>.1`), so a file
//! capped at N bytes costs at most 2N on disk.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Path of the single retained backup for `path`.
fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".1");
    path.with_file_name(name)
}

/// Rotate `path` when it has reached `max_bytes`. Missing file → no-op.
fn rotate_if_needed(path: &Path, max_bytes: u64) -> std::io::Result<()> {
    let len = match fs::metadata(path) {
        Ok(m) => m.len(),
        Err(_) => return Ok(()),
    };
    if len < max_bytes {
        return Ok(());
    }
    let backup = backup_path(path);
    let _ = fs::remove_file(&backup);
    fs::rename(path, &backup)
}

/// Append `line` (plus a newline) to `path`, creating parent directories and
/// rotating first if the file has reached `max_bytes`.
pub fn append_line(path: &Path, line: &str, max_bytes: u64) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    rotate_if_needed(path, max_bytes)?;
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{line}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_lines_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("sub").join("x.log");
        append_line(&p, "one", 1_000).unwrap();
        append_line(&p, "two", 1_000).unwrap();
        let body = fs::read_to_string(&p).unwrap();
        assert_eq!(body, "one\ntwo\n");
    }

    #[test]
    fn rotates_once_the_cap_is_reached() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.log");
        // 10-byte cap: "aaaaaaaa\n" is 9 bytes, the second write pushes past it.
        append_line(&p, &"a".repeat(8), 10).unwrap();
        append_line(&p, &"b".repeat(8), 10).unwrap();
        append_line(&p, "c", 10).unwrap();
        let current = fs::read_to_string(&p).unwrap();
        let backup = fs::read_to_string(backup_path(&p)).unwrap();
        assert_eq!(current, "c\n");
        assert!(backup.contains("bbbbbbbb"));
        // Only one backup generation is ever kept.
        assert!(!backup_path(&backup_path(&p)).exists());
    }

    /// Control: below the cap nothing rotates, so a rotate-always
    /// implementation fails here.
    #[test]
    fn does_not_rotate_below_the_cap() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.log");
        append_line(&p, "one", 1_000).unwrap();
        append_line(&p, "two", 1_000).unwrap();
        assert!(!backup_path(&p).exists());
    }
}
