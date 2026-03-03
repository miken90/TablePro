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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_provider_openai() {
        assert!(create_provider("openai", "key", None).is_ok());
    }

    #[test]
    fn create_provider_ollama() {
        assert!(create_provider("ollama", "", None).is_ok());
    }

    #[test]
    fn create_provider_anthropic() {
        assert!(create_provider("anthropic", "key", None).is_ok());
    }

    #[test]
    fn create_provider_gemini() {
        assert!(create_provider("gemini", "key", None).is_ok());
    }

    #[test]
    fn create_provider_unknown() {
        let err = create_provider("unknown", "", None).err().expect("expected Err");
        assert!(err.contains("Unknown AI provider"));
    }

    #[test]
    fn create_provider_openai_custom_base_url() {
        assert!(create_provider("openai", "key", Some("https://custom.api")).is_ok());
    }

    #[test]
    fn chat_message_serde_round_trip() {
        let msg = ChatMessage {
            role: "user".to_string(),
            content: "hello".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let deserialized: ChatMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.role, "user");
        assert_eq!(deserialized.content, "hello");
    }
}
