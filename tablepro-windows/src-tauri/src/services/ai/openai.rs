use async_trait::async_trait;
use serde_json::json;

use super::{AIProvider, ChatMessage};

pub struct OpenAIProvider {
    api_key: String,
    base_url: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String, base_url: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
        }
    }
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
    ) -> Result<String, String> {
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let api_messages: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| {
                json!({
                    "role": m.role,
                    "content": m.content
                })
            })
            .collect();

        let body = json!({
            "model": model,
            "messages": api_messages,
            "stream": false
        });

        let client = reqwest::Client::new();
        let mut req = client.post(&url).json(&body);

        if !self.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", self.api_key));
        }

        let response = req.send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({}): {}", status, body));
        }

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

        data["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "No content in response".to_string())
    }
}
