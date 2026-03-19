---
title: "TablePro Windows — Optimize & Harden"
description: "Security hardening, performance optimization, code modularization, and frontend perf fixes for production readiness"
status: pending
priority: P1
effort: 32h
tags: [optimization, security, performance, modularization, quality]
created: 2026-03-18
validated: 2026-03-18
---

# TablePro Windows — Optimize & Harden

## Overview

Windows port is functionally at ~59% parity (P0+P1 features complete). Before pushing toward v1.0 release or adding more features, the codebase needs hardening: plaintext passwords in storage, blocking I/O on async paths, OOM risks on large data, frontend re-render waste, and 8+ large files. This plan addresses security, performance, and code quality — NOT new features.

> [!NOTE]
> Plan validated by 2 adversarial review agents on 2026-03-18. All claims verified against actual codebase. See [validation-report.md](file:///C:/Users/Minh%20Canh/.gemini/antigravity/brain/7434305d-0520-46d1-abc0-f0916a584ac0/validation-report.md) for detailed findings.

## Research Findings Summary

### Security (Critical)
| Finding | File | Impact |
|---------|------|--------|
| **Plaintext passwords in JSON** — `connections.json` stores passwords, SSH keys unencrypted | `storage/connection_store.rs` | **Critical** — data breach risk |
| **SQL injection in export** — unescaped `table_name` in generated SQL; hardcoded `"` quoting wrong for MySQL | `commands/export.rs` L77 | **High** — corrupted export + broken MySQL exports |

### Performance (High)
| Finding | File | Impact |
|---------|------|--------|
| **Blocking file I/O on async paths** — `std::fs::read`/`write` inside Tauri async command handlers | `export.rs`, `import.rs`, `settings_store.rs`, `connection_store.rs` | **High** — blocks tokio scheduler |
| **OOM on JSON/XLSX export** — entire result built in `Vec`/`Worksheet` before write (CSV/SQL are fine — already stream) | `export.rs` L220+ | **High** — crashes on large datasets |
| **Full SQL file loaded into RAM** — `read_to_string` on import (`.gz` decompresses fully too) | `import_service.rs` | **High** — crashes on large .sql files |
| **Blocking SQLite in async** — `rusqlite` queries in Tauri handlers | `history_store.rs` | **Medium** |
| **Frontend re-render waste** — Map recreation kills memoization, unused store subscriptions, sync CodeMirror load | `result-panel.tsx`, `MainLayout.tsx`, `sql-editor.tsx` | **Medium** |
| **Tokio "full" features** — pulls unused modules | `Cargo.toml` | **Low** |

### Code Quality (Medium)
| # | Rust Files >200 LOC | Actual Lines |
|---|---------------------|-------------|
| 1 | `services/import_service.rs` | 578 |
| 2 | `commands/export.rs` | 500 |
| 3 | `services/ssh_tunnel.rs` | 493 |
| 4 | `services/sql_generator.rs` | 481 |
| 5 | `plugin/adapter.rs` | 385 |
| 6 | `storage/history_store.rs` | 297 |
| 7 | `storage/connection_store.rs` | 249 |
| 8 | `models/connection.rs` | 223 |

| # | Frontend Files >200 LOC | Lines |
|---|-------------------------|-------|
| 1 | `editor/sql-context-analyzer.ts` | 569 |
| 2 | `editor/sql-completion-provider.ts` | 567 |
| 3 | `components/grid/result-panel.tsx` | 505 |
| 4 | `editor/sql-keywords.ts` | 459 |
| 5 | `components/connection/ConnectionForm.tsx` | 380 |
| 6 | `components/layout/MainLayout.tsx` | 369 |
| 7 | `components/layout/Sidebar.tsx` | 346 |
| 8 | `components/export/export-dialog.tsx` | 306 |
| 9 | `components/layout/quick-switcher.tsx` | 301 |
| 10 | `components/import/import-dialog.tsx` | 254 |
| 11 | `components/editor/sql-editor.tsx` | 237 |

### Positive Findings
- ✅ Good `AppError` type — no `anyhow` abuse, minimal `unwrap()` in production
- ✅ Structured logging via `tracing` already set up
- ✅ Rust tests across 14 files — solid coverage of parsers, stores, algorithms
- ✅ Frontend: 5 test files (change-store, column-type, editor-store, filter-types, statement-scanner)
- ✅ Excellent TypeScript strictness (only 6 `any` occurrences)
- ✅ Data grid virtualization via TanStack Virtual — working well
- ✅ Clean Zustand store architecture — domain-separated slices

---

## Phases

| # | Phase | Effort | Focus |
|---|-------|--------|-------|
| 1 | Security: Password Encryption (DPAPI) | 10h | Encrypt connection passwords at rest |
| 2 | Security: Per-Driver SQL Identifier Quoting | 3h | Fix SQL injection + correct quoting per DB |
| 3 | Performance: Async I/O Migration | 4h | Wrap blocking I/O in `spawn_blocking` |
| 4 | Performance: File-Side Streaming Export/Import | 3h | Stream to/from disk, avoid file OOM |
| 5 | Frontend Performance Fixes | 4h | Memoization, store selectors, lazy CodeMirror |
| 6 | Code Modularization (Rust + Frontend) | 5h | Split top 10 largest files |
| 7 | Dependency Cleanup + Verify | 3h | Trim tokio, clippy clean, test pass |

> [!IMPORTANT]
> **Phase 4 descoped:** DB-side cursor streaming is blocked — the plugin C-ABI (`PluginVTable`) only returns fully-materialized `QueryResult` structs. No FFI cursor support exists. Fixing this requires modifying the ABI + all 4 drivers (~40h). This plan addresses **file-side** streaming only (write rows to disk incrementally as they arrive from the plugin). DB-side streaming is deferred to a future ABI v2 plan.

## Dependencies

```
Phase 1 (DPAPI) → independent (highest priority)
Phase 2 (SQL quoting) → independent
Phase 3 (async I/O) → before Phase 4
Phase 4 (file streaming) → after Phase 3
Phase 5 (frontend perf) → independent
Phase 6 (modularization) → independent
Phase 5 + Phase 6 → Phase 7 (verify)
```

Phases 1, 2, 5, 6 parallelizable.

---

## Phase 1: Password Encryption (DPAPI) — Critical Security Fix

**Effort: 10h** (validated — Win32 FFI complexity + migration + testing)

### Problem
`ConnectionStore` writes `password`, `ssh_password`, `ssh_key_passphrase` as plaintext to `%APPDATA%/TablePro/connections.json`.

### Solution
Use Windows DPAPI (`CryptProtectData`/`CryptUnprotectData`) to encrypt sensitive fields before serialization.

> [!WARNING]
> **Migration safety**: Cannot detect plaintext vs encrypted by checking base64 validity — a plaintext password could be valid base64. Must use a **storage prefix marker** (`dpapi:`) to distinguish encrypted from legacy plaintext.

#### Changes

##### [NEW] `services/credential_store.rs`
- Add `windows-sys` crate to `Cargo.toml` (for `CryptProtectData`/`CryptUnprotectData`)
- Add `base64` crate to `Cargo.toml`
- DPAPI wrapper: `dpapi_encrypt(data: &[u8]) -> Result<Vec<u8>>`, `dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>>`
- `encrypt_string(s: &str) -> String` → returns `"dpapi:<base64_encrypted_bytes>"`
- `decrypt_string(s: &str) -> Result<String>` → if starts with `dpapi:`, strip prefix → base64 decode → DPAPI decrypt; else return as-is (plaintext legacy)
- Unit tests: encrypt/decrypt roundtrip, empty string, special characters, legacy plaintext passthrough

##### [MODIFY] `storage/connection_store.rs`
- On save: encrypt `password`, `ssh_password`, `ssh_key_passphrase` via `encrypt_string()`
- On load: decrypt via `decrypt_string()` — handles both `dpapi:` prefixed and legacy plaintext
- Auto-migrate: on first load of plaintext connections, re-save with encrypted values

##### [MODIFY] `Cargo.toml`
- Add `windows-sys = { version = "0.59", features = ["Win32_Security_Cryptography"] }`
- Add `base64 = "0.22"`

### Verification
```powershell
cd D:\WORKSPACES\PERSONAL\TablePro\tablepro-windows
cargo test --manifest-path src-tauri/Cargo.toml
```
**Manual test:**
1. Create a connection with password "TestP@ss123"
2. Close app → open `%APPDATA%/TablePro/connections.json`
3. Verify password field shows `dpapi:...` (not plaintext)
4. Reopen app → connect should work (decrypt succeeds)
5. Edge case: manually set password back to plaintext in JSON → reopen → should auto-migrate to encrypted

---

## Phase 2: Per-Driver SQL Identifier Quoting

**Effort: 3h** (validated — need per-driver logic, not just double-quotes)

### Problem
`commands/export.rs` uses unescaped `table_name` in `INSERT INTO` and `CREATE TABLE` statements. Additionally, hardcoded double-quote quoting is wrong for MySQL (needs backticks).

### Solution
Per-driver identifier quoting:
| Database | Quote Style | Escape Rule |
|----------|-------------|-------------|
| PostgreSQL | `"name"` | `"` → `""` |
| MySQL | `` `name` `` | `` ` `` → ` `` `` ` |
| MSSQL | `[name]` | `]` → `]]` |
| SQLite | `"name"` | `"` → `""` |

