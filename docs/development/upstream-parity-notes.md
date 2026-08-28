# Upstream parity notes

This document captures bugfix knowledge from upstream `datlechin/TablePro`
(macOS Swift/AppKit) before this fork permanently detaches from it. Upstream
code can never merge into this Tauri/Rust/TypeScript Windows port, but its bug
history describes invariants a query/connection/grid engine must hold
regardless of platform — invariants this port likely needs too.

Upstream refs below are provenance only. Once detached, those SHAs are
unreachable from this repo and cannot be looked up here again. **These are
re-implementation targets, never merge targets.**

## Confirmed present in this codebase

Verified by direct code reading, not inferred from upstream history.

1. **`cancel_query` is a no-op on 5 of 6 drivers.** `commands/query.rs:335-344`
   (`cancel_query` tauri command) delegates to `driver.cancel_query()`.
   Returns `DriverError::Unsupported` in:
   `driver-postgres/src/lib.rs:163-168`,
   `driver-mysql/src/lib.rs:140-146`,
   `driver-mssql/src/lib.rs:193-197`,
   `driver-mongodb/src/lib.rs:204-208`,
   `driver-redis/src/lib.rs:238-242`.
   Only `driver-sqlite/src/lib.rs:158+` implements a real cancel (mutex-guarded
   `interrupt()`). The Cancel affordance in the UI does nothing on PostgreSQL
   and MySQL — two of the three daily engines.

2. **PostgreSQL partitioned tables are listed more than once.**
   `driver-postgres/src/ops_schema.rs:7-32` (`fetch_tables`) queries
   `information_schema.tables` filtering only `table_schema NOT IN
   ('pg_catalog','information_schema')`. No `relispartition` or `pg_inherits`
   check. A partitioned table's parent and each of its partitions all satisfy
   this filter independently and each surfaces as its own top-level table row.

3. **Export pagination is not dialect-aware.** `commands/export.rs:110` reads
   `driver_type` from the driver but never branches on it for pagination SQL.
   Line 114 hardcodes `SELECT COUNT(*) FROM (…) AS _export_count` and line 170
   hardcodes `SELECT * FROM (…) LIMIT {CHUNK_SIZE} OFFSET {offset}`. Both are
   invalid T-SQL — MSSQL needs `OFFSET … FETCH NEXT` with an `ORDER BY`, no
   `LIMIT` keyword. `driver-capabilities/driver-mssql.capabilities.json`
   declares `"supportsImportExport": true`, and `export_to_file` never checks
   capabilities before running — so this is reachable, not just theoretical.
   MongoDB/Redis are excluded via `supportsImportExport: false` in their own
   sidecars, so they don't hit this path.

4. **D1 — the Inspector keyboard shortcut was dead in packaged builds, and
   this fork caused it, not upstream.** `src/main.tsx:14-21` installs a
   `document`-level `keydown` listener under `import.meta.env.PROD` that
   calls `preventDefault()` on `F12` and `Ctrl+Shift+I/J/C`, to block
   DevTools — that part is a deliberate, unchanged product decision. The UI
   rebuild's blueprint (`docs/design/tablepro-rebuild/design-spec.md` §8.3)
   predicted this correctly at the time it was written. But the
   `260828-1409-ui-rebuild-implementation` plan's own phase 5 file
   *re-diagnosed* it as "very likely a documentation defect" — reasoning that
   the window-level dispatcher (`useMainLayoutShortcuts.ts`) never checked
   `defaultPrevented`, so the `document` blocker's `preventDefault()` couldn't
   stop it. That reasoning was correct **only** against the codebase as it
   stood before this rebuild's own phase 2: commit `451cf297` (end of phase
   1) has zero occurrences of `defaultPrevented` in
   `useMainLayoutShortcuts.ts`. Phase 2 (the canonical component kit) added
   the `defaultPrevented` guard at `useMainLayoutShortcuts.ts:103` as part of
   RT-9 (keeping a kit dialog's own Esc handling from also firing
   `editor.cancel`). That guard is correct for its own purpose, but it has a
   side effect nobody re-checked against the PROD devtools blocker: a keydown
   bubbles target → … → `document` → `window`, so the `document`-level
   blocker always runs first, and by the time the `window`-level dispatcher
   runs, `e.defaultPrevented` is already `true` for any binding on I, J, or
   C — killing the Inspector shortcut specifically, and any *other* command
   that might ever be bound to one of those three keys. **This fork's own
   phase 2 introduced the regression the blueprint had predicted for a
   different reason, and the implementation plan's own re-diagnosis got the
   cause wrong** (it assumed the guard didn't exist, when by phase 5 it
   already did). Fixed in the `260828-1409-ui-rebuild-implementation` D1
   follow-up: `nav.toggleInspector` rebound to `Ctrl+Shift+O`
   (`useCommandRegistry.ts`) — the blocker itself was deliberately left
   untouched, since narrowing what it blocks is a separate product decision.
   `src/__tests__/inspector-shortcut-dispatch.test.ts` locks the ordering
   argument in jsdom (a `document` listener always precedes a `window`
   listener for the same bubbling event) so this class of regression fails a
   test instead of shipping again.

