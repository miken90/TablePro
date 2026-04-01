use std::pin::Pin;

use async_trait::async_trait;
use futures::stream::{self, Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

use crate::models::ai::{
    AiChatRequest, AiProviderConfig, AiStreamChunk, ChatRole, TokenUsage,
};
use crate::models::AppError;

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

/// Abstraction over AI completion providers.
#[async_trait]
pub trait AiProvider: Send + Sync {
    /// Stream chat completions as a series of chunks.
    fn stream_chat(
        &self,
        request: AiChatRequest,
    ) -> Pin<Box<dyn Stream<Item = AiStreamChunk> + Send>>;

    /// List available models from the provider.
    async fn fetch_models(&self, config: &AiProviderConfig) -> Result<Vec<String>, AppError>;

    /// Quick connectivity + auth check.
    async fn test_connection(&self, config: &AiProviderConfig) -> Result<bool, AppError>;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible request/response types (internal)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct OaiRequest {
    model: String,
    messages: Vec<OaiMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct OaiMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OaiChunk {
    choices: Vec<OaiChoice>,
    usage: Option<OaiUsage>,
}

#[derive(Deserialize)]
struct OaiChoice {
    delta: Option<OaiDelta>,
}

#[derive(Deserialize)]
struct OaiDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OaiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Deserialize)]
struct OaiModelsResponse {
    data: Vec<OaiModel>,
}

#[derive(Deserialize)]
struct OaiModel {
    id: String,
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider
// ---------------------------------------------------------------------------

pub struct OpenAiCompatibleProvider {
    client: Client,
}

impl OpenAiCompatibleProvider {
    pub fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .build()
            .map_err(|e| AppError::Other(format!("Failed to create HTTP client: {e}")))?;
        Ok(Self { client })
    }

    fn chat_url(base_url: &str) -> String {
        let base = base_url.trim_end_matches('/');
        format!("{base}/v1/chat/completions")
    }

    fn models_url(base_url: &str) -> String {
        let base = base_url.trim_end_matches('/');
        format!("{base}/v1/models")
    }

    fn build_messages(request: &AiChatRequest) -> Vec<OaiMessage> {
        let mut msgs = Vec::new();

        if let Some(ref sys) = request.system_prompt {
            msgs.push(OaiMessage {
                role: "system".into(),
                content: sys.clone(),
            });
        }

        for m in &request.messages {
            let role = match m.role {
                ChatRole::System => "system",
                ChatRole::User => "user",
                ChatRole::Assistant => "assistant",
            };
            msgs.push(OaiMessage {
                role: role.into(),
                content: m.content.clone(),
            });
        }

        msgs
    }
}

#[async_trait]
impl AiProvider for OpenAiCompatibleProvider {
    fn stream_chat(
        &self,
        request: AiChatRequest,
    ) -> Pin<Box<dyn Stream<Item = AiStreamChunk> + Send>> {
        let client = self.client.clone();
        let url = Self::chat_url(&request.provider_config.base_url);
        let api_key = request.provider_config.api_key.clone();
        let conversation_id = request.conversation_id.clone();

        let body = OaiRequest {
            model: request.provider_config.model.clone(),
            messages: Self::build_messages(&request),
            stream: true,
        };

        let stream = async_stream(client, url, api_key, body, conversation_id);
        Box::pin(stream)
    }

    async fn fetch_models(&self, config: &AiProviderConfig) -> Result<Vec<String>, AppError> {
        let url = Self::models_url(&config.base_url);

        let mut req = self.client.get(&url);
        if !config.api_key.is_empty() {
            req = req.bearer_auth(&config.api_key);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| AppError::Other(format!("Failed to fetch models: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Other(format!(
                "Models request failed ({status}): {body}"
            )));
        }

        let models: OaiModelsResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Other(format!("Failed to parse models response: {e}")))?;

        let mut ids: Vec<String> = models.data.into_iter().map(|m| m.id).collect();
        ids.sort();
        Ok(ids)
    }

    async fn test_connection(&self, config: &AiProviderConfig) -> Result<bool, AppError> {
        match self.fetch_models(config).await {
            Ok(_) => Ok(true),
            Err(e) => {
                debug!("AI connection test failed: {e}");
                Ok(false)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// SSE streaming helper
// ---------------------------------------------------------------------------

fn async_stream(
    client: Client,
    url: String,
    api_key: String,
    body: OaiRequest,
    conversation_id: String,
) -> impl Stream<Item = AiStreamChunk> + Send {
    stream::once(async move {
        let mut req = client.post(&url).json(&body);
        if !api_key.is_empty() {
            req = req.bearer_auth(&api_key);
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                return stream::iter(vec![AiStreamChunk::Error {
                    message: format!("Network error: {e}"),
                }])
                .boxed();
            }
        };

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            let message = match status.as_u16() {
                401 => format!("Invalid API key or unauthorized ({status})"),
                429 => format!("Rate limited — please retry later ({status})"),
                _ => format!("Request failed ({status}): {body_text}"),
            };
            return stream::iter(vec![AiStreamChunk::Error { message }]).boxed();
        }

        // Emit Started, then parse SSE lines from the response body
        let conv_id = conversation_id.clone();
        let byte_stream = resp.bytes_stream();

        let sse_stream = stream::once(async move {
            AiStreamChunk::Started {
                conversation_id: conv_id,
            }
        })
        .chain(parse_sse_stream(byte_stream));

        sse_stream.boxed()
    })
    .flatten()
}

/// Parse SSE lines from a byte stream.
fn parse_sse_stream(
    byte_stream: impl Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send + 'static,
) -> impl Stream<Item = AiStreamChunk> + Send {
    let mut line_buffer = String::new();
    let mut byte_remainder: Vec<u8> = Vec::new();

    byte_stream
        .map(move |chunk_result| {
            let mut chunks = Vec::new();

            let bytes = match chunk_result {
                Ok(b) => b,
                Err(e) => {
                    chunks.push(AiStreamChunk::Error {
                        message: format!("Stream read error: {e}"),
                    });
                    return stream::iter(chunks);
                }
            };

            // Prepend any leftover bytes from previous chunk (UTF-8 boundary)
            let combined: Vec<u8> = if byte_remainder.is_empty() {
                bytes.to_vec()
            } else {
                let mut buf = std::mem::take(&mut byte_remainder);
                buf.extend_from_slice(&bytes);
                buf
            };

            // Decode as much valid UTF-8 as possible
            let (text, leftover) = match std::str::from_utf8(&combined) {
                Ok(s) => (s.to_string(), 0),
                Err(e) => {
                    let valid_up_to = e.valid_up_to();
                    if valid_up_to == 0 && combined.len() < 4 {
                        // Entire chunk is an incomplete multi-byte char, buffer it
                        byte_remainder = combined;
                        return stream::iter(chunks);
                    }
                    let valid = unsafe { std::str::from_utf8_unchecked(&combined[..valid_up_to]) };
                    (valid.to_string(), combined.len() - valid_up_to)
                }
            };

            if leftover > 0 {
                byte_remainder = combined[combined.len() - leftover..].to_vec();
            }

            line_buffer.push_str(&text);

            // Process complete lines
            while let Some(newline_pos) = line_buffer.find('\n') {
                let line = line_buffer[..newline_pos]
                    .trim_end_matches('\r')
                    .to_string();
                line_buffer = line_buffer[newline_pos + 1..].to_string();

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    let data = data.trim();
                    if data == "[DONE]" {
                        chunks.push(AiStreamChunk::Done { usage: None });
                        continue;
                    }

                    match serde_json::from_str::<OaiChunk>(data) {
                        Ok(oai) => {
                            // Extract delta content
                            for choice in &oai.choices {
                                if let Some(ref delta) = choice.delta {
                                    if let Some(ref content) = delta.content {
                                        if !content.is_empty() {
                                            chunks.push(AiStreamChunk::Delta {
                                                text: content.clone(),
                                            });
                                        }
                                    }
                                }
                            }

                            // If usage is present (some providers send it in last chunk)
                            if let Some(u) = oai.usage {
                                chunks.push(AiStreamChunk::Done {
                                    usage: Some(TokenUsage {
                                        prompt_tokens: u.prompt_tokens,
                                        completion_tokens: u.completion_tokens,
                                        total_tokens: u.total_tokens,
                                    }),
                                });
                            }
                        }
                        Err(e) => {
                            warn!("Failed to parse SSE chunk: {e} — data: {data}");
                        }
                    }
                }
            }

            stream::iter(chunks)
        })
        .flatten()
}
