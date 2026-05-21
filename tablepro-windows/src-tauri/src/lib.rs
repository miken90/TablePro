pub mod commands;
pub mod drivers;
pub mod models;
pub mod services;
pub mod storage;

use std::sync::Arc;

use tauri::{Emitter, Manager};

use commands::connection::{
    connect, disconnect, get_connection_status, get_driver_capabilities, list_drivers,
    list_ssh_hosts, reconnect_session, test_connection,
};
use commands::connection_export::{
    build_import_link, confirm_import, export_connections, import_connections_preview,
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
use commands::spike_channel::spike_stream;
use commands::query_streaming::execute_query_streaming;
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
use commands::bulk_ops::{bulk_delete, bulk_delete_preview, bulk_insert, bulk_update, bulk_update_preview};
use commands::crash::{delete_crash_dump, list_crash_dumps};
use commands::credential::{cred_delete, cred_load, cred_save};
use drivers::DriverRegistry;

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
    // Install crash dump auto-collect (Phase 3 Item 4): writes panic info to
    // %LOCALAPPDATA%\TablePro\crashes\panic-<ts>.json before the process dies.
    crate::services::crash_handler::install_panic_hook();

    // Initialise structured logging — respects RUST_LOG env var.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("TablePro starting");

    // Build the static driver registry. All engines compile in as rlibs;
    // they share the host's Tokio runtime via the Handle captured here.
    //
    // We explicitly construct a multi-thread Tokio runtime up-front and
    // hand its handle to Tauri via `async_runtime::set` so both Tauri
    // commands AND every driver run on the same scheduler (Validation Q2).
    let tokio_rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to build Tokio runtime");
    let rt_handle = tokio_rt.handle().clone();
    tauri::async_runtime::set(rt_handle.clone());
    // Keep the runtime alive for the lifetime of the process.
    Box::leak(Box::new(tokio_rt));

    let driver_registry = Arc::new(DriverRegistry::new(rt_handle));

    let connection_manager = ConnectionManager::new(Arc::clone(&driver_registry));

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            tracing::info!("Single-instance callback: argv={argv:?}");
            for arg in argv.iter().skip(1) {
                if !arg.starts_with("tablepro://") && !arg.starts_with('-') {
                    let path = arg.clone();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_focus();
                        let _ = app.emit("file-open", path);
                    }
                }
            }
        }))
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

        .manage(Mutex::new(commands::ai::AiCancelState::new()))
        .manage(Mutex::new({
            let mut store = SettingsStore::new();
            if let Err(e) = store.load() {
                tracing::warn!("Failed to load settings: {e}");
            }
            store
        }))
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
            // Check for file path in command-line arguments (cold start from Explorer)
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let potential_file = &args[1];
                if !potential_file.starts_with("tablepro://") && !potential_file.starts_with('-') {
                    let path = potential_file.clone();
                    let app_handle = app.handle().clone();
                    tokio::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                        let _ = app_handle.emit("file-open", path);
                    });
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
            list_ssh_hosts,
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
            // connection export/import
            export_connections,
            import_connections_preview,
            confirm_import,
            build_import_link,
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
            bulk_delete,
            bulk_delete_preview,
            // phase-2 spike (throwaway)
            spike_stream,
            // phase-2 streaming query
            execute_query_streaming,
            // phase-3 crash dump
            list_crash_dumps,
            delete_crash_dump,
            // phase-3 dual credential (windows credential manager)
            cred_save,
            cred_load,
            cred_delete,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    tracing::info!("Window CloseRequested: {}", window.label());
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