## Query execution & cancellation

### Report a failed query instead of settling its claim first
- **Behavior/invariant:** when a query execution fails, the failure must be
  reported to the caller/UI before (or instead of) marking the execution's
  claim/slot as successfully settled. A failed run must not look like a
  completed one to whatever tracks "this tab's active execution."
- **Failure symptom:** UI shows a stale "still running" or silently-empty
  result instead of the actual error; a later action may believe the slot is
  free to reuse when it wasn't properly closed out.
- **Where to check:** `src/stores/queryStore.ts:216-267` (`runQuery`) — error
  path sets `streamErr` and appends an `err` chunk, but is worth an explicit
  audit for ordering vs. `activeStreamCancel` slot-clearing at line 259 to
  confirm failure is visible before the slot is freed.
- **Upstream ref:** `03742097`

### Carry a cancelled navigation into the schema column fetch it started
- **Behavior/invariant:** if the user navigates away (changes table/tab) while
  a schema-column fetch triggered by that navigation is in flight, the fetch
  must observe the cancellation and not apply its result to the new context.
- **Failure symptom:** columns from a stale navigation appear on the newly
  selected table.
- **Where to check:** `src/stores/schemaStore.ts` `fetchColumns` (around
  line 121) — no visible cancellation/token check against the currently
  selected table when the fetch resolves. `src/components/grid/hooks/
  use-table-data.ts:139` (`fetchSeqRef`) shows the pattern this *should* use;
  schemaStore does not appear to use an equivalent guard.
- **Upstream ref:** `3104bab7`

### Stop a stale waiter withdrawal cancelling the fetch that replaced it
- **Behavior/invariant:** withdrawing an old, superseded "waiter" for a
  resource must not cancel a newer, still-relevant fetch for the same
  resource that took its place.
- **Failure symptom:** a fresh fetch silently dies because an unrelated old
  request's cleanup path cancelled it by mistake (shared cancel token/slot
  reused across unrelated requests).
- **Where to check:** `src/stores/schemaStore.ts` (column fetch caching,
  around line 134 "Skip if already cached") — no obvious per-request token;
  worth confirming concurrent fetches for the same table don't cross-cancel.
- **Upstream ref:** `034f4197`

### Give each tab its own row count task so one cannot orphan another
- **Behavior/invariant:** row-count fetches must be scoped per tab; starting
  one tab's row-count task must not clear or supersede another tab's.
- **Failure symptom:** switching tabs mid-fetch shows the wrong row count, or
  a tab's count silently reverts to blank because another tab's task cleared
  a shared handle.
- **Where to check:** `src/components/grid/hooks/use-table-data.ts:105-172` —
  **this one is per-tab already**, state lives in `useTableDataStore` keyed by
  `activeTabId` (`table-data-store.ts`) and uses a local `fetchSeqRef` guard.
  Looks structurally sound; re-verify if row-count logic is ever refactored to
  share state across tabs.
- **Upstream ref:** `a4f8f169`

### Give each tab ownership of its execution so a retarget cannot be overwritten
- **Behavior/invariant:** each tab's query execution must be independently
  owned; starting execution in one tab must not cancel or overwrite another
  tab's in-flight execution.
