# memory.md

## Crash debugging memory (TablePro Windows)

### Current findings
- Crash is intermittent, not 100% reproducible on startup.
- `tauri dev` can fail while direct `target/release/tablepro-windows.exe` may stay alive.
- When crash happens with no new Rust logs (`stdout` stops around startup, `stderr` empty), treat it as likely WebView/dev-runtime/bootstrap-level first, not query logic first.
- `tauri build` may fail and leave old MSI/NSIS artifacts; verify build exit code before trusting timestamps.
- New confirmation (2026-03-18): `npm run tauri dev`/`tauri dev --no-watch` exits early (~50s, code 1) with repeated renderer startup beacons, while direct `cargo run --no-default-features --features devtools --` and direct debug exe stay stable for minutes.
- No matching `Application Error` / `Windows Error Reporting` / `Application Hang` events during these exits; treat as dev-runner/watch pipeline issue, not core app runtime crash.

### High-priority triage order
1. Determine scope first:
   - dev-only (`npm run tauri dev`) vs release exe (`target/release/tablepro-windows.exe`) vs packaged installer.
2. Check frontend crash breadcrumbs:
   - `%APPDATA%/TablePro/renderer-errors.log` (startup beacons + `window.error` + `unhandledrejection`).
3. Check backend startup logs:
   - `tablepro-windows/src-tauri/target/debug/stdout.log`
   - `tablepro-windows/src-tauri/target/debug/stderr.log`
4. If frontend log missing and backend silent after startup, inspect OS-level evidence:
   - Windows Event Log (`Application Error`, `Windows Error Reporting`, `Application Hang`)
   - `%LOCALAPPDATA%/CrashDumps`
5. Only then dive into plugin/IPC flow-specific paths.

### Root cause identified (2026-03-19): Tauri CLI file watcher kills app
- **Definitive test**: Vite dev server + `cargo run` (no Tauri CLI) = stable 5+ min. `tauri dev` = crash ~2-3 min. `tauri dev --no-watch` = stable.
- Tauri CLI file watcher detects artifact changes in `src-tauri/target/` and kills the running app to rebuild. Windows file-locks on the running exe/dll prevent overwriting → exit code 1.
- Secondary factors fixed along the way:
  - `beforeDevCommand` was running one-shot `vite build` instead of long-lived Vite dev server — restored `devUrl` + `npm run dev`.
  - PDB filename collision between bin/lib targets — reduced lib crate-type to `["rlib"]`.
  - Vite chokidar was not ignoring `src-tauri/` — added `server.watch.ignored`.
- **Permanent fix**: `npm run dev:tauri` now runs `tauri dev --no-watch`. Ctrl+C and re-run to pick up Rust changes.
- Dev command: `powershell.exe -Command "cd tablepro-windows; npm run dev:tauri"`

### Root cause identified (2026-03-20): Tauri CLI `dev --no-watch` STILL kills app
- **Even with `--no-watch`**, the Tauri CLI 2.10.1 `dev` command silently terminates the app process after ~2-5 minutes while idle.
- No crash dumps, no panic logs, no Windows Event Log entries. Process exits with code 1.
- `on_window_event` callbacks for CloseRequested/Destroyed never fire → Tauri CLI kills the child process, not a normal window close or Rust panic.
- **Definitive test**: `cargo run` directly (no Tauri CLI) = stable 5+ min with Vite running separately. `tauri dev --no-watch` = crash ~2-5 min.
- **Root cause**: Tauri CLI `dev` manages child processes (Vite + cargo) and has known bugs on Windows where it prematurely terminates the app process.
- **Permanent fix**: `scripts/dev.ps1` — PowerShell script that runs Vite and `cargo run` independently, bypassing Tauri CLI entirely.
  - `npm run dev:tauri` now invokes `scripts/dev.ps1`
  - `npm run dev:tauri:cli` preserved as fallback for `tauri dev --no-watch`
  - Script auto-cleans stale port 1420 processes, waits for Vite TCP listen, and kills Vite on app exit.
- **Secondary fix**: `tauri-plugin-updater` was in Cargo.toml and capabilities but never registered in `tauri::Builder` — now properly initialized with `.plugin(tauri_plugin_updater::Builder::new().build())`
- Dev command: `powershell.exe -Command "cd tablepro-windows; npm run dev:tauri"`

### Known risky areas already addressed
- Plugin/driver shutdown lifetime ordering in `ConnectionManager` (drop connections before plugin manager).
- Command-layer lock usage: avoid holding `Mutex<ConnectionManager>` while awaiting DB driver operations.
- Startup history store hardening: fallback instead of panic on disk DB open failure.
- Removed eager schema-wide `fetchColumns` burst after connect.

### Build verification memory
- `npm run tauri build` can print long compile logs and still fail at the end.
- Always verify success by checking command exit code, not only partial logs.
- If installer timestamps remain old, run:
  - `cargo build --release --manifest-path src-tauri/Cargo.toml`
  - then separately diagnose Tauri bundling step failure.

### Commands used frequently
- Dev run: `powershell.exe -Command "cd tablepro-windows; npm run dev:tauri"`
- Release rust build: `powershell.exe -Command "cd tablepro-windows; cargo build --release --manifest-path src-tauri/Cargo.toml"`
- Full bundle: `powershell.exe -Command "cd tablepro-windows; npm run tauri build"`
