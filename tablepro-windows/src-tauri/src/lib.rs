mod commands;
pub mod database;
pub mod models;
pub mod services;
pub mod storage;

use commands::AppState;
use services::ssh_tunnel::SshTunnelManager;

#[tauri::command]
fn get_settings() -> storage::settings::AppSettings {
    storage::settings::load_settings()
}

#[tauri::command]
fn update_settings(settings: storage::settings::AppSettings) -> Result<storage::settings::AppSettings, String> {
    storage::settings::save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
fn reset_settings() -> storage::settings::AppSettings {
    storage::settings::reset_settings()
}

#[tauri::command]
async fn activate_license(license_key: String) -> Result<services::license::LicenseInfo, String> {
    services::license::activate_license(&license_key).await
}

#[tauri::command]
async fn check_license() -> Result<services::license::LicenseInfo, String> {
    services::license::check_license().await
}

#[tauri::command]
fn get_license_info() -> services::license::LicenseInfo {
    services::license::get_license_info()
}

#[tauri::command]
async fn deactivate_license() -> Result<(), String> {
    services::license::deactivate_license().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .manage(SshTunnelManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::connect,
            commands::disconnect,
            commands::test_connection,
            commands::execute_query,
            commands::fetch_tables,
            commands::fetch_columns,
            commands::fetch_indexes,
            commands::fetch_foreign_keys,
            commands::fetch_table_ddl,
            commands::fetch_databases,
            commands::fetch_schemas,
            commands::fetch_table_metadata,
            commands::fetch_rows,
            commands::fetch_row_count,
            commands::create_ssh_tunnel,
            commands::close_ssh_tunnel,
            commands::get_tunnel_status,
            commands::get_connections,
            commands::save_connection,
            commands::delete_connection,
            commands::get_groups,
            commands::save_group,
            commands::delete_group,
            commands::get_password,
            commands::generate_change_sql,
            commands::execute_changes,
            commands::export_data,
            commands::import_sql,
            commands::import_csv,
            commands::save_query_history,
            commands::search_query_history,
            commands::get_recent_queries,
            commands::clear_query_history,
            commands::delete_history_entry,
            commands::ai_chat,
            commands::ai_get_schema_context,
            commands::ai_detect_ollama,
            commands::ai_save_api_key,
            commands::ai_load_api_key,
            commands::generate_filter_sql,
            get_settings,
            update_settings,
            reset_settings,
            activate_license,
            check_license,
            get_license_info,
            deactivate_license,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