- **Failure symptom:** running a query in tab B silently kills tab A's
  still-running query.
- **Where to check:** `src/stores/queryStore.ts:151-152` — `streamGeneration`
  and `activeStreamCancel` are **module-level singletons, not per-tab**. Line
  191, `activeStreamCancel?.()`, unconditionally cancels whatever was
  in-flight — from any tab — before starting a new run. **This looks like a
  live analog of the upstream bug**, not just a hygiene gap: starting a query
  in one editor tab currently cancels an in-flight query in a different tab.
- **Upstream ref:** `d99458bb`

## Type decoding & value handling

### Quote filter values by the column's declared type
- **Behavior/invariant:** when building a filter/WHERE value literal, quoting
  must follow the column's declared database type, not the JS/TS runtime
  representation of the value that happened to come back.
- **Failure symptom:** numeric/boolean/date filter values get wrapped in
  string quotes (or vice versa), producing a type-mismatch error or a filter
  that silently matches nothing.
- **Where to check:** `src/utils/filter-parser.ts:100-171` — quick-search
  filters use parameterized `?` placeholders (binding, not string
  interpolation), which structurally avoids this bug class for that path.
  `src-tauri/src/services/sql_generator.rs:114-125` (`sql_literal`) branches
  on the Rust `Value` enum variant of the decoded cell value, used by grid
  cell-edit/bulk-update SQL generation — correctness there depends on the
  driver's row decoding mapping DB column type to the right `Value` variant;
  worth an explicit audit, not confirmed broken.
- **Upstream ref:** `74a1f541`

### Synchronize the driver adapter's shared column type cache
- **Behavior/invariant:** a column-type cache shared across concurrent
  operations must be synchronized; concurrent readers/writers must not see a
  torn or stale entry.
- **Failure symptom:** intermittent wrong-type rendering/quoting under
  concurrent load (e.g. two tabs querying the same table at once).
- **Where to check:** `no obvious analog found` — Windows port has no shared
  cross-connection column-type cache analogous to upstream's
  `PluginDriverAdapter`; each driver call reads schema fresh via its own
  connection. Likely lower risk here structurally, but not verified under
  concurrency.
- **Upstream ref:** `98ff008e`

### Render timestamp and nested column types the value API cannot decode
- **Behavior/invariant:** values whose type the driver's generic decode path
  cannot represent (timestamps, nested/array/JSON types) must still render
  something sane instead of crashing or showing a decode error inline.
- **Failure symptom:** cells for timestamp/JSON/array columns show garbage,
  blank, or an error string instead of a readable value.
- **Where to check:** `src/components/DataGrid/columnar-render.ts` — the
  columnar cell-rendering path; also `driver-postgres/src/ops_query.rs` /
  `ops_schema.rs` for how PostgreSQL `timestamp`/`jsonb`/array types get
  converted to wire values. This fix is DuckDB-plugin-specific upstream
  (`DuckDBTypeRendering.swift`); the underlying "value API can't decode this
  type" class is platform-neutral and worth checking for Postgres `jsonb`,
  arrays, and `timestamptz`.
- **Upstream ref:** `a48656e2`

## Query history & quick switcher

### Select the best match when the query changes
- **Behavior/invariant:** the quick switcher's highlighted/selected item must
  track the current best-scored match as the user types, not a stale index
  from before the query changed.
- **Failure symptom:** pressing Enter after typing selects a leftover item
  from an earlier keystroke, not what's visually top-ranked.
- **Where to check:** `src/components/layout/quick-switcher.tsx:148-153` —
  **already implemented**: `cursor` resets to `0` on every `query` change
  (useEffect keyed on `[query]`), and results are sorted score-descending
  (line ~230), so index 0 is always the best match after a keystroke.
- **Upstream ref:** `e3be28ad`

### Make query history "Load in Editor" and "Run in New Tab" work
- **Behavior/invariant:** history entries must support at least two distinct
  actions — load into the current editor without running, and open in a new
  tab and run — and both must actually do what they say.
- **Failure symptom:** one of the two actions is missing, a no-op, or does the
  other action's behavior instead.
