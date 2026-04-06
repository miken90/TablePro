pub mod commands;
pub mod models;
pub mod plugin;
pub mod services;
pub mod storage;

use std::sync::Arc;

use tauri::Manager;

use commands::connection::{
    connect, disconnect, get_connection_status, get_driver_capabilities, list_drivers,
    reconnect_session, test_connection,
};
use commands::data::{generate_row_sql, save_changes};
use commands::export::export_to_file;
use commands::filter::{delete_filter_preset, load_filter_presets, save_filter_preset};
use commands::history::{
    history_clear_all, history_delete_entry, history_fetch_recent, history_record, history_search,
};
use commands::import::{import_preview, import_sql_file};
use commands::explain::explain_query;
use commands::query::{cancel_query, execute_query, fetch_count, fetch_rows};
use commands::schema::{
    fetch_approximate_count, fetch_columns, fetch_databases, fetch_ddl, fetch_enum_values,
    fetch_foreign_keys, fetch_indexes, fetch_routines, fetch_schemas, fetch_tables,
    switch_database,
};
use commands::settings::{get_settings, log_renderer_error, set_settings};
use commands::storage::{
    delete_connection, delete_group, list_connections, list_groups, save_connection, save_group,
};
use commands::structure::{apply_alter, create_table, generate_alter_sql_command};
use commands::tab_state::{get_tab_state, mark_localstorage_migrated, set_tab_state};
use commands::ai::{
    ai_build_context, ai_cancel_chat, ai_chat_stream, ai_clear_all_conversations,
    ai_create_conversation, ai_delete_conversation, ai_get_conversation, ai_inline_suggest,
    ai_list_conversations, ai_list_models, ai_save_message, ai_test_provider,
};
// routine operations (dev-2)
use commands::routine_ops::{execute_routine, get_routine_source, preview_routine_sql};
// bulk operations (dev-1)
use commands::bulk_ops::{bulk_insert, bulk_update, bulk_update_preview};
use plugin::PluginManager;
use services::health_monitor::HealthMonitor;
use services::ConnectionManager;
use storage::{AiChatStore, ConnectionStore, FilterStore, HistoryStore, SettingsStore, TabStateStore};
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init());

    // Only register the updater plugin in release builds — the update server
    // is not reachable during local dev and the placeholder pubkey can cause
    // spurious errors / intermittent crashes.
    #[cfg(not(feature = "devtools"))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(Mutex::new(connection_manager))
        .manage(Mutex::new(HealthMonitor::new()))
        .manage(Mutex::new(commands::ai::AiCancelState::new()))
        .manage(Mutex::new(SettingsStore::new()))
        .manage(Mutex::new({
            let mut store = TabStateStore::new();
            if let Err(e) = store.load() {
                tracing::warn!("Failed to load tab state: {e}");
            }
            store
        }))
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
        .manage(Mutex::new({
            match AiChatStore::new() {
                Ok(store) => {
                    if let Err(e) = store.cleanup_old_for_async(30) {
                        tracing::warn!("AI chat cleanup failed: {e}");
                    }
                    store
                }
                Err(e) => {
                    tracing::error!("Failed to init AI chat store: {e}");
                    AiChatStore::new_in_memory().expect("in-memory AI chat store")
                }
            }
        }))
        .setup(|app| {
            // Set the window icon explicitly — bundle.icon only applies to built
            // installers, not dev mode.
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/32x32.png");
                match tauri::image::Image::from_bytes(icon_bytes) {
                    Ok(icon) => {
                        if let Err(e) = window.set_icon(icon) {
                            tracing::warn!("Failed to set window icon: {e}");
                        }
                    }
                    Err(e) => tracing::warn!("Failed to decode window icon: {e}"),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // connection
            test_connection,
            connect,
            disconnect,
            get_connection_status,
            reconnect_session,
            list_drivers,
            get_driver_capabilities,
            // query
            execute_query,
            explain_query,
            fetch_rows,
            fetch_count,
            cancel_query,
            // schema
            fetch_tables,
            fetch_columns,
            fetch_indexes,
            fetch_foreign_keys,
            fetch_routines,
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
            // tab state
            get_tab_state,
            set_tab_state,
            mark_localstorage_migrated,
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
            // ai
            ai_chat_stream,
            ai_list_models,
            ai_test_provider,
            ai_cancel_chat,
            ai_inline_suggest,
            ai_build_context,
            ai_create_conversation,
            ai_save_message,
            ai_list_conversations,
            ai_get_conversation,
            ai_delete_conversation,
            ai_clear_all_conversations,
            // routine operations (dev-2)
            get_routine_source,
            execute_routine,
            preview_routine_sql,
            // bulk operations (dev-1)
            bulk_insert,
            bulk_update,
            bulk_update_preview,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    tracing::info!("Window CloseRequested: {}", window.label());
                    // Stop health monitor first
                    let hm_state = window.state::<Mutex<HealthMonitor>>();
                    if let Ok(mut hm) = hm_state.try_lock() {
                        hm.stop_all();
                    }
                    let state = window.state::<Mutex<ConnectionManager>>();
                    let lock_result = state.try_lock();
                    if let Ok(mut guard) = lock_result {
                        guard.disconnect_all();
                    }
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