#### Changes

##### [NEW] `services/sql_quoting.rs`
- `fn quote_identifier(name: &str, driver_type: &str) -> String` — per-driver quoting
- Unit tests for each driver type + malicious input (`'; DROP TABLE --`)

##### [MODIFY] `commands/export.rs`
- Accept `driver_type` in export context (already available from session)
- Replace all raw `table_name` interpolation with `quote_identifier(&table_name, &driver_type)`

### Verification
```powershell
cargo test --manifest-path src-tauri/Cargo.toml
# New unit tests: export table with name containing quotes, backticks, brackets for each driver type
```

---

## Phase 3: Async I/O Migration

**Effort: 4h** (validated — accurate)

### Problem
Synchronous `std::fs` calls and `rusqlite` queries run inside `#[tauri::command] pub async fn` handlers, blocking the tokio scheduler.

### Solution
Wrap all blocking operations in `tokio::task::spawn_blocking`.

#### Changes

| File | Operation | Fix |
|------|-----------|-----|
| `commands/export.rs` | `std::fs::File::create`, `write_all` | `spawn_blocking` wrapper |
| `commands/import.rs` | `import_service::execute/preview` | `spawn_blocking` wrapper |
| `storage/settings_store.rs` | `std::fs::read_to_string`, `write` | `spawn_blocking` wrapper |
| `storage/connection_store.rs` | `std::fs::read_to_string`, `write` | `spawn_blocking` wrapper |
| `storage/history_store.rs` | All `rusqlite` queries | `spawn_blocking` wrapper |