- **Where to check:** `src/components/history/HistoryPanel.tsx:6-9` — only a
  single `onSelectQuery(query: string)` callback exists; there is no second
  "run in new tab" action wired from the history panel. Gap confirmed at the
  component-contract level, not just an internal bug.
- **Upstream ref:** `7f9adefc`

### Stop the query history drawer refetching while it is closed
- **Behavior/invariant:** a closed history panel/drawer must not keep issuing
  background refetches.
- **Failure symptom:** wasted backend calls / DB load from a UI element the
  user can't even see.
- **Where to check:** `src/components/layout/ConnectedLayout.tsx:301-316` —
  **already implemented**: `HistoryPanel` is conditionally rendered
  (`{historyVisible && isConnected && (...)}`), so it fully unmounts on close
  and its `fetchRecent()` mount-effect (`HistoryPanel.tsx:23-25`) cannot fire
  while closed. Satisfied by construction, not by an explicit "is open" guard.
- **Upstream ref:** `693ba184`

### Say when the query history store cannot be opened
- **Behavior/invariant:** if the history store fails to open/query, the user
  must see that it failed, not a silently-empty history list.
- **Failure symptom:** history panel shows "no history" indistinguishable from
  "history store is broken" — user can't tell if they have no history or a
  bug is hiding it.
- **Where to check:** `src/stores/history.ts:29-47` (`fetchRecent`, `search`)
  — **confirmed gap**: both swallow the error (`catch { set({ isLoading:
  false }) }`), never setting an error field or surfacing anything to the UI.
  `HistoryPanel.tsx` has no error-state rendering path either.
- **Upstream ref:** `d1922b2f`

## Connection lifecycle

### Unwrap optional session.driver in metadata pool
- **Behavior/invariant:** code that reads a session's driver handle for
  metadata operations must not force-unwrap an optional that can legitimately
  be absent (e.g. mid-disconnect).
- **Failure symptom:** crash when metadata is requested for a session whose
  driver handle just went away.
- **Where to check:** `likely N/A for this architecture` — Rust's type system
  makes this failure class structurally hard to hit the Swift way.
  `src-tauri/src/services/connection_manager.rs:107-112` (`get_driver`)
  returns `Result<Arc<dyn DatabaseDriver>, AppError>` via `.ok_or(...)`, no
  force-unwrap possible; a missing driver is a normal `Err(AppError::
  NotConnected)`, not a panic. Worth a sweep for `.unwrap()`/`.expect()` on
  driver lookups elsewhere, but the primary metadata-pool equivalent is safe.
- **Upstream ref:** `8eb57f32`

### Keep the connection window usable when a connect fails
- **Behavior/invariant:** a failed connection attempt must leave the
  connect UI in a usable, retryable state — not locked, blank, or stuck
  mid-spinner.
- **Failure symptom:** after a failed connect attempt, the dialog/form is
  unresponsive or requires a restart to try again.
- **Where to check:** `src/stores/connectionStore.ts:80-114` (`connect`) sets
  status to `"error"` and rethrows on failure — caller-dependent. Check the
  callers: `src/components/connection/ConnectionForm.tsx`,
  `src/components/connection/WelcomeView.tsx` for whether they reset a
  loading/disabled state in their catch handlers.
- **Upstream ref:** `f4c9aa11`

### Make the connections strip's close command close the connection
- **Behavior/invariant:** the UI "close" affordance for a connection must
  actually disconnect the backend session, not just hide UI.
- **Failure symptom:** connection appears closed in the UI but the backend
  session/socket stays open (resource leak, stale session reused later).
- **Where to check:** `src/stores/connectionStore.ts:118-135` (`disconnect`)
  does correctly call `commands.disconnect(sessionId)` before clearing local
  state. Check that every close-affordance in the UI (`Toolbar.tsx`,
  `connection-status-indicator.tsx`, `StatusBar.tsx` — all reference
  `disconnect`) actually calls this store action rather than only clearing
  local/UI state.
- **Upstream ref:** `380c29d5`

### Give every window of a connection its own tabs on reconnect
- **Behavior/invariant:** each open window bound to the same connection keeps
  its own independent tab set across a reconnect.
- **Failure symptom (upstream):** reconnecting a connection open in multiple
  windows merges or duplicates tabs across those windows.
