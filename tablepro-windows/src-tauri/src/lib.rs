pub mod commands;
pub mod models;
pub mod plugin;
pub mod services;
pub mod storage;

use std::sync::Arc;

use commands::connection::{connect, disconnect, get_connection_status, test_connection};
use commands::data::{generate_row_sql, save_changes};
use commands::export::export_to_file;
use commands::filter::{delete_filter_preset, load_filter_presets, save_filter_preset};
use commands::history::{
    history_clear_all, history_delete_entry, history_fetch_recent, history_record, history_search,
};
use commands::import::{import_preview, import_sql_file};
use commands::query::{cancel_query, execute_query, fetch_count, fetch_rows};
use commands::schema::{
    fetch_approximate_count, fetch_columns, fetch_databases, fetch_ddl, fetch_enum_values,
    fetch_foreign_keys, fetch_indexes, fetch_schemas, fetch_tables, switch_database,
};
use commands::settings::{get_settings, log_renderer_error, set_settings};
use commands::storage::{
    delete_connection, delete_group, list_connections, list_groups, save_connection, save_group,
};
use commands::structure::{apply_alter, create_table, generate_alter_sql_command};
use plugin::PluginManager;
use services::ConnectionManager;
use storage::{ConnectionStore, FilterStore, HistoryStore, SettingsStore};
use tokio::sync::Mutex;

fn build_history_store() -> HistoryStore {
    match HistoryStore::new() {
        Ok(store) => store,
        Err(error) => {
            tracing::error!(
                "Failed to init history store: {error}. Falling back to in-memory history."
            );
            HistoryStore::new_in_memory_fallback()
        }
    }
}

pub fn run() {
    // Install a panic hook that logs to stderr + a file before aborting.
    std::panic::set_hook(Box::new(|info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let msg = format!("PANIC: {info}\nBacktrace:\n{bt}");
        eprintln!("{msg}");
        if let Ok(exe) = std::env::current_exe() {
            let crash_log = exe.with_file_name("crash.log");
            let _ = std::fs::write(&crash_log, &msg);
        }
    }));

    // Initialise structured logging — respects RUST_LOG env var.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("TablePro starting");

    // Locate the plugin directory next to the executable.
    let plugin_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("plugins")))
        .unwrap_or_else(|| std::path::PathBuf::from("plugins"));

    let mut plugin_manager = PluginManager::new(plugin_dir);
    plugin_manager.discover_plugins();
    let plugin_manager = Arc::new(plugin_manager);

    let connection_manager = ConnectionManager::new(Arc::clone(&plugin_manager));

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init());

    // Only register the updater plugin in release builds — the update server
    // is not reachable during local dev and the placeholder pubkey can cause
    // spurious errors / intermittent crashes.
    #[cfg(not(feature = "devtools"))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(Mutex::new(connection_manager))
        .manage(Mutex::new(SettingsStore::new()))
        .manage(Mutex::new({
            let mut store = ConnectionStore::new();
            if let Err(e) = store.load() {
                tracing::warn!("Failed to load saved connections: {e}");
            }
            if let Err(e) = store.load_groups() {
                tracing::warn!("Failed to load connection groups: {e}");
            }
            store
        }))
        .manage(Mutex::new(build_history_store()))
        .manage(Mutex::new({
            let mut store = FilterStore::new();
            if let Err(e) = store.load() {
                tracing::warn!("Failed to load filter presets: {e}");
            }
            store
        }))
        .invoke_handler(tauri::generate_handler![
            // connection
            test_connection,
            connect,
            disconnect,
            get_connection_status,
            // query
            execute_query,
            fetch_rows,
            fetch_count,
            cancel_query,
            // schema
            fetch_tables,
            fetch_columns,
            fetch_indexes,
            fetch_foreign_keys,
            fetch_databases,
            fetch_ddl,
            switch_database,
            fetch_schemas,
            fetch_enum_values,
            fetch_approximate_count,
            create_table,
            generate_alter_sql_command,
            apply_alter,
            // settings
            get_settings,
            set_settings,
            log_renderer_error,
            // storage
            list_connections,
            save_connection,
            delete_connection,
            // groups
            list_groups,
            save_group,
            delete_group,
            // data mutation
            save_changes,
            generate_row_sql,
            // export
            export_to_file,
            // import
            import_preview,
            import_sql_file,
            // history
            history_fetch_recent,
            history_search,
            history_clear_all,
            history_delete_entry,
            history_record,
            // filter presets
            save_filter_preset,
            load_filter_presets,
            delete_filter_preset,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    tracing::warn!("Window CloseRequested: {}", window.label());
                }
                tauri::WindowEvent::Destroyed => {
                    tracing::warn!("Window Destroyed: {}", window.label());
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // If we get here, the app exited normally (window closed, etc.)
    tracing::info!("TablePro exiting normally");
}
