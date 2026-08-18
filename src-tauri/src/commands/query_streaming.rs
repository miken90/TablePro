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
//! losing the receiver causes `channel.send()` to error; the command then
//! fails rather than returning `Ok`, because the caller waits for a terminal
//! `Done`/`Err` chunk and a broken channel can no longer deliver one.

use std::time::Instant;

use driver_common::{ColumnData, ColumnarResult};
use driver_common::types as dc;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::Mutex;

use crate::models::{AppError, ColumnInfo, QueryResult};
use crate::services::ConnectionManager;
use crate::storage::settings_store::{STORE_MAX_ROWS_MAX, STORE_MAX_ROWS_MIN};
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
    ///
    /// `rows_total` is what was actually delivered on this channel;
    /// `total_rows` is what the driver produced before the row cap. They
    /// differ only when `truncated` is true.
    Done {
        rows_total: usize,
        ms: u128,
        generation: u64,
        truncated: bool,
        total_rows: usize,
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
    let mut result = match run_query(&manager, &session_id, &sql).await {
        Ok(r) => r,
        Err(e) => {
            channel
                .send(QueryChunk::Err {
                    message: e.inner_message(),
                    generation,
                })
                .map_err(|send_err| format!("channel closed during Err: {send_err}"))?;
            return Ok(());
        }
    };

    // 3. Cap the result before anything copies it.
    //
    // The frontend store keeps at most `store_max_rows` rows and drops the
    // rest, so every row past that point is materialised three times in Rust
    // (row-major result, columnar copy, per-chunk slices), serialised across
    // IPC and deserialised by the WebView only to be thrown away. With
    // `panic = "abort"` an allocation failure on that path kills the process.
    let max_rows = effective_row_cap(&settings).await;
    let total_rows = apply_row_cap(&mut result, max_rows);
    let truncated = result.truncated;
    if truncated {
        tracing::warn!(
            session = %session_id,
            gen = generation,
            total_rows,
            max = max_rows,
            "query.streaming.truncated"
        );
    }

    // 4. Send Meta first. `total_estimate` carries the pre-cap count so the
    // truncation banner can report the real size of the result.
    let total = result.rows.len();
    if let Err(e) = channel.send(QueryChunk::Meta {
        columns: result.columns.clone(),
        total_estimate: total_rows,
        generation,
    }) {
        return Err(format!("channel closed during Meta: {e}"));
    }

    // 5. Convert host QueryResult → driver_common ColumnarResult, then chunk.
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
            // Channel closed (TS dropped). Report it: the caller waits for a
            // terminal chunk that can no longer be delivered on this channel,
            // and a rejected command is the only remaining way to tell it the
            // stream is over.
            tracing::debug!("streaming channel closed at chunk {idx}: {e}");
            return Err(format!("channel closed at chunk {idx}: {e}"));
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
        total_rows,
        truncated,
        chunks = chunk_count,
        ms = elapsed_ms,
        "query.streaming.done"
    );
    channel
        .send(QueryChunk::Done {
            rows_total: total,
            ms: elapsed_ms,
            generation,
            truncated,
            total_rows,
        })
        .map_err(|e| format!("channel closed during Done: {e}"))?;
    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Resolve the hard row cap for one streaming run.
///
/// Source: the user's `store_max_rows` setting — the same number the frontend
/// store uses to decide what it will keep. Using the legacy
/// `query::MAX_RESULT_ROWS` (50_000) instead would silently deliver less than
/// the 100_000 rows the user configured. The value is clamped to the range
/// `set_settings` already enforces so a hand-edited settings file cannot
/// remove the bound.
async fn effective_row_cap(settings: &Mutex<SettingsStore>) -> usize {
    settings
        .lock()
        .await
        .get()
        .store_max_rows
        .clamp(STORE_MAX_ROWS_MIN, STORE_MAX_ROWS_MAX)
}

/// Truncate `result` to at most `max_rows` rows, recording the pre-cap count.
/// Returns the number of rows the driver actually produced.
fn apply_row_cap(result: &mut QueryResult, max_rows: usize) -> usize {
    let total_rows = result.rows.len();
    if total_rows > max_rows {
        result.rows.truncate(max_rows);
        result.truncated = true;
        result.total_row_count = Some(total_rows);
    }
    total_rows
}

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

    fn host_result(rows: usize) -> QueryResult {
        QueryResult {
            columns: vec![ColumnInfo {
                name: "id".into(),
                type_name: "int8".into(),
                nullable: false,
                is_primary_key: true,
            }],
            rows: (0..rows).map(|i| vec![Some(i.to_string())]).collect(),
            affected_rows: 0,
            execution_time_ms: 0.0,
            truncated: false,
            total_row_count: None,
        }
    }

    #[test]
    fn row_cap_truncates_and_records_true_total() {
        let mut r = host_result(1_500);
        let total = apply_row_cap(&mut r, 1_000);
        assert_eq!(total, 1_500);
        assert_eq!(r.rows.len(), 1_000);
        assert!(r.truncated);
        assert_eq!(r.total_row_count, Some(1_500));
    }

    /// Control: a result inside the cap must come through untouched, so a
    /// cap that fires unconditionally fails this test.
    #[test]
    fn row_cap_leaves_small_results_alone() {
        let mut r = host_result(999);
        let total = apply_row_cap(&mut r, 1_000);
        assert_eq!(total, 999);
        assert_eq!(r.rows.len(), 999);
        assert!(!r.truncated);
        assert_eq!(r.total_row_count, None);
    }

    #[test]
    fn row_cap_at_exact_boundary_does_not_truncate() {
        let mut r = host_result(1_000);
        apply_row_cap(&mut r, 1_000);
        assert_eq!(r.rows.len(), 1_000);
        assert!(!r.truncated);
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
