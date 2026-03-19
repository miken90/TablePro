# Phase 4 — Import SQL (Full-Featured)

> Est. effort: 4-5 days (single agent)
> Dependencies: None

---

## P1-2: Import SQL

### Overview
Full-featured SQL import matching macOS: file picker (.sql, .sql.gz), preview, options (transaction wrap, FK disable), progress tracking, error handling.

### Architecture

```
Frontend:                          Rust backend:
ImportDialog.tsx ────IPC────→ commands/import.rs
  ├ File picker                    ├ import_sql_file(path, options)
  ├ Preview panel                  ├ import_preview(path) → { stmtCount, size }
  ├ Options panel                  ├ Statement scanner (split by ';')
  ├ Progress bar ←──Events──       ├ Sequential execution with progress events
  └ Error display                  └ Transaction wrapping

services/import_service.rs
  ├ SQL statement scanner
  ├ gz decompression (flate2)
  └ Progress event emission
```

### Backend Implementation

**New crate dependencies (`Cargo.toml`):**
```toml
flate2 = "1"
```

**New files:**
- `src-tauri/src/services/import_service.rs` — core import logic
- `src-tauri/src/commands/import.rs` — IPC commands

**Commands:**

1. `import_preview(path: String) → ImportPreview`
   - Read file (or decompress .gz)
   - Count statements (scan for `;` outside strings/comments)
   - Return `{ statementCount, fileSizeBytes, firstStatements: String }` (first 50 lines for preview)

2. `import_sql_file(sessionId, path, options) → ImportResult`
   - Options: `{ wrapInTransaction: bool, disableFkChecks: bool }`
   - Open file (or gz stream via flate2)
   - If wrapInTransaction: execute `BEGIN`
   - If disableFkChecks: execute DB-specific disable (MySQL: `SET FOREIGN_KEY_CHECKS=0`, PG: `SET session_replication_role = 'replica'`, MSSQL: per-table `NOCHECK`)
   - Scan statements, execute one-by-one
   - Emit Tauri event per statement: `import_progress { current, total, statement }`
   - On error: if transaction → `ROLLBACK`, report failed statement + line number
   - On success: if transaction → `COMMIT`, re-enable FK checks
   - Return `{ statementsExecuted, durationMs }`

**Statement Scanner:**
Reuse/port the `statementScanner` pattern from frontend `__tests__/` — split SQL by `;` respecting:
- String literals (`'...'`, `"..."`)
- Dollar-quoted strings (PostgreSQL `$$...$$`)
- Comments (`--` line, `/* */` block)
- MySQL DELIMITER support (stretch goal, skip P1)

Reference: macOS `Core/Utils/SQLStatementScanner.swift`

**Gz support:**
```rust
use flate2::read::GzDecoder;
use std::io::Read;

fn open_file(path: &str) -> Box<dyn Read> {
    if path.ends_with(".gz") {
        let file = File::open(path)?;
        Box::new(GzDecoder::new(file))
    } else {
        Box::new(File::open(path)?)
    }
}
```

### Frontend Implementation

**New files:**
```
src/components/import/
├── import-dialog.tsx      # Main dialog
├── import-preview.tsx     # File preview panel
└── import-progress.tsx    # Progress indicator
```

**Import Dialog (`import-dialog.tsx`):**
1. File picker button → `@tauri-apps/plugin-dialog` `open({ filters: [{ name: 'SQL', extensions: ['sql', 'gz'] }] })`
2. On file selected → call `import_preview` IPC → show preview panel
3. Options: checkboxes for "Wrap in transaction" (default ON), "Disable FK checks"
4. "Import" button → call `import_sql_file` IPC
5. Listen for `import_progress` Tauri events → update progress bar
6. On complete: show summary, refresh sidebar tables

**Toolbar integration:**
- Add Import button to toolbar (database icon with arrow-down)
- Shortcut: `Ctrl+Shift+M` (iMport) — registered in Phase 1, wired here
- `Ctrl+Shift+I` is taken by Inspector toggle → cannot reuse
- Toolbar button always visible when connected; shortcut only active when connected

**Settings persistence:**
- Import options (transaction wrap, FK disable) persist in settingsStore

### Files touched
- `src-tauri/Cargo.toml` — add `flate2`
- `src-tauri/src/services/import_service.rs` (new)
- `src-tauri/src/services/mod.rs` — add module
- `src-tauri/src/commands/import.rs` (new)
- `src-tauri/src/commands/mod.rs` — add module
- `src-tauri/src/lib.rs` — register commands
- `src/ipc/commands.ts` — add import IPC calls
- `src/ipc/events.ts` — add import_progress event listener
- `src/components/import/` (new dir) — dialog, preview, progress
- `src/components/layout/MainLayout.tsx` — render import dialog
- `src/components/layout/Toolbar.tsx` — import button/menu

### Edge cases
- File encoding: assume UTF-8, show error if invalid
- Empty .sql file → "No statements found" message
- Very large file (>1GB) → streaming reader, don't load into memory
- Statement scanner: `BEGIN`/`COMMIT` in file + user's "wrap in transaction" → nested transaction (use `SAVEPOINT` for PG, skip double-wrap for MySQL)
- File path with spaces/Unicode on Windows → use raw string, let Tauri handle
- Network disconnect during import → transaction rollback, error message
- Import into wrong database → user responsibility, confirm dialog shows connection name
