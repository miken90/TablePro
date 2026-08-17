use std::path::PathBuf;

use rusqlite::Connection;

use crate::models::AppError;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub connection_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub token_count: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationWithMessages {
    pub conversation: Conversation,
    pub messages: Vec<ChatMessage>,
}

/// Persists AI chat conversations and messages to `{data_dir}/TablePro/ai_chat.db`.
pub struct AiChatStore {
    conn: Connection,
}

impl AiChatStore {
    pub fn new() -> Result<Self, String> {
        let path = Self::db_path().map_err(|e| e.to_string())?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        let store = Self { conn };
        store.create_tables()?;
        tracing::info!("AI chat store opened at {}", path.display());
        Ok(store)
    }

    /// Create an in-memory store for tests.
    pub fn new_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        let store = Self { conn };
        store.create_tables()?;
        Ok(store)
    }

    fn db_path() -> Result<PathBuf, AppError> {
        let base = dirs::data_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve data directory".into()))?;
        Ok(base.join("TablePro").join("ai_chat.db"))
    }

    fn create_tables(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    connection_name TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    token_count INTEGER,
                    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                );",
            )
            .map_err(|e| e.to_string())
    }

    fn run_blocking_db<T, F>(&self, op: F) -> Result<T, String>
    where
        F: FnOnce(&Self) -> Result<T, String>,
    {
        match tokio::runtime::Handle::try_current() {
            Ok(_) => tokio::task::block_in_place(|| op(self)),
            Err(_) => op(self),
        }
    }

    // -- Async-safe wrappers --------------------------------------------------

    pub fn create_conversation_for_async(
        &self,
        id: &str,
        title: &str,
        connection_name: Option<&str>,
    ) -> Result<(), String> {
        self.run_blocking_db(|s| s.create_conversation(id, title, connection_name))
    }

    pub fn save_message_for_async(&self, msg: &ChatMessage) -> Result<(), String> {
        self.run_blocking_db(|s| s.save_message(msg))
    }

    pub fn list_conversations_for_async(&self) -> Result<Vec<Conversation>, String> {
        self.run_blocking_db(|s| s.list_conversations())
    }

    pub fn get_conversation_for_async(
        &self,
        id: &str,
    ) -> Result<ConversationWithMessages, String> {
        self.run_blocking_db(|s| s.get_conversation(id))
    }

    pub fn delete_conversation_for_async(&self, id: &str) -> Result<(), String> {
        self.run_blocking_db(|s| s.delete_conversation(id))
    }

    pub fn clear_all_for_async(&self) -> Result<(), String> {
        self.run_blocking_db(|s| s.clear_all())
    }

    pub fn cleanup_old_for_async(&self, days: u32) -> Result<u32, String> {
        self.run_blocking_db(|s| s.cleanup_old(days))
    }

    // -- Core operations (synchronous) ----------------------------------------

    pub fn create_conversation(
        &self,
        id: &str,
        title: &str,
        connection_name: Option<&str>,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO conversations (id, title, connection_name) VALUES (?1, ?2, ?3)",
                rusqlite::params![id, title, connection_name],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn save_message(&self, msg: &ChatMessage) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO messages (id, conversation_id, role, content, token_count)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    msg.id,
                    msg.conversation_id,
                    msg.role,
                    msg.content,
                    msg.token_count
                ],
            )
            .map_err(|e| e.to_string())?;
        self.update_conversation_timestamp(&msg.conversation_id)?;
        Ok(())
    }

    pub fn list_conversations(&self) -> Result<Vec<Conversation>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.id, c.title, c.connection_name, c.created_at, c.updated_at,
                        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id)
                 FROM conversations c
                 ORDER BY c.updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    connection_name: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    message_count: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_conversation(&self, id: &str) -> Result<ConversationWithMessages, String> {
        let conversation = self
            .conn
            .query_row(
                "SELECT c.id, c.title, c.connection_name, c.created_at, c.updated_at,
                        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id)
                 FROM conversations c WHERE c.id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(Conversation {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        connection_name: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                        message_count: row.get(5)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;

        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, conversation_id, role, content, token_count, created_at
                 FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let messages = stmt
            .query_map(rusqlite::params![id], |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    token_count: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(ConversationWithMessages {
            conversation,
            messages,
        })
    }

    pub fn delete_conversation(&self, id: &str) -> Result<(), String> {
        let affected = self
            .conn
            .execute(
                "DELETE FROM conversations WHERE id = ?1",
                rusqlite::params![id],
            )
            .map_err(|e| e.to_string())?;
        if affected == 0 {
            return Err(format!("Conversation {id} not found"));
        }
        Ok(())
    }

    pub fn clear_all(&self) -> Result<(), String> {
        self.conn
            .execute_batch("DELETE FROM messages; DELETE FROM conversations;")
            .map_err(|e| e.to_string())
    }

    pub fn cleanup_old(&self, days: u32) -> Result<u32, String> {
        let query = format!(
            "DELETE FROM conversations WHERE updated_at < datetime('now', 'localtime', '-{days} days')"
        );
        let affected = self
            .conn
            .execute(&query, [])
            .map_err(|e| e.to_string())?;
        if affected > 0 {
            tracing::info!("AI chat cleanup: removed {affected} old conversations");
        }
        Ok(affected as u32)
    }

    fn update_conversation_timestamp(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE conversations SET updated_at = datetime('now', 'localtime') WHERE id = ?1",
                rusqlite::params![id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> AiChatStore {
        AiChatStore::new_in_memory().expect("in-memory store")
    }

    #[test]
    fn test_create_and_list_conversations() {
        let store = make_store();
        store
            .create_conversation("c1", "First chat", Some("pg-local"))
            .unwrap();
        store
            .create_conversation("c2", "Second chat", None)
            .unwrap();

        let convos = store.list_conversations().unwrap();
        assert_eq!(convos.len(), 2);

        let c1 = convos.iter().find(|c| c.id == "c1").unwrap();
        let c2 = convos.iter().find(|c| c.id == "c2").unwrap();
        assert_eq!(c1.title, "First chat");
        assert_eq!(c1.connection_name.as_deref(), Some("pg-local"));
        assert_eq!(c2.title, "Second chat");
        assert_eq!(c2.connection_name, None);
    }

    #[test]
    fn test_save_and_get_messages() {
        let store = make_store();
        store
            .create_conversation("c1", "Test conv", None)
            .unwrap();

        let msg1 = ChatMessage {
            id: "m1".to_string(),
            conversation_id: "c1".to_string(),
            role: "user".to_string(),
            content: "Hello".to_string(),
            token_count: Some(5),
            created_at: String::new(),
        };
        let msg2 = ChatMessage {
            id: "m2".to_string(),
            conversation_id: "c1".to_string(),
            role: "assistant".to_string(),
            content: "Hi there!".to_string(),
            token_count: Some(10),
            created_at: String::new(),
        };
        store.save_message(&msg1).unwrap();
        store.save_message(&msg2).unwrap();

        let result = store.get_conversation("c1").unwrap();
        assert_eq!(result.conversation.id, "c1");
        assert_eq!(result.conversation.message_count, 2);
        assert_eq!(result.messages.len(), 2);
        assert_eq!(result.messages[0].role, "user");
        assert_eq!(result.messages[1].role, "assistant");
    }

    #[test]
    fn test_delete_conversation_cascades_messages() {
        let store = make_store();
        store
            .create_conversation("c1", "To delete", None)
            .unwrap();

        let msg = ChatMessage {
            id: "m1".to_string(),
            conversation_id: "c1".to_string(),
            role: "user".to_string(),
            content: "Will be deleted".to_string(),
            token_count: None,
            created_at: String::new(),
        };
        store.save_message(&msg).unwrap();
        store.delete_conversation("c1").unwrap();

        // Conversation gone
        let result = store.get_conversation("c1");
        assert!(result.is_err());

        // Messages also gone (cascade)
        let count: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_cleanup_old() {
        let store = make_store();
        store.create_conversation("old", "Old chat", None).unwrap();

        // Manually backdate the conversation
        store
            .conn
            .execute(
                "UPDATE conversations SET updated_at = datetime('now', 'localtime', '-60 days') WHERE id = 'old'",
                [],
            )
            .unwrap();

        store
            .create_conversation("new", "New chat", None)
            .unwrap();

        let deleted = store.cleanup_old(30).unwrap();
        assert_eq!(deleted, 1);

        let convos = store.list_conversations().unwrap();
        assert_eq!(convos.len(), 1);
        assert_eq!(convos[0].id, "new");
    }

    #[test]
    fn test_clear_all() {
        let store = make_store();
        store.create_conversation("c1", "Chat 1", None).unwrap();
        store.create_conversation("c2", "Chat 2", None).unwrap();

        let msg = ChatMessage {
            id: "m1".to_string(),
            conversation_id: "c1".to_string(),
            role: "user".to_string(),
            content: "Hello".to_string(),
            token_count: None,
            created_at: String::new(),
        };
        store.save_message(&msg).unwrap();

        store.clear_all().unwrap();

        let convos = store.list_conversations().unwrap();
        assert!(convos.is_empty());

        let msg_count: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))
            .unwrap();
        assert_eq!(msg_count, 0);
    }
}
