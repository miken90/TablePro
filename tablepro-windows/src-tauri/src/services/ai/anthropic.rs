use async_trait::async_trait;
use serde_json::json;

use super::{AIProvider, ChatMessage};

pub struct AnthropicProvider {
    api_key: String,
    base_url: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, base_url: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url
                .unwrap_or_else(|| "https://api.anthropic.com".to_string()),
        }
    }
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
    ) -> Result<String, String> {
        let url = format!("{}/v1/messages", self.base_url.trim_end_matches('/'));

        let mut system_prompt = String::new();
        let mut api_messages: Vec<serde_json::Value> = Vec::new();

        for msg in &messages {
            if msg.role == "system" {
                system_prompt = msg.content.clone();
            } else {
                api_messages.push(json!({
                    "role": msg.role,
                    "content": msg.content
                }));
            }
        }

        let mut body = json!({
            "model": model,
            "max_tokens": 4096,
            "messages": api_messages,
            "stream": false
        });

        if !system_prompt.is_empty() {
            body["system"] = json!(system_prompt);
        }

        let response = reqwest::Client::new()
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error ({}): {}", status, body));
        }

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

        data["content"][0]["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "No content in response".to_string())
    }
}
