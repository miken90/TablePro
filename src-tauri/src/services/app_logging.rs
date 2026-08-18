//! Backend logging setup.
//!
//! Release builds set `windows_subsystem = "windows"` (`src/main.rs`), so the
//! process has no console and anything a stderr subscriber writes is
//! discarded — every `query.streaming.*` span evaporated in exactly the build
//! users run. Logs therefore go to a rolling file under
//! `%LOCALAPPDATA%\TablePro\logs\`, next to the crash dumps.
//!
//! Nothing leaves the machine: this is a local file, written by the app, for
//! the person running it.

use std::path::PathBuf;

use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

/// Log files kept before the oldest is deleted.
const MAX_LOG_FILES: usize = 7;

/// Resolve `%LOCALAPPDATA%\TablePro\logs\`. Falls back to a platform-neutral
/// cache dir off Windows so tests and non-Windows hosts still have a path.
pub fn log_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else {
        dirs::cache_dir()
    }?;
    Some(base.join("TablePro").join("logs"))
}

/// Install the process-wide tracing subscriber.
///
/// Layers: a daily-rotated file (always) plus stderr (debug builds only,
/// where a console exists). `RUST_LOG` still overrides the `info` default.
///
/// Returns the appender's flush guard. It must outlive the process — dropping
/// it stops the background writer thread and loses buffered lines.
pub fn init() -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let file_writer = log_dir().and_then(|dir| {
        std::fs::create_dir_all(&dir).ok()?;
        RollingFileAppender::builder()
            .rotation(Rotation::DAILY)
            .filename_prefix("tablepro")
            .filename_suffix("log")
            .max_log_files(MAX_LOG_FILES)
            .build(&dir)
            .ok()
    });

    let (file_layer, guard) = match file_writer {
        Some(appender) => {
            let (non_blocking, guard) = tracing_appender::non_blocking(appender);
            (
                Some(
                    tracing_subscriber::fmt::layer()
                        .with_ansi(false)
                        .with_target(true)
                        .with_writer(non_blocking),
                ),
                Some(guard),
            )
        }
        None => (None, None),
    };

    // Only debug builds have a console to write to.
    let stderr_layer = cfg!(debug_assertions).then(tracing_subscriber::fmt::layer);

    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stderr_layer)
        .init();

    guard
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_dir_is_under_a_tablepro_folder() {
        let dir = log_dir().expect("a base dir exists on every supported host");
        assert!(dir.ends_with("TablePro/logs") || dir.ends_with("TablePro\\logs"));
    }
}