### Verification
```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml
# Manual: import a large .sql file (>10MB) → app UI should remain responsive during import
```

---

## Phase 4: File-Side Streaming Export/Import

**Effort: 3h** (descoped from original 4h — file-side only, no DB cursor changes)

> [!IMPORTANT]
> **Descoped**: DB-side cursor streaming not possible — `PluginVTable` C-ABI returns fully-materialized `QueryResult`. Only **file-side** optimization: write rows to disk as they arrive instead of accumulating in memory. DB-side cursor streaming deferred to ABI v2 plan.

### Problem
- **JSON export**: pushes all rows to `Vec<serde_json::Value>` before writing (OOM on large tables)
- **XLSX export**: retains entire dataset in `Worksheet` in memory
- **Import**: `read_to_string` loads entire SQL file (+ decompressed `.gz`) into `String`

CSV and SQL exports already stream correctly — no changes needed for those.

### Solution

##### Export: Stream JSON rows to file
- Write `[` header, then per-row `,\n{...}`, then `]` — no `Vec` accumulation
- XLSX: write rows to worksheet incrementally (rust_xlsxwriter supports incremental row writes)

##### Import: BufReader streaming
- Replace `read_to_string` with `BufReader`-based line-by-line reading
- Feed `scan_statements` incrementally via character/line iterator
- For `.gz`: wrap `BufReader` around `GzDecoder` → stream

### Verification
```powershell
cargo test --manifest-path src-tauri/Cargo.toml
# Manual: export a table with 100K+ rows as JSON → Task Manager RAM should not spike >200MB
# Manual: import a 50MB .sql file → should complete without OOM crash
```

---

## Phase 5: Frontend Performance Fixes

**Effort: 4h** (new phase — from validation findings)

### Problems Found

1. **`result-panel.tsx`**: `changeMap` and `cellOverrides` `new Map()` recreated every render → destroys `React.memo` referential equality → forces full DataGrid virtual tree re-render
2. **`MainLayout.tsx`**: `useSchemaStore((s) => s.tables)` subscribed but unused → root layout re-renders on schema changes
3. **`sql-editor.tsx`**: `@codemirror/*` imported synchronously → bloats initial JS bundle, degrades TTI
4. **`result-panel.tsx`**: Broad Zustand subscriptions (`useQueryLogStore((s) => s.entries)`) force large component to re-render on unrelated state changes

#### Changes

##### [MODIFY] `components/grid/result-panel.tsx`
- Memoize `changeMap` and `cellOverrides` with `useMemo` — only recompute when change store version changes
- Narrow Zustand selectors to specific properties (`state.count` not `state.entries`)

##### [MODIFY] `components/layout/MainLayout.tsx`
- Remove unused `useSchemaStore((s) => s.tables)` subscription
- Audit all store subscriptions — narrow to specific fields

##### [MODIFY] `components/editor/sql-editor.tsx`
- Lazy-load CodeMirror with `React.lazy()` + `Suspense`
- Move heavy `@codemirror/*` imports into the lazy-loaded component

