use serde::Deserialize;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::ddl_generator::{
    generate_create_table, generate_table_operation, ColumnDefinition,
};
use crate::services::schema_alter::{generate_alter_sql, AlterColumnChange};
use crate::services::ConnectionManager;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnDefinitionInput {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub primary_key: bool,
    pub auto_increment: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTableDefinition {
    pub table_name: String,
    pub schema: Option<String>,
    pub columns: Vec<ColumnDefinitionInput>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTableResult {
    pub ddl: String,
}

#[tauri::command]
pub async fn create_table(
    session_id: String,
    table_definition: CreateTableDefinition,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<CreateTableResult, AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)?.db_type.clone();
        (driver, driver_type)
    };

    let columns: Vec<ColumnDefinition> = table_definition
        .columns
        .iter()
        .map(|c| ColumnDefinition {
            name: c.name.clone(),
            data_type: c.data_type.clone(),
            nullable: c.nullable,
            default_value: c.default_value.clone(),
            primary_key: c.primary_key,
            auto_increment: c.auto_increment,
        })
        .collect();

    let ddl = generate_create_table(
        &table_definition.table_name,
        table_definition.schema.as_deref(),
        &columns,
        &driver_type,
    )?;

    tracing::info!(
        session_id = %session_id,
        table_name = %table_definition.table_name,
        db_type = %driver_type,
        "create_table"
    );

    driver.execute(&ddl).await?;

    Ok(CreateTableResult { ddl })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableOperationPayload {
    /// `truncate` | `delete-all` | `drop`
    pub operation: String,
    pub table: String,
    pub schema: Option<String>,
}

/// Return the statement for a destructive whole-table operation without
/// running it. The caller executes it through the normal query path so the
/// statement is subject to Safe Mode like any other write.
#[tauri::command]
pub async fn generate_table_operation_sql(
    session_id: String,
    payload: TableOperationPayload,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    let driver_type = {
        let mgr = manager.lock().await;
        mgr.get_config(&session_id)?.db_type.clone()
    };

    let sql = generate_table_operation(
        &payload.operation,
        &payload.table,
        payload.schema.as_deref(),
        &driver_type,
    )?;

    tracing::info!(
        session_id = %session_id,
        table = %payload.table,
        operation = %payload.operation,
        db_type = %driver_type,
        "generate_table_operation_sql"
    );

    Ok(sql)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateAlterSqlPayload {
    pub table: String,
    pub schema: Option<String>,
    pub changes: Vec<AlterColumnChange>,
}

#[tauri::command]
pub async fn generate_alter_sql_command(
    session_id: String,
    payload: GenerateAlterSqlPayload,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<Vec<String>, AppError> {
    let driver_type = {
        let mgr = manager.lock().await;
        mgr.get_config(&session_id)?.db_type.clone()
    };

    let sql = generate_alter_sql(
        &payload.table,
        payload.schema.as_deref(),
        &payload.changes,
        &driver_type,
    )?;

    tracing::info!(
        session_id = %session_id,
        table = %payload.table,
        statements = sql.len(),
        "generate_alter_sql"
    );

    Ok(sql)
}

#[tauri::command]
pub async fn apply_alter(
    session_id: String,
    payload: GenerateAlterSqlPayload,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<(), AppError> {
    let (driver, driver_type) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let driver_type = mgr.get_config(&session_id)?.db_type.clone();
        (driver, driver_type)
    };

    let statements = generate_alter_sql(
        &payload.table,
        payload.schema.as_deref(),
        &payload.changes,
        &driver_type,
    )?;

    if statements.is_empty() {
        return Ok(());
    }

    tracing::info!(
        session_id = %session_id,
        table = %payload.table,
        statements = statements.len(),
        "apply_alter"
    );

    for sql in &statements {
        driver.execute(sql).await?;
    }

    Ok(())
}
