use std::path::PathBuf;

use rusqlite::Connection;

use crate::models::AppError;

/// A single history entry as stored in SQLite.
#[derive(Debug, Clone, serde::Serialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub query: String,
    pub database: Option<String>,
    pub execution_time_ms: i64,
    pub row_count: i64,
    pub status: String,
    pub timestamp: String,
}

/// Persists query history to `{data_dir}/TablePro/history.sqlite3` with FTS5 search.
pub struct HistoryStore {
    conn: Connection,
}

impl HistoryStore {
    pub fn new() -> Result<Self, String> {
        let path = Self::db_path().map_err(|e| e.to_string())?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| e.to_string())?;
        let store = Self { conn };
        store.create_tables()?;
        tracing::info!("History store opened at {}", path.display());
        Ok(store)
    }

    /// Create an in-memory store (for testing).
    #[cfg(test)]
    pub fn new_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        let store = Self { conn };
        store.create_tables()?;
        Ok(store)
    }

    fn db_path() -> Result<PathBuf, AppError> {
        let base = dirs::data_dir()
            .ok_or_else(|| AppError::IoError("Cannot resolve data directory".into()))?;
        Ok(base.join("TablePro").join("history.sqlite3"))
    }

    fn create_tables(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query TEXT NOT NULL,
                    database TEXT,
                    execution_time_ms INTEGER NOT NULL,
                    row_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'success',
                    timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS history_fts
                    USING fts5(query, content=history, content_rowid=id);
                CREATE TRIGGER IF NOT EXISTS history_ai AFTER INSERT ON history BEGIN
                    INSERT INTO history_fts(rowid, query) VALUES (new.id, new.query);
                END;
                CREATE TRIGGER IF NOT EXISTS history_ad AFTER DELETE ON history BEGIN
                    INSERT INTO history_fts(history_fts, rowid, query)
                        VALUES ('delete', old.id, old.query);
                END;",
            )
            .map_err(|e| e.to_string())
    }

    /// Record a new history entry.
    pub fn insert(
        &self,
        query: &str,
        database: Option<&str>,
        execution_time_ms: i64,
        row_count: i64,
        status: &str,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO history (query, database, execution_time_ms, row_count, status, timestamp)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now', 'localtime'))",
                rusqlite::params![query, database, execution_time_ms, row_count, status],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Return the most recent entries, newest first.
    pub fn fetch_recent(&self, limit: u32) -> Result<Vec<HistoryEntry>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, query, database, execution_time_ms, row_count, status, timestamp
                 FROM history ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![limit], |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    query: row.get(1)?,
                    database: row.get(2)?,
                    execution_time_ms: row.get(3)?,
                    row_count: row.get(4)?,
                    status: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// Full-text search across query history.
    /// Empty search term falls back to `fetch_recent`.
    pub fn search(&self, term: &str) -> Result<Vec<HistoryEntry>, String> {
        let trimmed = term.trim();
        if trimmed.is_empty() {
            return self.fetch_recent(100);
        }

        // Wrap in double quotes to handle FTS5 special characters.
        let safe_term = format!("\"{}\"", trimmed.replace('"', "\"\""));

        let mut stmt = self
            .conn
            .prepare(
                "SELECT h.id, h.query, h.database, h.execution_time_ms,
                        h.row_count, h.status, h.timestamp
                 FROM history_fts f
                 JOIN history h ON h.id = f.rowid
                 WHERE history_fts MATCH ?1
                 ORDER BY h.id DESC
                 LIMIT 100",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![safe_term], |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    query: row.get(1)?,
                    database: row.get(2)?,
                    execution_time_ms: row.get(3)?,
                    row_count: row.get(4)?,
                    status: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// Delete all history entries.
    pub fn clear_all(&self) -> Result<(), String> {
        self.conn
            .execute_batch("DELETE FROM history;")
            .map_err(|e| e.to_string())
    }

    /// Delete a single entry by id.
    pub fn delete_entry(&self, id: i64) -> Result<(), String> {
        let affected = self
            .conn
            .execute("DELETE FROM history WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
        if affected == 0 {
            return Err(format!("History entry {id} not found"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> HistoryStore {
        HistoryStore::new_in_memory().expect("in-memory store")
    }

    #[test]
    fn insert_and_fetch_recent_round_trip() {
        let store = make_store();
        store
            .insert("SELECT 1", Some("testdb"), 42, 1, "success")
            .unwrap();
        let entries = store.fetch_recent(10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].query, "SELECT 1");
        assert_eq!(entries[0].database.as_deref(), Some("testdb"));
        assert_eq!(entries[0].execution_time_ms, 42);
        assert_eq!(entries[0].row_count, 1);
        assert_eq!(entries[0].status, "success");
    }

    #[test]
    fn fetch_recent_returns_newest_first() {
        let store = make_store();
        store.insert("SELECT 1", None, 10, 1, "success").unwrap();
        store.insert("SELECT 2", None, 20, 2, "success").unwrap();
        store.insert("SELECT 3", None, 30, 3, "success").unwrap();
        let entries = store.fetch_recent(10).unwrap();
        assert_eq!(entries[0].query, "SELECT 3");
        assert_eq!(entries[1].query, "SELECT 2");
        assert_eq!(entries[2].query, "SELECT 1");
    }

    #[test]
    fn fetch_recent_respects_limit() {
        let store = make_store();
        for i in 0..5 {
            store
                .insert(&format!("SELECT {i}"), None, 10, 1, "success")
                .unwrap();
        }
        let entries = store.fetch_recent(2).unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn search_returns_fts5_matches() {
        let store = make_store();
        store
            .insert("SELECT * FROM users", None, 10, 5, "success")
            .unwrap();
        store
            .insert("SELECT * FROM orders", None, 20, 3, "success")
            .unwrap();
        let results = store.search("users").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].query, "SELECT * FROM users");
    }

    #[test]
    fn search_empty_term_falls_back_to_fetch_recent() {
        let store = make_store();
        store.insert("SELECT 1", None, 10, 1, "success").unwrap();
        store.insert("SELECT 2", None, 20, 2, "success").unwrap();
        let results = store.search("").unwrap();
        assert_eq!(results.len(), 2);
        // Should be newest first (same as fetch_recent)
        assert_eq!(results[0].query, "SELECT 2");
    }

    #[test]
    fn search_handles_fts5_special_characters() {
        let store = make_store();
        store
            .insert("SELECT \"col\" FROM t", None, 10, 1, "success")
            .unwrap();
        // Should not crash on quotes
        let results = store.search("\"col\"");
        assert!(results.is_ok());
    }

    #[test]
    fn delete_entry_removes_specific_entry() {
        let store = make_store();
        store.insert("SELECT 1", None, 10, 1, "success").unwrap();
        store.insert("SELECT 2", None, 20, 2, "success").unwrap();
        let entries = store.fetch_recent(10).unwrap();
        let id_to_delete = entries[0].id; // newest (SELECT 2)
        store.delete_entry(id_to_delete).unwrap();
        let remaining = store.fetch_recent(10).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].query, "SELECT 1");
    }

    #[test]
    fn delete_entry_nonexistent_id_returns_error() {
        let store = make_store();
        let result = store.delete_entry(999);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn clear_all_removes_all_entries() {
        let store = make_store();
        store.insert("SELECT 1", None, 10, 1, "success").unwrap();
        store.insert("SELECT 2", None, 20, 2, "success").unwrap();
        store.insert("SELECT 3", None, 30, 3, "success").unwrap();
        store.clear_all().unwrap();
        let entries = store.fetch_recent(100).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn fts5_index_stays_in_sync_after_delete() {
        let store = make_store();
        store
            .insert("SELECT * FROM users WHERE id = 1", None, 10, 1, "success")
            .unwrap();
        store
            .insert("SELECT * FROM orders", None, 20, 3, "success")
            .unwrap();
        let entries = store.fetch_recent(10).unwrap();
        let users_entry = entries.iter().find(|e| e.query.contains("users")).unwrap();
        store.delete_entry(users_entry.id).unwrap();
        // Search for deleted entry should return nothing
        let results = store.search("users").unwrap();
        assert!(results.is_empty());
        // Other entry still searchable
        let results = store.search("orders").unwrap();
        assert_eq!(results.len(), 1);
    }
}