### Verification
```powershell
cd D:\WORKSPACES\PERSONAL\TablePro\tablepro-windows
npx vitest run
# Manual: open app → verify editor still loads (may show brief loading state)
# Manual: edit cells in data grid → verify no visible lag or flash on each keystroke
```

---

## Phase 6: Code Modularization (Rust + Frontend)

**Effort: 5h** (validated — mechanical splits, ~30min per file)

### Rust — Top 5 files to split

| File | Actual Lines | Proposed Split |
|------|-------------|----------------|
| `import_service.rs` (578) | → `import_parser.rs` (scan_statements), `import_executor.rs` |
| `export.rs` (500) | → trait-based `ExportFormat` + `csv_exporter.rs`, `json_exporter.rs`, `sql_exporter.rs`, `xlsx_exporter.rs` |
| `ssh_tunnel.rs` (493) | → `ssh_config.rs` (types/config), `ssh_connection.rs` (active tunnel) |
| `sql_generator.rs` (481) | → `sql_generator_dml.rs`, `sql_generator_ddl.rs` |
| `adapter.rs` (385) | → `adapter_query.rs`, `adapter_schema.rs` (split FFI calls by domain) |

### Frontend — Top 5 files to split

| File | Lines | Proposed Split |
|------|-------|----------------|
| `result-panel.tsx` (505) | → `result-toolbar.tsx`, `result-status-bar.tsx`, `result-action-handlers.ts` |
| `sql-context-analyzer.ts` (569) | → `schema-context.ts`, `join-analyzer.ts`, `expression-analyzer.ts` |
| `ConnectionForm.tsx` (380) | → `connection-form-fields.tsx`, `connection-ssh-tab.tsx`, `connection-ssl-tab.tsx` |
| `MainLayout.tsx` (369) | → `layout-panels.tsx`, `layout-handlers.ts` |
| `Sidebar.tsx` (346) | → `sidebar-tree.tsx`, `sidebar-context-menu.tsx` |

### Rules
- Pure refactor — zero behavior changes
- Public API / props interface unchanged
- All tests must pass after split

### Verification
```powershell
cd D:\WORKSPACES\PERSONAL\TablePro\tablepro-windows
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npx vitest run
```

---

## Phase 7: Dependency Cleanup + Final Verify

**Effort: 3h**

### Dependency Optimization
- Trim `tokio` features: `"full"` → `["rt-multi-thread", "macros", "net", "sync", "time"]`
- Evaluate `uuid` usage — replace with simple random ID if only used for session IDs

### Final Verification
```powershell
cd D:\WORKSPACES\PERSONAL\TablePro\tablepro-windows

# Rust
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

# Frontend
npx vitest run
npx eslint .

# Build
npm run tauri build
```

### Docs Update
- Update `docs/project-roadmap.md` — add Phase 2.5 "Optimization & Hardening" status
- Update `docs/codebase-summary.md` — reflect new file structure after modularization
- Update `CHANGELOG.md` — security fix for plaintext passwords

---

## Deferred Items (Out of Scope)

| Item | Reason | Future Plan |
|------|--------|-------------|
| DB-side cursor streaming | Requires PluginVTable ABI v2 — 40h+ effort across 4 drivers | ABI v2 plan |
| IPC payload size guard (>1MB) | Separate concern, needs frontend+backend coordination | P2 feature |
| Global allocator (`mimalloc`) | Benchmarking needed first | Performance v2 |
| Startup async (lazy plugin load) | Low impact, app starts fast enough | v1.1 |
| XSS audit | Low risk — React auto-escapes, no `dangerouslySetInnerHTML` found | Security audit |

---

## Success Criteria

- [ ] Zero plaintext passwords in `connections.json` (uses `dpapi:` prefix)
- [ ] `dpapi:` migration handles legacy plaintext connections without corruption
- [ ] No SQL injection possible via `table_name` in export
- [ ] Per-driver quoting correct: PG `"`, MySQL `` ` ``, MSSQL `[]`
- [ ] No blocking `std::fs` calls on async paths
- [ ] JSON/XLSX export 100K+ rows without OOM (file-side streaming)
- [ ] Import 50MB+ SQL file without OOM (BufReader streaming)
- [ ] Frontend DataGrid memoization — no full re-render on unrelated state changes
- [ ] CodeMirror lazy-loaded — not in initial bundle
- [ ] All Rust files < 200 LOC (top 5 split)
- [ ] All frontend files < 400 LOC (top 5 split)
- [ ] `cargo test` + `cargo clippy` clean
- [ ] `npx vitest run` all pass
- [ ] `npm run tauri build` succeeds
