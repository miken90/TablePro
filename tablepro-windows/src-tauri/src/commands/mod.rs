use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use crate::database::driver::DatabaseDriver;
use crate::database::factory;
use crate::models::*;
use crate::services::change_tracking::{ChangeSet, SqlStatementGenerator};
use crate::services::export::{self, ExportOptions};
use crate::services::filter::{FilterCondition, FilterSqlGenerator};
use crate::services::import::{self, ImportResult};
use crate::services::ssh_tunnel::{SshTunnelManager, TunnelInfo};
use crate::storage::connection_storage::{ConnectionStorage, StoredConnection, StoredGroup};
use crate::storage::query_history::{HistoryEntry, QueryHistoryStorage};

pub struct AppState {
    pub connections: Mutex<HashMap<String, Arc<Mutex<Box<dyn DatabaseDriver>>>>>,
    pub storage: ConnectionStorage,
    pub history: QueryHistoryStorage,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            storage: ConnectionStorage::new(),
            history: QueryHistoryStorage::new(),
        }
    }
}

// Helper to get a driver by connection ID
async fn get_driver(
    state: &AppState,
    connection_id: &str,
) -> Result<Arc<Mutex<Box<dyn DatabaseDriver>>>, String> {
    let connections = state.connections.lock().await;
    connections
        .get(connection_id)
        .cloned()
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))
}

