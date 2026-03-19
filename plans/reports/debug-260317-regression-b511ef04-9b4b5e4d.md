# Regression Investigation: b511ef04 → 9b4b5e4d

**Date:** 2026-03-17  
**Scope:** `tablepro-windows/` only  
**Commits in range:**
```
29d5b95c  test(windows): add change-store, editor-store, and filter-types tests
60e073fc  docs: update changelog with P0 bug fixes and new features
9b4b5e4d  feat(windows): implement all P1 features — SSH tunnel, SQL import, XLSX export,
          connection groups, schema switching, FK navigation, safe mode levels, keyboard shortcuts
```

---

## Executive Summary

This diff introduces **5 distinct new subsystems** in a single commit. All crashes in `tauri dev` that produce little/no Rust log output are caused at the **renderer or IPC boundary** — before Rust-side `tracing` fires. Ranked by crash probability:

| Rank | Area | Crash Type | Confidence |
|------|------|-----------|------------|
| 1 | `russh` SSH tunnel at connect time | Rust panic / deadlock → silent renderer freeze | High |
| 2 | `import_sql_file` mutex hold across async import | Deadlock → all subsequent IPC silently hangs | High |
| 3 | `safeMode → safeModeLevel` settings migration | JS crash on `undefined` numeric ops at startup | High |
| 4 | `fetch_schemas` raw `invoke` vs typed `commands` inconsistency | Uncaught JS exception → blank schema panel | Medium |
| 5 | Duplicate F1 keydown handler | Non-fatal; minor UX glitch, not a crash | Low |

---

## Ranked Crash-Prone Changes

### 🔴 RANK 1 — SSH Tunnel Panic at Connect Time
**Files:** `src-tauri/src/services/ssh_tunnel.rs`, `src-tauri/src/services/connection_manager.rs`

**Evidence:**
- `open_tunnel()` is called inside `connect()` which is itself called from the Tauri command handler.
- `russh` is brand-new to `Cargo.toml` (`russh = "0.45"`, `russh-keys = "0.45"`).
- Any panic inside an async Tokio task spawned by `russh` is **caught by Tokio's runtime** and does NOT propagate a Rust log line through `tracing` — it just silently drops the task.
- The forwarding loop in `ssh_tunnel.rs:212-244` uses `session.channel_open_direct_tcpip(...)` inside a `tokio::spawn` — if `session` is moved in and then panics (e.g. due to a dropped channel or a russh internal assertion), the outer `connect()` call will have already returned `Ok(session_id)` to the renderer. The renderer renders as connected but no DB traffic flows.
- `SshClientHandler::check_server_key` silently accepts all keys — no crash here, but any russh handshake race condition is invisible.
- `test_connection` creates a `SshTunnelManager` in a `&self` method context then `drop`s it at end of scope — this shuts down the tunnel while the driver may still be trying to connect, racing against `Drop`.

**Smallest suspicious file set:**
```
src-tauri/src/services/ssh_tunnel.rs
src-tauri/src/services/connection_manager.rs
```

---

### 🔴 RANK 2 — `import_sql_file` Mutex Hold Across Async Import
**Files:** `src-tauri/src/commands/import.rs`

**Evidence:**
The current code (as shipped in 9b4b5e4d) was **already fixed** — the lock is dropped before the import runs:
```rust
let driver = {
    let mgr = manager.lock().await;
    mgr.get_driver(&session_id)?    // Arc clone released here
};
// lock dropped; import runs without holding it
```
However the **inline comment in the file says** `"// We need to lock the manager only to borrow the driver. The borrow must not span across await points"` — this comment references an earlier draft that *did* hold the lock. Verify the compiled artifact matches this final form.

**Residual risk:** If a build artifact from an intermediate draft is being run, any concurrent IPC call during an import (e.g. schema refresh firing in the background) will deadlock — the renderer gets no response and hangs silently because `tokio::sync::Mutex` blocks without any timeout.

**Smallest suspicious file set:**
```
src-tauri/src/commands/import.rs
src-tauri/src/services/import_service.rs
```

---

### 🔴 RANK 3 — `safeMode → safeModeLevel` Settings Migration Crash
**Files:** `src/types/settings.ts`, `src/stores/settingsStore.ts` (not in diff but reads settings), `src-tauri/src/storage/settings_store.rs`

**Evidence:**
- Old `settings.json` on disk has `"safeMode": true/false` (boolean).
- New code removes the `safe_mode: bool` field entirely; Rust serde has no `deny_unknown_fields` so the old field is silently dropped. **Rust side is safe.**
- Frontend: `DEFAULT_SETTINGS.safeModeLevel = 2` and the settings type now declares `safeModeLevel: number`. **BUT** — if the frontend reads a cached settings object from Zustand persist (if persistence is enabled) or from an in-flight IPC response that was serialized before the update, `settings.safeMode` would be `undefined` and `settings.safeModeLevel` would be `undefined`.
- `Toolbar.tsx` reads `safeModeLevel` and passes it to `execute(..., safeModeLevel)`. Inside `queryStore.ts:checkSafeMode(sql, level)` — `switch(level)` with `level = undefined` falls through to the `default: return { blocked: false }` branch. No crash here.
- **Actual crash vector:** `cycleLevel(current)` in `Toolbar.tsx`:
  ```ts
  const CYCLE: Record<number, number> = { 0: 2, 2: 5, 5: 0 };
  function cycleLevel(current: number): number {
    return CYCLE[current] ?? (current >= 5 ? 0 : current + 1);
  }
  ```
  If `current` is `undefined`, `CYCLE[undefined]` is `undefined`, and `undefined >= 5` is `false`, so `undefined + 1 = NaN`. `saveSettings({ safeModeLevel: NaN })` causes a subsequent `serde_json` deserialization failure on the Rust side → `AppError::ConfigError` → IPC error event → unhandled JS promise rejection → React error boundary OR silent state corruption.
