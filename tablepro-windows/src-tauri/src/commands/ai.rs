use std::collections::HashMap;

use futures::StreamExt;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::Mutex;
use tracing::info;

use crate::models::ai::{
    AiChatMessage, AiChatRequest, AiProviderConfig, AiStreamChunk, ChatRole,
};
use crate::models::AppError;
use crate::services::ai_provider::{AiProvider, OpenAiCompatibleProvider};
use crate::services::ai_schema_context::{self, PromptTemplate};
use crate::services::ConnectionManager;
use crate::storage::ai_chat_store::{
    AiChatStore, ChatMessage, Conversation, ConversationWithMessages,
};

/// Stores cancellation tokens for in-flight AI streams, keyed by unique stream ID.
pub struct AiCancelState {
    /// Maps stream_id → cancel sender. Also tracks conversation_id → stream_id
    /// so the frontend can cancel by conversation.
    tokens: HashMap<String, tokio::sync::watch::Sender<bool>>,
    conv_to_stream: HashMap<String, String>,
}

impl Default for AiCancelState {
    fn default() -> Self {
        Self::new()
    }
}

impl AiCancelState {
    pub fn new() -> Self {
        Self {
            tokens: HashMap::new(),
            conv_to_stream: HashMap::new(),
        }
    }
}

/// Stream AI chat completions to the frontend via a `Channel<T>`.
#[tauri::command]
pub async fn ai_chat_stream(
    request: AiChatRequest,
    channel: Channel<AiStreamChunk>,
    cancel_state: State<'_, Mutex<AiCancelState>>,
) -> Result<(), AppError> {
    let conversation_id = request.conversation_id.clone();
    let stream_id = uuid::Uuid::new_v4().to_string();
    info!(conversation_id = %conversation_id, stream_id = %stream_id, "ai_chat_stream: starting");

    let provider = OpenAiCompatibleProvider::new()?;

    // Create cancellation channel with unique stream_id
    let (cancel_tx, mut cancel_rx) = tokio::sync::watch::channel(false);
    {
        let mut state = cancel_state.lock().await;
        // Cancel any previous stream for this conversation
        if let Some(old_stream_id) = state.conv_to_stream.remove(&conversation_id) {
            if let Some(old_tx) = state.tokens.remove(&old_stream_id) {
                let _ = old_tx.send(true);
            }
        }
        state.tokens.insert(stream_id.clone(), cancel_tx);
        state
            .conv_to_stream
            .insert(conversation_id.clone(), stream_id.clone());
    }

    // Send Started chunk
    let _ = channel.send(AiStreamChunk::Started {
        conversation_id: conversation_id.clone(),
    });

    // Stream tokens
    let mut stream = provider.stream_chat(request);

    loop {
        tokio::select! {
            chunk = stream.next() => {
                match chunk {
                    Some(c) => {
                        let _ = channel.send(c);
                    }
                    None => break,
                }
            }
            changed = cancel_rx.changed() => {
                if changed.is_err() || *cancel_rx.borrow() {
                    let _ = channel.send(AiStreamChunk::Error {
                        message: "Cancelled".to_string(),
                    });
                    break;
                }
            }
        }
    }

    // Cleanup cancellation token
    {
        let mut state = cancel_state.lock().await;
        state.tokens.remove(&stream_id);
        if state.conv_to_stream.get(&conversation_id).map(|s| s.as_str()) == Some(&stream_id) {
            state.conv_to_stream.remove(&conversation_id);
        }
    }

    info!(conversation_id = %conversation_id, stream_id = %stream_id, "ai_chat_stream: finished");
    Ok(())
}

/// List available models from the provider.
#[tauri::command]
pub async fn ai_list_models(
    provider_config: AiProviderConfig,
) -> Result<Vec<String>, AppError> {
    info!("ai_list_models: fetching from {}", provider_config.base_url);
    let provider = OpenAiCompatibleProvider::new()?;
    provider.fetch_models(&provider_config).await
}

/// Test connectivity and authentication with a provider.
#[tauri::command]
pub async fn ai_test_provider(
    provider_config: AiProviderConfig,
) -> Result<bool, AppError> {
    info!("ai_test_provider: testing {}", provider_config.base_url);
    let provider = OpenAiCompatibleProvider::new()?;
    provider.test_connection(&provider_config).await
}

/// Cancel an in-flight AI chat stream.
#[tauri::command]
pub async fn ai_cancel_chat(
    conversation_id: String,
    cancel_state: State<'_, Mutex<AiCancelState>>,
) -> Result<(), AppError> {
    info!(conversation_id = %conversation_id, "ai_cancel_chat");
    let state = cancel_state.lock().await;
    if let Some(stream_id) = state.conv_to_stream.get(&conversation_id) {
        if let Some(tx) = state.tokens.get(stream_id) {
            let _ = tx.send(true);
        }
    }
    Ok(())
}

