use async_trait::async_trait;
use serde_json::json;

use super::{AIProvider, ChatMessage};

pub struct GeminiProvider {
    api_key: String,
}

impl GeminiProvider {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }
}

#[async_trait]
impl AIProvider for GeminiProvider {
    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
    ) -> Result<String, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, self.api_key
        );

        let mut system_instruction: Option<serde_json::Value> = None;
        let mut contents: Vec<serde_json::Value> = Vec::new();

        for msg in &messages {
            if msg.role == "system" {
                system_instruction =
                    Some(json!({"parts": [{"text": msg.content}]}));
            } else {
                let role = if msg.role == "assistant" {
                    "model"
                } else {
                    "user"
                };
                contents.push(json!({
                    "role": role,
                    "parts": [{"text": msg.content}]
                }));
            }
        }

        let mut body = json!({
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": 8192
            }
        });

        if let Some(si) = system_instruction {
            body["systemInstruction"] = si;
        }

        let response = reqwest::Client::new()
            .post(&url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Gemini API error ({}): {}", status, body));
        }

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

        data["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "No content in response".to_string())
    }
}
