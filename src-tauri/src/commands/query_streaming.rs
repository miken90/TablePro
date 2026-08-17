//! Streaming variant of `execute_query`.
//!
//! Emits the result set as columnar chunks over a Tauri `Channel<QueryChunk>`
//! so the frontend can build its store incrementally and cap memory.
//!
//! Activation: caller passes `threshold: Option<usize>` — if `Some(n)` it
//! overrides the user setting; otherwise the `streaming_threshold` from
//! `AppSettings` is used. When the driver returns `<= threshold` rows the
//! whole result is sent as a single `Rows` chunk; otherwise it is split into
//! `DEFAULT_CHUNK_SIZE`-row slices.
//!
//! Spike (`plans/reports/spike-tauri-channel.md`) confirmed `Channel::send()`
//! is **synchronous and unbounded** — the producer can outrun the WebView and
//! OOM it. We self-throttle by yielding every few chunks so the Tokio runtime
//! gets a chance to drain the IPC sender side.
//!
//! Cancellation: there is no `Drop` hook on the TS-side `Channel`. The
//! frontend signals cancellation via the existing `cancel_query` command,
//! which propagates to the driver. Once the driver result is materialised,
//! losing the receiver simply causes `channel.send()` to error and we abort
//! quietly.

use std::time::Instant;

use driver_common::{ColumnData, ColumnarResult};
use driver_common::types as dc;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, ColumnInfo, QueryResult};
use crate::services::ConnectionManager;
use crate::storage::SettingsStore;

/// Row-count per `Rows` chunk above the threshold (validated by spike §1).
const DEFAULT_CHUNK_SIZE: usize = 1000;

/// Wire-level chunk emitted on the `Channel<QueryChunk>`.
///
/// All variants carry `generation` so the frontend store can drop stale
/// chunks when a newer query has superseded this one.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum QueryChunk {
    /// First message — column metadata + the driver-reported row count.
    Meta {
        columns: Vec<ColumnInfo>,
        total_estimate: usize,
        generation: u64,
    },
    /// One columnar batch of rows.
    Rows {
        idx: usize,
        chunk: ColumnarResult,
        generation: u64,
    },
    /// Final success marker.
    Done {
        rows_total: usize,
        ms: u128,
        generation: u64,
    },
    /// Final error marker (terminates stream).
    Err { message: String, generation: u64 },
}