/// Generate an inline completion from the AI provider.
///
/// The frontend resolves which provider to use (via feature routing settings)
/// and passes the config directly.
#[tauri::command]
pub async fn ai_inline_suggest(
    prefix: String,
    suffix: String,
    settings_state: State<'_, Mutex<crate::storage::SettingsStore>>,
) -> Result<String, AppError> {
    // Resolve provider from settings (inline suggestions feature routing)
    let (base_url, api_key, model) = {
        let settings = settings_state.lock().await;
        let app_settings = settings.get();
        let ai = &app_settings.ai;

        // Find provider for inline suggestions via feature routing
        let route = ai.feature_routing.iter().find(|r| r.feature == "inlineSuggestions");

        let provider = if let Some(route) = route {
            ai.providers
                .iter()
                .find(|p| p.id == route.provider_id && p.is_enabled)
        } else {
            ai.providers.iter().find(|p| p.is_enabled)
        };

        let provider = provider.ok_or_else(|| {
            AppError::Other("No AI provider configured for inline suggestions".to_string())
        })?;

        let model = route
            .map(|r| r.model.clone())
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| provider.model.clone());

        (
            provider.base_url.clone(),
            provider.api_key.clone(),
            model,
        )
    };

    let http_provider = OpenAiCompatibleProvider::new()?;

    let prompt = format!(
        "Complete the following SQL query. Return ONLY the completion text, nothing else. \
         Do not repeat the existing prefix.\n\n{prefix}"
    );

    let request = AiChatRequest {
        provider_config: AiProviderConfig {
            id: String::new(),
            provider_type: crate::models::ai::ProviderType::Custom,
            display_name: String::new(),
            base_url,
            api_key,
            model,
            is_enabled: true,
        },
        messages: vec![AiChatMessage {
            role: ChatRole::User,
            content: prompt,
        }],
        system_prompt: Some(format!(
            "You are a SQL autocomplete engine. Given partial SQL, output ONLY the remaining text \
             to complete the statement. No explanations, no markdown. \
             Context after cursor: {suffix}"
        )),
        conversation_id: String::new(),
    };

    // Collect the full response (non-streaming for inline suggestions)
    let mut stream = http_provider.stream_chat(request);
    let mut result = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk {
            AiStreamChunk::Delta { text } => result.push_str(&text),
            AiStreamChunk::Error { message } => return Err(AppError::Other(message)),
            AiStreamChunk::Done { .. } => break,
            _ => {}
        }
    }

    // Clean up: trim markdown fences if the model wraps the output
    let result = result.trim();
    let result = result
        .strip_prefix("```sql")
        .or_else(|| result.strip_prefix("```"))
        .unwrap_or(result);
    let result = result.strip_suffix("```").unwrap_or(result).trim();

    Ok(result.to_string())
}

/// Build a system prompt enriched with the current database schema.
#[tauri::command]
pub async fn ai_build_context(
    session_id: String,
    template: String,
    manager: State<'_, Mutex<ConnectionManager>>,
) -> Result<String, AppError> {
    let prompt_template = PromptTemplate::from_str_loose(&template).ok_or_else(|| {
        AppError::Other(format!("Unknown prompt template: {template}"))
    })?;

    let (driver, db_type, db_name) = {
        let mgr = manager.lock().await;
        let driver = mgr.get_driver(&session_id)?;
        let config = mgr.get_config(&session_id)?;
        (
            driver,
            config.db_type.clone(),
            config.database.clone(),
        )
    };

    let tables = driver.fetch_tables().await?;

    let max_tables: usize = 50;
    let selected = &tables[..tables.len().min(max_tables)];

    let mut columns_by_table = HashMap::new();
    let mut foreign_keys = HashMap::new();

    for table in selected {
        let cols = driver
            .fetch_columns(&table.name, table.schema.as_deref())
            .await?;
        columns_by_table.insert(table.name.clone(), cols);

        let fks = driver
            .fetch_foreign_keys(&table.name, table.schema.as_deref())
            .await?;
        if !fks.is_empty() {
            foreign_keys.insert(table.name.clone(), fks);
        }
    }

    let prompt = ai_schema_context::build_system_prompt(
        &db_type,
        &db_name,
        &tables,
        &columns_by_table,
        &foreign_keys,
        prompt_template,
        max_tables,
    );

    info!(session_id = %session_id, template = %template, tables = tables.len(), "ai_build_context");
    Ok(prompt)
}

// -- AI chat storage commands -------------------------------------------------

#[tauri::command]
pub async fn ai_create_conversation(
    id: String,
    title: String,
    connection_name: Option<String>,
    store: State<'_, Mutex<AiChatStore>>,
) -> Result<(), AppError> {
    let store = store.lock().await;
    store
        .create_conversation_for_async(&id, &title, connection_name.as_deref())
        .map_err(AppError::Other)
}

#[tauri::command]
pub async fn ai_save_message(
    message: ChatMessage,
    store: State<'_, Mutex<AiChatStore>>,
) -> Result<(), AppError> {
    let store = store.lock().await;
    store
        .save_message_for_async(&message)
        .map_err(AppError::Other)
}

#[tauri::command]
pub async fn ai_list_conversations(
    store: State<'_, Mutex<AiChatStore>>,
) -> Result<Vec<Conversation>, AppError> {
    let store = store.lock().await;
    store.list_conversations_for_async().map_err(AppError::Other)
}

#[tauri::command]
pub async fn ai_get_conversation(
    id: String,
    store: State<'_, Mutex<AiChatStore>>,
) -> Result<ConversationWithMessages, AppError> {
    let store = store.lock().await;
    store
        .get_conversation_for_async(&id)
        .map_err(AppError::Other)
}

#[tauri::command]
pub async fn ai_delete_conversation(
    id: String,
    store: State<'_, Mutex<AiChatStore>>,
) -> Result<(), AppError> {
    let store = store.lock().await;
    store
        .delete_conversation_for_async(&id)
        .map_err(AppError::Other)
}

#[tauri::command]
pub async fn ai_clear_all_conversations(
    store: State<'_, Mutex<AiChatStore>>,
) -> Result<(), AppError> {
    let store = store.lock().await;
    store.clear_all_for_async().map_err(AppError::Other)
}
