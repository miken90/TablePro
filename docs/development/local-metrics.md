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

### Connect timings in the backend log

Opening a connection logs one `<engine> connect` line at `INFO`, so a slow
connect can be attributed without adding instrumentation after the fact:

```text
2026-08-30T02:19:15.7Z  INFO driver_postgres: postgres connect
  host=localhost port=5432 addresses=2 resolve_ms=0 connect_ms=310
  ssl_mode=prefer ok=true
```

| Field | Meaning |
|---|---|
| `addresses` | How many addresses the host resolved to. More than one means the attempts were raced (see below). |
| `resolve_ms` | Name resolution only. An address literal skips the resolver and reports `0`. |
| `connect_ms` | TCP, TLS negotiation, and authentication for the attempt that won. |

Three drivers emit it, each resolving and racing addresses itself:

| Line | Source |
|---|---|
| `postgres connect` | `driver-postgres/src/lib.rs` |
| `mysql connect` | `driver-mysql/src/lib.rs` |
| `mssql connect` | `driver-mssql/src/lib.rs` |

MongoDB and Redis have no such line: their client libraries already race the
resolved addresses themselves, so TablePro never sees the individual attempts.
MongoDB implements the same staggered race (`mongodb/src/runtime/stream.rs`,
`tcp_connect`); Redis starts every address at once via `select_ok`
(`redis/src/aio/connection.rs`, `connect_simple`). SQLite is a local file and
never opens a socket.

`addresses` is the field worth reading first. A host resolving to several
addresses where only some accept connections used to cost the operating
system's full TCP SYN timeout — about 21 s on Windows for `localhost`, which
resolves to `::1` before `127.0.0.1`. The attempts are now staggered by 250 ms
and the first to answer wins, so `connect_ms` lands near 250 ms rather than
21 000 ms when the first address is a black hole.

## metrics.jsonl

UTF-8, one JSON object per line, newest last. Every record carries:

| Field | Meaning |
|---|---|
| `v` | Schema version. Currently `1`. Bumped when a field changes meaning. |
| `ts` | ISO-8601 UTC timestamp of the write. |
| `event` | `session`, `query`, `query.paint`, or `metadata`. |

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

### `event: "metadata"`

Written once per post-connect metadata load — tables, routines, and schemas,
fetched concurrently as soon as a session has a database selected (initial
connect, or switching database). No `connectionId`, matching every other
record here.

| Field | Meaning |
|---|---|
| `engine` | Driver id, or `null` when it cannot be resolved. |
| `tablesMs` | Wall clock for `fetch_tables`. |
| `routinesMs` | Wall clock for `fetch_routines`. `null` when the driver doesn't support routines — not measured, not skipped-as-zero. |
| `schemasMs` | Wall clock for `fetch_schemas`. `null` when the driver doesn't support schemas. |
| `totalMs` | Wall clock for the whole load — tables, routines, and schemas together, since they run concurrently rather than one after another. |
| `parallel` | Always `true`. Distinguishes this record from a future sequential fallback, if one is ever reintroduced. |

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