#[tauri::command]
pub async fn execute_query_streaming(
    session_id: String,
    sql: String,
    threshold: Option<usize>,
    generation: u64,
    channel: Channel<QueryChunk>,
    manager: State<'_, Mutex<ConnectionManager>>,
    settings: State<'_, Mutex<SettingsStore>>,
) -> Result<(), String> {
    let start = Instant::now();

    // 1. Resolve threshold: explicit arg wins; else read user setting.
    let effective_threshold = match threshold {
        Some(t) => t,
        None => settings.lock().await.get().streaming_threshold,
    };

    tracing::info!(
        session = %session_id,
        gen = generation,
        threshold = effective_threshold,
        "query.streaming.start"
    );

    // 2. Run the query (mirror `commands::query::execute_query` lookup pattern).
    let result = match run_query(&manager, &session_id, &sql).await {
        Ok(r) => r,
        Err(e) => {
            let _ = channel.send(QueryChunk::Err {
                message: e.inner_message(),
                generation,
            });
            return Ok(());
        }
    };

    // 3. Send Meta first.
    let total = result.rows.len();
    if let Err(e) = channel.send(QueryChunk::Meta {
        columns: result.columns.clone(),
        total_estimate: total,
        generation,
    }) {
        return Err(format!("channel closed during Meta: {e}"));
    }

    // 4. Convert host QueryResult → driver_common ColumnarResult, then chunk.
    let columnar = host_qr_to_columnar(result);
    let chunk_size = if total > effective_threshold {
        DEFAULT_CHUNK_SIZE
    } else {
        // Single-chunk path: send everything in one batch (or one empty chunk
        // when total == 0, so the consumer code path is uniform).
        total.max(1)
    };

    let chunks = split_columnar(&columnar, chunk_size);
    let chunk_count = chunks.len();
    for (idx, chunk) in chunks.into_iter().enumerate() {
        let chunk_rows = chunk.row_count;
        if let Err(e) = channel.send(QueryChunk::Rows {
            idx,
            chunk,
            generation,
        }) {
            // Channel closed (TS dropped) — abort silently.
            tracing::debug!("streaming channel closed at chunk {idx}: {e}");
            return Ok(());
        }
        tracing::debug!(idx, rows = chunk_rows, "query.streaming.chunk");
        // Self-throttle: yield every 4 chunks (spike §1: sync send + no backpressure).
        if idx % 4 == 3 && idx + 1 < chunk_count {
            tokio::task::yield_now().await;
        }
    }

    let elapsed_ms = start.elapsed().as_millis();
    tracing::info!(
        gen = generation,
        rows_total = total,
        chunks = chunk_count,
        ms = elapsed_ms,
        "query.streaming.done"
    );
    let _ = channel.send(QueryChunk::Done {
        rows_total: total,
        ms: elapsed_ms,
        generation,
    });
    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async fn run_query(
    manager: &Mutex<ConnectionManager>,
    session_id: &str,
    sql: &str,
) -> Result<QueryResult, AppError> {
    let driver = {
        let mgr = manager.lock().await;
        mgr.get_driver(session_id)?
    };
    tracing::info!(session_id = %session_id, "execute_query_streaming: {sql}");
    driver.execute(sql).await
}

/// Convert the host `QueryResult` (from `crate::models`) to driver-common's
/// `ColumnarResult`. The two `QueryResult` types are structurally identical
/// but live in different crates, so we shuffle fields rather than depending on
/// `From`.
fn host_qr_to_columnar(qr: QueryResult) -> ColumnarResult {
    let dc_qr = dc::QueryResult {
        columns: qr
            .columns
            .into_iter()
            .map(|c| dc::ColumnInfo {
                name: c.name,
                type_name: c.type_name,
                nullable: c.nullable,
                is_primary_key: c.is_primary_key,
            })
            .collect(),
        rows: qr.rows,
        affected_rows: qr.affected_rows,
        execution_time_ms: qr.execution_time_ms,
        truncated: qr.truncated,
        total_row_count: qr.total_row_count,
    };
    dc_qr.into()
}

/// Split a `ColumnarResult` row-wise into chunks of at most `chunk_size`
/// rows. Each output chunk carries the same column metadata and only its
/// slice of values. Returns a single (possibly empty) chunk when
/// `row_count == 0` so the consumer always sees at least one `Rows` event.
fn split_columnar(src: &ColumnarResult, chunk_size: usize) -> Vec<ColumnarResult> {
    if src.row_count == 0 || chunk_size == 0 {
        return vec![empty_slice(src)];
    }
    let mut out = Vec::with_capacity(src.row_count.div_ceil(chunk_size));
    let mut start = 0usize;
    while start < src.row_count {
        let end = (start + chunk_size).min(src.row_count);
        let data = src.data.iter().map(|c| slice_column(c, start, end)).collect();
        out.push(ColumnarResult {
            columns: src.columns.clone(),
            data,
            row_count: end - start,
            // Per-chunk metadata — only meaningful on the *whole* result. Keep
            // execution_time_ms / affected_rows / truncated zeroed to avoid
            // double-counting on the consumer side.
            affected_rows: 0,
            execution_time_ms: 0.0,
            truncated: false,
            total_row_count: None,
        });
        start = end;
    }
    out
}

fn empty_slice(src: &ColumnarResult) -> ColumnarResult {
    let data = src.data.iter().map(|c| slice_column(c, 0, 0)).collect();
    ColumnarResult {
        columns: src.columns.clone(),
        data,
        row_count: 0,
        affected_rows: src.affected_rows,
        execution_time_ms: src.execution_time_ms,
        truncated: src.truncated,
        total_row_count: src.total_row_count,
    }
}

fn slice_column(c: &ColumnData, start: usize, end: usize) -> ColumnData {
    let len = end.saturating_sub(start);
    match c {
        ColumnData::Ints(v) => ColumnData::Ints(v[start..end].to_vec()),
        ColumnData::Floats(v) => ColumnData::Floats(v[start..end].to_vec()),
        ColumnData::Strings(v) => ColumnData::Strings(v[start..end].to_vec()),
        ColumnData::Bools(v) => ColumnData::Bools(v[start..end].to_vec()),
        ColumnData::Bytes(v) => ColumnData::Bytes(v[start..end].to_vec()),
        ColumnData::Json(v) => ColumnData::Json(v[start..end].to_vec()),
        ColumnData::Null(_) => ColumnData::Null(len),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use driver_common::ColumnData;
    use driver_common::types::ColumnInfo as DcColumnInfo;

    fn dc_col(name: &str) -> DcColumnInfo {
        DcColumnInfo {
            name: name.into(),
            type_name: "text".into(),
            nullable: true,
            is_primary_key: false,
        }
    }

    fn ints(n: usize) -> ColumnData {
        ColumnData::Ints((0..n as i64).map(Some).collect())
    }

    fn strings(n: usize) -> ColumnData {
        ColumnData::Strings(
            (0..n)
                .map(|i| if i % 3 == 0 { None } else { Some(format!("v{i}")) })
                .collect(),
        )
    }

    fn make(row_count: usize) -> ColumnarResult {
        ColumnarResult {
            columns: vec![dc_col("id"), dc_col("name"), dc_col("nul")],
            data: vec![
                ints(row_count),
                strings(row_count),
                ColumnData::Null(row_count),
            ],
            row_count,
            affected_rows: 0,
            execution_time_ms: 1.5,
            truncated: false,
            total_row_count: None,
        }
    }

    #[test]
    fn split_zero_rows_returns_one_empty_chunk() {
        let cr = make(0);
        let out = split_columnar(&cr, 1000);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].row_count, 0);
        assert_eq!(out[0].columns.len(), 3);
        assert_eq!(out[0].data.len(), 3);
        for d in &out[0].data {
            assert_eq!(d.len(), 0);
        }
    }

    #[test]
    fn split_below_chunk_size_returns_one_chunk() {
        let cr = make(250);
        let out = split_columnar(&cr, 1000);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].row_count, 250);
        assert_eq!(out[0].data[0].len(), 250);
    }

    #[test]
    fn split_at_boundary_count() {
        let cr = make(2500);
        let out = split_columnar(&cr, 1000);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].row_count, 1000);
        assert_eq!(out[1].row_count, 1000);
        assert_eq!(out[2].row_count, 500);
        // total preserved
        let sum: usize = out.iter().map(|c| c.row_count).sum();
        assert_eq!(sum, 2500);
    }

    #[test]
    fn split_preserves_column_count_and_metadata() {
        let cr = make(1500);
        let out = split_columnar(&cr, 500);
        assert_eq!(out.len(), 3);
        for chunk in &out {
            assert_eq!(chunk.columns.len(), 3);
            assert_eq!(chunk.columns[0].name, "id");
            assert_eq!(chunk.columns[1].name, "name");
            assert_eq!(chunk.columns[2].name, "nul");
            assert_eq!(chunk.data.len(), 3);
            assert!(matches!(chunk.data[0], ColumnData::Ints(_)));
            assert!(matches!(chunk.data[1], ColumnData::Strings(_)));
            assert!(matches!(chunk.data[2], ColumnData::Null(_)));
        }
    }

    #[test]
    fn slice_column_null_variant() {
        let c = ColumnData::Null(5);
        let s = slice_column(&c, 1, 3);
        assert!(matches!(s, ColumnData::Null(2)));
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn slice_column_strings_preserves_options() {
        let c = ColumnData::Strings(vec![
            Some("a".into()),
            None,
            Some("c".into()),
            None,
            Some("e".into()),
        ]);
        let s = slice_column(&c, 1, 4);
        match s {
            ColumnData::Strings(v) => {
                assert_eq!(v.len(), 3);
                assert_eq!(v[0], None);
                assert_eq!(v[1], Some("c".into()));
                assert_eq!(v[2], None);
            }
            other => panic!("expected Strings, got {other:?}"),
        }
    }

    #[test]
    fn split_values_match_source_after_concat() {
        let cr = make(2500);
        let out = split_columnar(&cr, 1000);
        // Reassemble Ints column from chunks and compare to original.
        let mut joined: Vec<Option<i64>> = Vec::new();
        for chunk in &out {
            match &chunk.data[0] {
                ColumnData::Ints(v) => joined.extend(v.iter().copied()),
                other => panic!("expected Ints, got {other:?}"),
            }
        }
        match &cr.data[0] {
            ColumnData::Ints(orig) => assert_eq!(&joined, orig),
            _ => unreachable!(),
        }
    }

    /// Synthetic 1M-row chunker memory/throughput probe.
    /// Run with:
    ///   cargo test -p tablepro-windows bench_chunker_1m_rows -- --ignored --nocapture
    #[test]
    #[ignore]
    fn bench_chunker_1m_rows() {
        let cr = make(1_000_000);
        let t = std::time::Instant::now();
        let chunks = split_columnar(&cr, 1000);
        eprintln!(
            "split 1M rows / 1K chunk_size in {:?} → {} chunks",
            t.elapsed(),
            chunks.len()
        );
        assert_eq!(chunks.len(), 1000);
        let sum: usize = chunks.iter().map(|c| c.row_count).sum();
        assert_eq!(sum, 1_000_000);
    }
}
