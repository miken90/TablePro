# Local metrics and logs

Files the app writes about itself, on the machine it runs on. Nothing is
uploaded: there is no network call, no service, and no SDK involved in any of
this. The app has no telemetry and none of it is being added here — these are
local diagnostic files the user can read, delete, or hand over.

## Where the files live

| File | What |
|---|---|
| `%LOCALAPPDATA%\TablePro\logs\tablepro.<YYYY-MM-DD>.log` | Backend `tracing` output. Daily rotation, 7 files kept (`services/app_logging.rs`). |
| `%LOCALAPPDATA%\TablePro\logs\metrics.jsonl` | One JSON object per line, described below. Rotates at 8 MiB with one backup (`metrics.jsonl.1`). |
| `%APPDATA%\TablePro\renderer-errors.log` | Uncaught renderer errors and rejections. Rotates at 1 MiB with one backup. |
| `%LOCALAPPDATA%\TablePro\crashes\` | Rust panic records (`services/crash_handler.rs`). |

Settings → Diagnostics has an **Open Log Folder** button that reveals the
`logs` directory in Explorer.

Release builds set `windows_subsystem = "windows"`, so the process has no
console. The file layer is what makes backend logs exist at all in a shipped
build; stderr is only added in debug builds. `RUST_LOG` still overrides the
`info` default in both.

## metrics.jsonl

UTF-8, one JSON object per line, newest last. Every record carries:

| Field | Meaning |
|---|---|
| `v` | Schema version. Currently `1`. Bumped when a field changes meaning. |
| `ts` | ISO-8601 UTC timestamp of the write. |
| `event` | `session`, `query`, or `query.paint`. |

Source: `src/metrics/local-metrics.ts` (record assembly),
`src-tauri/src/commands/metrics.rs` (append + rotation).

### `event: "session"`

Written once per app start, on the second animation frame after the React
root renders.

| Field | Meaning |
|---|---|
| `appVersion` | Version string from `package.json` (`__APP_VERSION__`). |
| `startupMs` | Milliseconds from document navigation start to the first painted frame after the root rendered. |
| `jsHeapMb` | `performance.memory.usedJSHeapSize` in MiB. Omitted where the engine does not expose it. |

### `event: "query"`

Written once per query execution, on the terminal chunk.

| Field | Meaning |
|---|---|
| `status` | `ok`, `error`, or `cancelled`. |
| `gen` | Stream generation. Unique per run within a session; joins this record to its `query.paint`. |
| `engine` | Driver id (`postgres`, `mysql`, `mssql`, `sqlite`, `mongodb`, `redis`), or `null` when the connection cannot be resolved. |
| `rows` | Rows in the store — after any cap. |
| `cols` | Column count. |
| `chunks` | `rows` chunks received on the channel. |
| `bytes` | **Estimated** serialized payload size, extrapolated from `bytesSampled` rows. Not a measurement of the actual IPC payload. |
| `bytesSampled` | Rows the estimate was computed from (at most 100). |
| `backendMs` | `ms` from the backend's `done` chunk: driver execution plus chunking, measured in Rust. `null` on cancel. |
| `totalMs` | Wall clock from dispatch to the store commit, measured on the UI thread. `totalMs - backendMs` is the IPC + deserialize + materialize cost. |
| `materializeMs` | Duration of the synchronous `materializeStringRows` pass over the whole result. `null` when there was no result. |
| `truncated` | Whether rows were dropped. |
| `truncatedBy` | `backend` (the `store_max_rows` cap in `execute_query_streaming`), `store` (the frontend store's own cap), or `null`. |
| `totalRows` | Rows the driver produced before any cap. Equals `rows` when `truncated` is false. |
| `tabs` | Open editor tabs at the time of the record. |
| `connections` | Known connections at the time of the record. |
| `jsHeapMb` | As above. Omitted where unavailable. |
| `error` | First 500 characters of the error message. Present only when `status` is `error`. |
| `overheadMs` | Time spent assembling this record, excluding the IPC write. This is the instrumentation measuring itself. |

### `event: "query.paint"`

Written one animation frame after a successful query commits its result, i.e.
after the frame that painted it.

| Field | Meaning |
|---|---|
| `gen` | Matches the `query` record for the same run. |
| `firstPaintMs` | Wall clock from dispatch to that frame. |

Split from the `query` record because the value cannot be known until a frame
later, and holding the whole record back would delay every other field.

## Keeping the cost low

- One IPC call per query and one per session — never per chunk or per row.
- The payload estimate samples at most 100 rows instead of walking the result.
- Writes are fire-and-forget; a failed write is swallowed and cannot fail a
  query.
- The backend rejects records over 8 KiB and records containing a newline, so
  a caller bug cannot bloat the file or make it unparseable.
- `overheadMs` records the assembly cost in the data itself, so a regression
  in the instrumentation shows up without a separate benchmark.

## Reading the data

Every line is standalone JSON, so ordinary tools work:

```powershell
Get-Content "$env:LOCALAPPDATA\TablePro\logs\metrics.jsonl" |
  ConvertFrom-Json |
  Where-Object { $_.event -eq 'query' } |
  Sort-Object totalMs -Descending |
  Select-Object -First 10 ts, engine, rows, backendMs, totalMs, materializeMs
```
