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
                    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
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
                "INSERT INTO history (query, database, execution_time_ms, row_count, status)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
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
