pub mod commands;
pub mod models;
pub mod plugin;
pub mod services;
pub mod storage;

use std::sync::Arc;

use commands::connection::{connect, disconnect, get_connection_status, test_connection};
use commands::query::{cancel_query, execute_query, fetch_count, fetch_rows};
use commands::schema::{
    fetch_columns, fetch_databases, fetch_ddl, fetch_foreign_keys, fetch_indexes, fetch_tables,
    switch_database,
};
use commands::settings::{get_settings, set_settings};
use commands::storage::{delete_connection, list_connections, save_connection};
use commands::data::save_changes;
use commands::export::export_to_file;
use plugin::PluginManager;
use services::ConnectionManager;
use storage::{ConnectionStore, SettingsStore};
use tokio::sync::Mutex;

pub fn run() {
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

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(connection_manager))
        .manage(Mutex::new(SettingsStore::new()))
        .manage(Mutex::new(ConnectionStore::new()))
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
            // settings
            get_settings,
            set_settings,
            // storage
            list_connections,
            save_connection,
            delete_connection,
            // data mutation
            save_changes,
            // export
            export_to_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
