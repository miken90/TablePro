pub mod anthropic;
pub mod gemini;
pub mod openai;
pub mod schema_context;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
    ) -> Result<String, String>;
}

pub fn create_provider(
    provider: &str,
    api_key: &str,
    base_url: Option<&str>,
) -> Result<Box<dyn AIProvider>, String> {
    match provider {
        "openai" => Ok(Box::new(openai::OpenAIProvider::new(
            api_key.to_string(),
            base_url.map(|s| s.to_string()),
        ))),
        "ollama" => Ok(Box::new(openai::OpenAIProvider::new(
            String::new(),
            Some(
                base_url
                    .unwrap_or("http://localhost:11434/v1")
                    .to_string(),
            ),
        ))),
        "anthropic" => Ok(Box::new(anthropic::AnthropicProvider::new(
            api_key.to_string(),
            base_url.map(|s| s.to_string()),
        ))),
        "gemini" => Ok(Box::new(gemini::GeminiProvider::new(
            api_key.to_string(),
        ))),
        _ => Err(format!("Unknown AI provider: {}", provider)),
    }
}
