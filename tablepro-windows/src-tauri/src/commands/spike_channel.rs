//! Phase 2 spike: validate Tauri v2 `Channel<T>` streaming pattern.
//!
//! Synthesizes rows in Rust and streams chunks via `Channel<SpikeChunk>` to TS.
//! Throwaway code — scheduled for deletion after Phase 2 fan-out completes.

use serde::Serialize;
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(tag = "kind")]
pub enum SpikeChunk {
    Meta { total_estimate: usize },
    Rows { idx: usize, rows: Vec<Vec<String>> },
    Done { rows_total: usize, ms: u128 },
}

#[tauri::command]
pub async fn spike_stream(
    channel: Channel<SpikeChunk>,
    total_rows: usize,
    chunk_size: usize,
) -> Result<(), String> {
    if chunk_size == 0 {
        return Err("chunk_size must be > 0".to_string());
    }
    let start = std::time::Instant::now();
    channel
        .send(SpikeChunk::Meta {
            total_estimate: total_rows,
        })
        .map_err(|e| e.to_string())?;

    let mut emitted = 0usize;
    let mut idx = 0usize;
    while emitted < total_rows {
        let n = (total_rows - emitted).min(chunk_size);
        // synthetic 5-col rows of ~120-byte payload
        let rows: Vec<Vec<String>> = (0..n)
            .map(|i| {
                let r = emitted + i;
                vec![
                    r.to_string(),
                    format!("name-{r}"),
                    format!("email-{r}@example.com"),
                    "lorem ipsum dolor sit amet consectetur".to_string(),
                    format!("{}", r as f64 * 1.234),
                ]
            })
            .collect();
        channel
            .send(SpikeChunk::Rows { idx, rows })
            .map_err(|e| e.to_string())?;
        emitted += n;
        idx += 1;
        // yield occasionally so cancellation can take effect
        if idx.is_multiple_of(8) {
            tokio::task::yield_now().await;
        }
    }

    channel
        .send(SpikeChunk::Done {
            rows_total: emitted,
            ms: start.elapsed().as_millis(),
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}