#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    tunnel_manager: State<'_, SshTunnelManager>,
    mut config: ConnectionConfig,
    password: Option<String>,
    ssh_password: Option<String>,
) -> Result<String, String> {
    let id = config.id.clone();

    // If SSH tunnel is enabled, create tunnel first and rewrite host/port
    if config.ssh_config.enabled {
        let original_host = config.host.clone();
        let original_port = config.port;

        let local_port = tunnel_manager
            .create_tunnel(
                &id,
                &config.ssh_config,
                ssh_password.as_deref(),
                &original_host,
                original_port,
            )
            .await
            .map_err(|e| e.to_string())?;

        // Rewrite connection to go through the local tunnel
        config.host = "127.0.0.1".to_string();
        config.port = local_port;
    }

    let mut driver = factory::create_driver(config);

    driver
        .connect(password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let version = driver.server_version().unwrap_or_default();

    let mut connections = state.connections.lock().await;
    connections.insert(id.clone(), Arc::new(Mutex::new(driver)));

    Ok(version)
}

#[tauri::command]
pub async fn disconnect(
    state: State<'_, AppState>,
    tunnel_manager: State<'_, SshTunnelManager>,
    connection_id: String,
) -> Result<(), String> {
    let mut connections = state.connections.lock().await;
    if let Some(driver_arc) = connections.remove(&connection_id) {
        let mut driver = driver_arc.lock().await;
        driver.disconnect();
    }

    // Also close any SSH tunnel for this connection
    tunnel_manager.close_tunnel(&connection_id).await.ok();

    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    tunnel_manager: State<'_, SshTunnelManager>,
    mut config: ConnectionConfig,
    password: Option<String>,
    ssh_password: Option<String>,
) -> Result<bool, String> {
    // If SSH tunnel is enabled, create a temporary tunnel for testing
    if config.ssh_config.enabled {
        let test_id = format!("__test_{}", config.id);
        let original_host = config.host.clone();
        let original_port = config.port;

        let local_port = tunnel_manager
            .create_tunnel(
                &test_id,
                &config.ssh_config,
                ssh_password.as_deref(),
                &original_host,
                original_port,
            )
            .await
            .map_err(|e| e.to_string())?;

        config.host = "127.0.0.1".to_string();
        config.port = local_port;

        let mut driver = factory::create_driver(config);
        let result = driver
            .test_connection(password.as_deref())
            .await
            .map_err(|e| e.to_string());

        // Clean up test tunnel
        tunnel_manager.close_tunnel(&test_id).await.ok();

        return result;
    }

    let mut driver = factory::create_driver(config);
    driver
        .test_connection(password.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_ssh_tunnel(
    tunnel_manager: State<'_, SshTunnelManager>,
    connection_id: String,
    ssh_config: SshConfig,
    ssh_password: Option<String>,
    remote_host: String,
    remote_port: u16,
) -> Result<u16, String> {
    tunnel_manager
        .create_tunnel(
            &connection_id,
            &ssh_config,
            ssh_password.as_deref(),
            &remote_host,
            remote_port,
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_ssh_tunnel(
    tunnel_manager: State<'_, SshTunnelManager>,
    connection_id: String,
) -> Result<(), String> {
    tunnel_manager
        .close_tunnel(&connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tunnel_status(
    tunnel_manager: State<'_, SshTunnelManager>,
    connection_id: String,
) -> Result<Option<TunnelInfo>, String> {
    Ok(tunnel_manager.get_tunnel_info(&connection_id).await)
}

#[tauri::command]
pub async fn execute_query(
    state: State<'_, AppState>,
    connection_id: String,
    query: String,
) -> Result<QueryResult, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver.execute(&query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_tables(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<TableInfo>, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver.fetch_tables().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_columns(
    state: State<'_, AppState>,
    connection_id: String,
    table: String,
) -> Result<Vec<ColumnInfo>, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver
        .fetch_columns(&table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_indexes(
    state: State<'_, AppState>,
    connection_id: String,
    table: String,
) -> Result<Vec<IndexInfo>, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver
        .fetch_indexes(&table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_foreign_keys(
    state: State<'_, AppState>,
    connection_id: String,
    table: String,
) -> Result<Vec<ForeignKeyInfo>, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver
        .fetch_foreign_keys(&table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_table_ddl(
    state: State<'_, AppState>,
    connection_id: String,
    table: String,
) -> Result<String, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver
        .fetch_table_ddl(&table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_databases(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<String>, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver.fetch_databases().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_schemas(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<String>, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver.fetch_schemas().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_table_metadata(
    state: State<'_, AppState>,
    connection_id: String,
    table: String,
) -> Result<TableMetadata, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver
        .fetch_table_metadata(&table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_rows(
    state: State<'_, AppState>,
    connection_id: String,
    query: String,
    offset: i64,
    limit: i64,
) -> Result<QueryResult, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver
        .fetch_rows(&query, offset, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_row_count(
    state: State<'_, AppState>,
    connection_id: String,
    query: String,
) -> Result<i64, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    driver
        .fetch_row_count(&query)
        .await
        .map_err(|e| e.to_string())
}

// Connection storage commands

#[tauri::command]
pub async fn get_connections(state: State<'_, AppState>) -> Result<Vec<StoredConnection>, String> {
    Ok(state.storage.get_connections())
}

#[tauri::command]
pub async fn save_connection(
    state: State<'_, AppState>,
    connection: StoredConnection,
    password: Option<String>,
) -> Result<(), String> {
    if let Some(pw) = password {
        if pw.is_empty() {
            state.storage.delete_password(&connection.id);
        } else {
            state.storage.save_password(&connection.id, &pw)?;
        }
    }
    state.storage.save_connection(connection)
}

#[tauri::command]
pub async fn delete_connection(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), String> {
    state.storage.delete_password(&connection_id);
    state.storage.delete_connection(&connection_id)
}

#[tauri::command]
pub async fn get_groups(state: State<'_, AppState>) -> Result<Vec<StoredGroup>, String> {
    Ok(state.storage.get_groups())
}

#[tauri::command]
pub async fn save_group(state: State<'_, AppState>, group: StoredGroup) -> Result<(), String> {
    state.storage.save_group(group)
}

#[tauri::command]
pub async fn delete_group(state: State<'_, AppState>, group_id: String) -> Result<(), String> {
    state.storage.delete_group(&group_id)
}

#[tauri::command]
pub async fn get_password(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Option<String>, String> {
    Ok(state.storage.load_password(&connection_id))
}

#[tauri::command]
pub async fn generate_change_sql(
    table: String,
    db_type: String,
    changes: ChangeSet,
) -> Result<Vec<String>, String> {
    let parsed_db_type: DatabaseType =
        serde_json::from_value(serde_json::Value::String(db_type))
            .map_err(|e| format!("Invalid db_type: {}", e))?;
    Ok(SqlStatementGenerator::generate_all(
        &table,
        &parsed_db_type,
        &changes,
    ))
}

#[tauri::command]
pub async fn execute_changes(
    state: State<'_, AppState>,
    connection_id: String,
    statements: Vec<String>,
) -> Result<(), String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;

    driver
        .begin_transaction()
        .await
        .map_err(|e| e.to_string())?;

    for stmt in &statements {
        if let Err(e) = driver.execute(stmt).await {
            let _ = driver.rollback_transaction().await;
            return Err(format!("Transaction rolled back: {}", e));
        }
    }

    driver
        .commit_transaction()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Export/Import commands

#[tauri::command]
pub async fn export_data(
    state: State<'_, AppState>,
    connection_id: String,
    query: String,
    options: ExportOptions,
) -> Result<String, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    let driver = driver_arc.lock().await;
    let result = driver.execute(&query).await.map_err(|e| e.to_string())?;

    match options.format {
        export::ExportFormat::Csv => export::export_to_csv(&result.rows, &result.columns, &options),
        export::ExportFormat::Json => {
            export::export_to_json(&result.rows, &result.columns, &options)
        }
        export::ExportFormat::Sql => export::export_to_sql(&result.rows, &result.columns, &options),
        export::ExportFormat::Xlsx => Err("XLSX export is not yet supported".to_string()),
    }
}

#[tauri::command]
pub async fn import_sql(
    state: State<'_, AppState>,
    connection_id: String,
    file_path: String,
) -> Result<ImportResult, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    import::import_sql_file(&driver_arc, &file_path).await
}

#[tauri::command]
pub async fn import_csv(
    state: State<'_, AppState>,
    connection_id: String,
    file_path: String,
    table_name: String,
    has_headers: bool,
    db_type: DatabaseType,
) -> Result<ImportResult, String> {
    let driver_arc = get_driver(&state, &connection_id).await?;
    import::import_csv(&driver_arc, &file_path, &table_name, has_headers, &db_type).await
}

// AI commands

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    connection_id: Option<String>,
    messages: Vec<crate::services::ai::ChatMessage>,
    provider: String,
    api_key: String,
    model: String,
    base_url: Option<String>,
    include_schema: bool,
) -> Result<String, String> {
    let ai_provider =
        crate::services::ai::create_provider(&provider, &api_key, base_url.as_deref())?;

    let mut final_messages = messages.clone();

    if include_schema {
        if let Some(conn_id) = &connection_id {
            if let Ok(schema) = build_schema_for_connection(&state, conn_id).await {
                if !schema.is_empty() {
                    final_messages.insert(
                        0,
                        crate::services::ai::ChatMessage {
                            role: "system".to_string(),
                            content: format!(
                                "You are a helpful SQL assistant. Use the following schema context to help generate accurate queries.\n\n{}",
                                schema
                            ),
                        },
                    );
                }
            }
        }
    }

    ai_provider.chat(final_messages, &model).await
}

#[tauri::command]
pub async fn ai_get_schema_context(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<String, String> {
    build_schema_for_connection(&state, &connection_id).await
}

#[tauri::command]
pub async fn ai_detect_ollama() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn ai_save_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("tablepro-ai", &provider).map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_load_api_key(provider: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("tablepro-ai", &provider).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

async fn build_schema_for_connection(
    state: &AppState,
    connection_id: &str,
) -> Result<String, String> {
    let driver_arc = get_driver(state, connection_id).await?;
    let driver = driver_arc.lock().await;

    let tables = driver.fetch_tables().await.map_err(|e| e.to_string())?;
    let columns = driver
        .fetch_all_columns()
        .await
        .map_err(|e| e.to_string())?;

    Ok(crate::services::ai::schema_context::build_schema_context(
        &tables, &columns,
    ))
}

#[tauri::command]
pub async fn generate_filter_sql(
    conditions: Vec<FilterCondition>,
    db_type: String,
) -> Result<String, String> {
    let parsed_db_type: DatabaseType =
        serde_json::from_value(serde_json::Value::String(db_type))
            .map_err(|e| format!("Invalid db_type: {}", e))?;
    Ok(FilterSqlGenerator::generate_where(&conditions, &parsed_db_type))
}

// Query history commands

#[tauri::command]
pub async fn save_query_history(
    state: State<'_, AppState>,
    query: String,
    database: String,
    connection_name: String,
    execution_time_ms: f64,
    row_count: i64,
    status: String,
) -> Result<(), String> {
    state
        .history
        .save_query(&query, &database, &connection_name, execution_time_ms, row_count, &status)
}

#[tauri::command]
pub async fn search_query_history(
    state: State<'_, AppState>,
    search_text: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<HistoryEntry>, String> {
    state.history.search_history(&search_text, limit, offset)
}

#[tauri::command]
pub async fn get_recent_queries(
    state: State<'_, AppState>,
    limit: i64,
) -> Result<Vec<HistoryEntry>, String> {
    state.history.get_recent_queries(limit)
}

#[tauri::command]
pub async fn clear_query_history(state: State<'_, AppState>) -> Result<(), String> {
    state.history.clear_history()
}

#[tauri::command]
pub async fn delete_history_entry(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.history.delete_entry(id)
}
