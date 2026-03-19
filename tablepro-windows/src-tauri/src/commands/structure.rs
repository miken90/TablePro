use serde::Deserialize;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::AppError;
use crate::services::ddl_generator::{generate_create_table, ColumnDefinition};
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