- **Where to check:** `likely N/A for this architecture` — Tauri config
  (`src-tauri/tauri.conf.json:14-17`) declares a single `"main"` window and no
  window-creation code (`WebviewWindowBuilder`/`create_window`) exists
  anywhere in `src-tauri/src`. There is no "multiple windows per connection"
  concept in this port to have this bug.
- **Upstream ref:** `34edbe2c`

## Pagination & row counts

### Stop an unknown row count blanking the estimate already on screen
- **Behavior/invariant:** when a fresh row-count fetch fails or returns
  unknown, the UI must keep showing the last-known good estimate, not blank
  it to zero/unknown.
- **Failure symptom:** row count flickers to 0 or disappears every time a
  count query is slow/fails, even though the actual data grid still has valid
  rows on screen.
- **Where to check:** `src/components/grid/hooks/use-table-data.ts:155-160` —
  **confirmed live analog**: `count` is initialized to `0`, the
  `fetchCountFiltered` call is wrapped in `try { count = await ... } catch { /*
  ignore */ }`, and then unconditionally `setTotalCount(typeof count ===
  'number' ? count : 0)` runs regardless of whether the fetch actually
  succeeded. A failed count fetch silently blanks the total to 0 even though
  the row fetch on the same call succeeded and real rows are showing.
- **Upstream ref:** `25177e4a`

### Token a row count handle so a superseded task cannot clear its successor
- **Behavior/invariant:** row-count fetch supersession must be guarded by a
  token/sequence check so an old, slow-to-resolve count task can't clear a
  newer one's result when it finally lands.
- **Failure symptom:** rapid page/filter changes cause the row count to
  flicker back to a stale value from an earlier, now-irrelevant fetch.
- **Where to check:** `src/components/grid/hooks/use-table-data.ts:139-172` —
  **already implemented**: `fetchSeqRef` is incremented per call
  (`const seq = ++fetchSeqRef.current`) and checked (`if (seq !==
  fetchSeqRef.current) return`) at three points, including right after the
  count fetch resolves. Looks correct.
- **Upstream ref:** `bdd60031`

### Validate phase 2 against content identity, not a claim already settled
- **Behavior/invariant:** a second validation phase must check actual content
  identity of what's on screen, not just trust an earlier "this succeeded"
  claim that may now be stale.
- **Failure symptom:** stale/mismatched data passes a check because the check
  trusts a flag instead of re-verifying against current state.
- **Where to check:** `src/components/grid/hooks/use-table-data.ts:163-165` —
  the `currentKey` cache-key comparison (`fetchedKey`) is built from the
  actual fetch parameters (`sid:sch:tbl:pg:ps:where:sort`), not a boolean
  claim, and is only set after both the row fetch and count fetch resolve
  successfully. Consistent with the invariant; no gap found.
- **Upstream ref:** `fb5f8684`

## Schema & structure

### List a partitioned table once, nest its partitions (PostgreSQL)
- See **Confirmed present in this codebase #2** above.
- **Upstream ref:** `c668c7c1`

### Reload schema once per connection, not per window
- **Behavior/invariant:** schema metadata for a connection must be fetched
  once per connection, not redundantly once per open window on that
  connection.
- **Failure symptom (upstream):** opening multiple windows on the same
  connection triggers duplicate schema-fetch work.
- **Where to check:** `likely N/A for this architecture` — single-window app
  (see `34edbe2c` above), `src/stores/schemaStore.ts` is one global store
  instance for the whole app; "once per window" vs "once per connection" is
  not a distinction that can exist here. Still worth checking `schemaStore.ts`
  doesn't refetch redundantly on tab-switch within the one window, which is
  the closest analogous waste this architecture could have.
- **Upstream ref:** `05667e06`

## Notably important finding not on the source list

While reading `a4f8f169`/`d99458bb`'s territory, `src/stores/queryStore.ts`'s
module-level `activeStreamCancel`/`streamGeneration` singleton (see
"Give each tab ownership of its execution" above) looks like a **currently
live** bug, not just a latent risk — worth prioritizing over most of the other
entries here since it's directly reachable by a normal user (open two query
tabs, run a query in each).