- `settings-connection.tsx` renders `<Select value={settings.safeModeLevel}>` — if `safeModeLevel` is `undefined` the select shows blank and any change emits `Number(undefined) = NaN` to Rust.

**Smallest suspicious file set:**
```
src/types/settings.ts
src/stores/settingsStore.ts  (check DEFAULT_SETTINGS merge on load)
src-tauri/src/storage/settings_store.rs
src/components/layout/Toolbar.tsx
src/components/settings/settings-connection.tsx
```

---

### 🟡 RANK 4 — `fetch_schemas` Raw `invoke` vs Typed `commands.fetchSchemas`
**Files:** `src/stores/schemaStore.ts`, `src/ipc/commands.ts`

**Evidence:**
`schemaStore.ts` calls `invoke<string[]>("fetch_schemas", { sessionId })` directly (raw) while `commands.ts` exports `fetchSchemas(sessionId)` wrapping the same invoke. This is only a maintainability issue — they call the same command name and both are correct. **Not a crash vector on its own.**

However: `fetch_schemas` runs a PostgreSQL-specific query:
```sql
SELECT schema_name FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', ...)
```
On a **non-PostgreSQL driver** (MySQL, SQLite, MSSQL) this will fail. The `fetchSchemas` wrapper in `schemaStore.ts` silently catches errors and sets `schemas: []`. This is safe. **But** `selectDatabase` calls `get().fetchSchemas(sessionId)` as fire-and-forget — if the rejection is not caught by the inner try/catch (e.g. a synchronous throw from a plugin), it becomes an unhandled promise rejection. WebView2 may surface this as a renderer crash depending on its error policy.

**Smallest suspicious file set:**
```
src/stores/schemaStore.ts
src-tauri/src/commands/schema.rs
```

---

### 🟢 RANK 5 — Duplicate F1 Keydown Handler
**Files:** `src/components/layout/MainLayout.tsx`, `src/hooks/useKeyboardShortcuts.ts`

**Evidence:**
`MainLayout.tsx` registers a `window.addEventListener("keydown")` that handles `F1` to set `helpOpen = true`. `useKeyboardShortcuts.ts` also handles `F1` via `handlers?.onShowHelp?.()`. If `MainLayout` also calls `useKeyboardShortcuts({ onShowHelp: ... })` (not confirmed — hook call not visible in diff), F1 would fire twice. **Non-fatal.** The dialog would open twice but React state deduplications it to one open state.

---

## Supporting Evidence

### New Cargo.toml Dependencies
```
rust_xlsxwriter = "0.79"   # XLSX export — pure Rust, low risk
flate2 = "1"               # gz decompression — well-tested
russh = "0.45"             # SSH — NEW, async networking, panic risk
russh-keys = "0.45"        # SSH key parsing — NEW
```
`russh 0.45` is a relatively new crate; its async internals use `tokio` channels that can produce silent task drops if polled incorrectly.

### `test_connection` SSH Tunnel Race (Rank 1 detail)
```rust
pub async fn test_connection(&self, config: &ConnectionConfig) -> Result<(), AppError> {
    if config.ssh_enabled {
        let mut temp_mgr = SshTunnelManager::new();
        let local_port = temp_mgr.create_tunnel("__test__", config).await?;
        // ...
        temp_mgr.close_tunnel("__test__");
        ping  // ← temp_mgr dropped here, SshTunnel::Drop fires shutdown_tx
    }
```
`temp_mgr.close_tunnel("__test__")` calls `tunnel.shutdown()` then immediately the DB driver's `ping()` result is returned. But the tunnel's forwarding task (tokio::spawn) may still be accepting the last TCP packet. Order of shutdown is not guaranteed → ping response may be lost.

### `connectionStore.ts` — `loadGroups` called in `WelcomeView` but not in app init
`WelcomeView` calls `loadGroups()` in `useEffect`. If the user navigates away before the effect fires (unlikely but possible in dev HMR), groups remain unloaded → `ConnectionForm` renders with empty `groupList` even if groups exist on disk.

---

## Smallest Suspicious File Set (combined)

```
tablepro-windows/src-tauri/src/services/ssh_tunnel.rs
tablepro-windows/src-tauri/src/services/connection_manager.rs
tablepro-windows/src-tauri/src/commands/import.rs
tablepro-windows/src/types/settings.ts
tablepro-windows/src/stores/settingsStore.ts
tablepro-windows/src/components/layout/Toolbar.tsx
tablepro-windows/src/stores/schemaStore.ts
```

---

## Unresolved Questions

1. **Does `MainLayout` call `useKeyboardShortcuts({ onShowHelp })`?** — The diff only shows hook definition changes, not call sites. Confirm to rule out double-F1.
2. **Is `russh 0.45` compatible with `tokio` version already in `Cargo.lock`?** — If there's a tokio version mismatch, the async runtime can deadlock silently.
3. **Does the frontend use Zustand persist middleware?** — If `settingsStore` is persisted to `localStorage`, old `{ safeMode: true }` survives a refresh and `safeModeLevel` would be `undefined` until the user changes a setting. The migration path must be confirmed.
4. **What is the WebView2 version in the test environment?** — Some older WebView2 builds (prior to 109) crash on unhandled Promise rejections from `invoke()` rather than surfacing them as JS console errors.
