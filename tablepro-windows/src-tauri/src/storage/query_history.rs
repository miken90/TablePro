//! Query history with SQLite FTS5 full-text search.

use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub query: String,
    pub database: String,
    pub connection_name: String,
    pub execution_time_ms: f64,
    pub row_count: i64,
    pub timestamp: String,
    pub status: String,
}

pub struct QueryHistoryStorage {
    db_path: PathBuf,
}

impl QueryHistoryStorage {
    pub fn new() -> Self {
        let dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("TablePro");
        fs::create_dir_all(&dir).ok();
        let db_path = dir.join("query_history.sqlite3");

        let storage = Self { db_path };
        storage.init_db().ok();
        storage
    }

    fn open(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|e| format!("Failed to open history DB: {e}"))
    }

    fn init_db(&self) -> Result<(), String> {
        let conn = self.open()?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS queries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                database TEXT NOT NULL DEFAULT '',
                connection_name TEXT NOT NULL DEFAULT '',
                execution_time_ms REAL NOT NULL DEFAULT 0,
                row_count INTEGER NOT NULL DEFAULT 0,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'success'
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS queries_fts USING fts5(
                query,
                content='queries',
                content_rowid='id'
            );

            CREATE TRIGGER IF NOT EXISTS queries_ai AFTER INSERT ON queries BEGIN
                INSERT INTO queries_fts(rowid, query) VALUES (new.id, new.query);
            END;

            CREATE TRIGGER IF NOT EXISTS queries_ad AFTER DELETE ON queries BEGIN
                INSERT INTO queries_fts(queries_fts, rowid, query) VALUES ('delete', old.id, old.query);
            END;

            CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON queries(timestamp DESC);",
        )
        .map_err(|e| format!("Failed to init history DB: {e}"))
    }

    pub fn save_query(
        &self,
        query: &str,
        database: &str,
        connection_name: &str,
        execution_time_ms: f64,
        row_count: i64,
        status: &str,
    ) -> Result<(), String> {
        let conn = self.open()?;
        let timestamp = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO queries (query, database, connection_name, execution_time_ms, row_count, timestamp, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![query, database, connection_name, execution_time_ms, row_count, timestamp, status],
        )
        .map_err(|e| format!("Failed to save query: {e}"))?;
        Ok(())
    }

    pub fn search_history(
        &self,
        search_text: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<HistoryEntry>, String> {
        let conn = self.open()?;

        if search_text.trim().is_empty() {
            return self.get_recent_queries(limit);
        }

        let fts_query = search_text
            .split_whitespace()
            .map(|w| format!("\"{}\"", w.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" ");

        let mut stmt = conn
            .prepare(
                "SELECT q.id, q.query, q.database, q.connection_name,
                        q.execution_time_ms, q.row_count, q.timestamp, q.status
                 FROM queries q
                 JOIN queries_fts f ON q.id = f.rowid
                 WHERE queries_fts MATCH ?1
                 ORDER BY q.timestamp DESC
                 LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let entries = stmt
            .query_map(params![fts_query, limit, offset], |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    query: row.get(1)?,
                    database: row.get(2)?,
                    connection_name: row.get(3)?,
                    execution_time_ms: row.get(4)?,
                    row_count: row.get(5)?,
                    timestamp: row.get(6)?,
                    status: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query error: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(entries)
    }

    pub fn get_recent_queries(&self, limit: i64) -> Result<Vec<HistoryEntry>, String> {
        let conn = self.open()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, query, database, connection_name,
                        execution_time_ms, row_count, timestamp, status
                 FROM queries
                 ORDER BY timestamp DESC
                 LIMIT ?1",
            )
            .map_err(|e| format!("Query error: {e}"))?;

        let entries = stmt
            .query_map(params![limit], |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    query: row.get(1)?,
                    database: row.get(2)?,
                    connection_name: row.get(3)?,
                    execution_time_ms: row.get(4)?,
                    row_count: row.get(5)?,
                    timestamp: row.get(6)?,
                    status: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query error: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(entries)
    }

    pub fn delete_entry(&self, id: i64) -> Result<(), String> {
        let conn = self.open()?;
        conn.execute("DELETE FROM queries WHERE id = ?1", params![id])
            .map_err(|e| format!("Delete error: {e}"))?;
        Ok(())
    }

    pub fn clear_history(&self) -> Result<(), String> {
        let conn = self.open()?;
        conn.execute_batch(
            "DELETE FROM queries;
             INSERT INTO queries_fts(queries_fts) VALUES ('delete-all');",
        )
        .map_err(|e| format!("Clear error: {e}"))?;
        Ok(())
    }
}
