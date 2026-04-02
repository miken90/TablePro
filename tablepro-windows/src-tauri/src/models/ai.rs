use serde::{Deserialize, Serialize};

/// AI provider type — determines default base URL and behavior.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderType {
    OpenAi,
    OpenRouter,
    LmStudio,
    Ollama,
    Custom,
}

impl ProviderType {
    pub fn default_base_url(&self) -> &str {
        match self {
            Self::OpenAi => "https://api.openai.com",
            Self::OpenRouter => "https://openrouter.ai",
            Self::LmStudio => "http://localhost:1234",
            Self::Ollama => "http://localhost:11434",
            Self::Custom => "",
        }
    }
}

/// Configuration for a single AI provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub id: String,
    pub provider_type: ProviderType,
    pub display_name: String,
    pub base_url: String,
    pub api_key: String, // stored encrypted via DPAPI
    pub model: String,
    pub is_enabled: bool,
}

/// AI feature that can be routed to a specific provider.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum AiFeature {
    Chat,
    ExplainQuery,
    FixError,
    InlineSuggestions,
}

/// Maps an AI feature to a provider ID + model.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFeatureRoute {
    pub feature: AiFeature,
    pub provider_id: String,
    pub model: String,
}

/// Chat message role.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

/// A single chat message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatMessage {
    pub role: ChatRole,
    pub content: String,
}

/// Token usage statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Streaming chunk sent from backend to frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AiStreamChunk {
    Started { conversation_id: String },
    Delta { text: String },
    Done { usage: Option<TokenUsage> },
    Error { message: String },
}

/// Request for AI chat streaming.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub provider_config: AiProviderConfig,
    pub messages: Vec<AiChatMessage>,
    pub system_prompt: Option<String>,
    pub conversation_id: String,
}
