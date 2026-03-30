---
title: "Windows Port Architecture Analysis"
description: "Top-3 architecture options for porting TablePro to Windows with feasibility scores, risks, and recommendation"
status: completed
priority: P1
effort: advisory
branch: main
tags: [architecture, windows, port, research]
created: 2026-03-12
---

# TablePro Windows Port: Architecture Decision Record

## Codebase Inventory (What We're Porting)

| Layer | LOC | macOS Coupling | Port Difficulty |
|-------|-----|----------------|-----------------|
| Core (business logic) | ~24K | Low-Medium (Foundation, Security, OSLog, AppKit in ~15 files) | Medium |
| Views (UI) | ~29K | **Total** (SwiftUI + AppKit) | Complete rewrite |
| Models | ~6K | Low (Foundation only) | Medium |
| ViewModels | ~1K | Low | Medium |
| Plugins (8 DB drivers) | ~18K Swift + C bridges | Low (Foundation + C libs) | **Critical path** |
| PluginKit (shared proto) | ~2K | Low (Foundation only) | Medium |
| Vim engine | ~900 | Low (Foundation, stateless FSM) | Portable logic |
| Autocomplete | ~1.5K | Low (Foundation only) | Portable logic |
| Static C libs | 12 libraries | macOS fat binaries | **Must rebuild for Windows** |
| Editor | CodeEditSourceEditor (SPM) | **Total** (AppKit NSTextView) | Replace entirely |

**Total: ~80K LOC Swift, ~18K in plugins, 12 C libraries, 303 Swift files.**

Key macOS-only dependencies that have NO Windows equivalent:
- SwiftUI / AppKit (entire UI)
- CodeEditSourceEditor (tree-sitter + NSTextView)
- macOS Security.framework (Keychain, code signing)
- Sparkle (auto-update)
- NSBundle plugin loading (`.tableplugin` bundles)
- Process (SSH tunnel via `/usr/bin/ssh`)

---

## Option 1: Rust/Tauri v2 + TypeScript Frontend

**Architecture**: Rust backend (Tauri v2) + React/TypeScript frontend with CodeMirror 6 or Monaco editor. DB driver plugins as Rust cdylib DLLs loaded via `libloading`. You already have a `tablepro-windows/` Tauri skeleton.

### What Gets Reused
- **Plugin driver protocol** → Port `PluginDatabaseDriver` to Rust trait (1:1 mapping, same method signatures)
- **C libraries** → Rebuild libmariadb, libpq, libmongoc, hiredis, FreeTDS, DuckDB for Windows via vcpkg. These are all well-supported on Windows.
- **SQL logic** (autocomplete, statement generator, SQL escaping, query builder) → Rewrite in Rust (~5K LOC)
- **Vim engine** → Use CodeMirror 6 vim extension (battle-tested, covers all motions in current VimEngine.swift)
- **Multi-cursor** → CodeMirror 6 native support
- **Change tracking / undo** → Rewrite in TypeScript (~2K LOC)

### Plugin Model on Windows
```
tablepro-windows/
  plugins/
    mysql.dll          # Rust cdylib
    postgresql.dll
    sqlite.dll
    ...
  plugin-kit/          # Shared Rust crate (trait definitions)
```
- DLLs loaded at runtime via `libloading` crate
- Plugin trait mirrors `PluginDatabaseDriver` exactly
- No code signing (use SHA-256 hash verification instead)
- User-installed plugins in `%APPDATA%/TablePro/Plugins/`

### Editor Strategy
CodeMirror 6 (not Monaco):
- **300KB** vs 5-10MB (Monaco). Offline enterprise constraint favors small.
- Native vim mode extension (covers normal/visual/command-line modes)
- Multi-cursor built-in
- Modular: only load SQL language, autocomplete, vim
- Tree-sitter optional via WASM for syntax highlighting
- Offline: ships in app bundle, zero network calls

### Feasibility Score: 7/10

| Factor | Score | Notes |
|--------|-------|-------|
| Time (3-6mo, 1-3 people) | 6/10 | ~3mo for core + 2 drivers, 6mo for full 8 drivers |
| Plugin model parity | 8/10 | DLL loading is straightforward in Rust |
| Editor parity | 8/10 | CodeMirror 6 vim > current VimEngine (more complete) |
| Performance | 7/10 | WebView overhead for data grid is the bottleneck |
| Offline/enterprise | 9/10 | No network required at all |
| Code reuse from macOS | 4/10 | Almost nothing reused directly (different language) |
| Team ramp-up | 6/10 | Need Rust + React. Existing Tauri skeleton helps. |

### Risks
1. **Data grid performance**: Rendering 100K+ rows in WebView. Must use virtual scrolling (react-virtualized/TanStack Virtual). macOS version uses NSTableView which handles this natively.
2. **C library compilation**: vcpkg has known issues with libmariadb static builds on Windows (see Issues #41115, #41719). Budget 2-3 weeks just for C library compilation+linking.
3. **SSH tunnels**: No `/usr/bin/ssh` on Windows. Must use `putty`/`plink` or embed libssh2. Different auth model (no agent forwarding by default).
4. **Keychain → DPAPI**: Windows Credential Manager or DPAPI for password storage. Different API entirely.
5. **Two codebases**: Every new feature must be implemented twice. This is the long-term killer cost.

---

## Option 2: C++ Qt 6 + QML

**Architecture**: C++ backend with Qt 6 framework. QML for UI. DB drivers as Qt plugins (QPluginLoader). Editor via QScintilla or custom QTextEdit with tree-sitter.

### What Gets Reused
- **C libraries** → Same libraries, link directly in C++ (zero FFI overhead)
- **SQL logic** → Rewrite in C++ (~5K LOC, straightforward)
- **Plugin protocol** → Qt plugin system (QPluginLoader) is nearly identical to NSBundle loading
- **Data grid** → QTableView handles millions of rows natively with model/view

### Plugin Model on Windows
```
plugins/
  mysql_driver.dll     # Qt plugin (.dll)
  postgresql_driver.dll
  ...
```
- `QPluginLoader` = runtime DLL loading with metadata (like NSBundle Info.plist)
- Cross-platform: same plugin binary concept on macOS/Linux/Windows
- JSON metadata in plugin (replaces Info.plist)

### Editor Strategy
QScintilla (Scintilla Qt wrapper):
- Multi-cursor: YES (Scintilla native since v3.x)
- Vim mode: NO built-in. Must implement or port VimEngine.swift → C++
- Autocomplete: YES (built-in popup, need custom provider)
- Syntax highlighting: Lexer-based, good SQL support
- Alternative: Custom QTextEdit + tree-sitter-highlight (more work, more control)

### Feasibility Score: 6/10

| Factor | Score | Notes |
|--------|-------|-------|
| Time (3-6mo, 1-3 people) | 5/10 | C++ is slower to develop. 6mo gets you maybe 60% parity. |
| Plugin model parity | 9/10 | QPluginLoader is the closest analog to NSBundle |
| Editor parity | 5/10 | Vim mode must be hand-ported. QScintilla lacks some features. |
| Performance | 9/10 | Native everything. QTableView eats large datasets. |
| Offline/enterprise | 9/10 | Fully offline, no web tech |
| Code reuse from macOS | 3/10 | Different language, different framework |
| Team ramp-up | 4/10 | Qt/C++ has steep learning curve. QML is its own language. |

### Risks
1. **Development speed**: C++ is 2-3x slower to develop than Rust or TypeScript for business logic. A team of 1-3 will struggle for velocity.
2. **Qt licensing**: Qt 6 commercial license is ~$5K/dev/year. LGPL is free but requires dynamic linking (larger install, DLL distribution complexity). Must decide Day 1.
3. **Vim mode gap**: No off-the-shelf vim mode for QScintilla. Porting VimEngine.swift (884 LOC) to C++ is doable but testing is painful.
4. **QML ecosystem**: Smaller community than React/web. Fewer off-the-shelf components.
5. **macOS maintenance burden**: If you keep Swift for macOS and C++ for Windows, you have the worst of both worlds: two codebases in two different languages.

---

## Option 3: C# WinUI 3 (Windows App SDK)

**Architecture**: C# with WinUI 3 for native Windows UI. DB drivers as .NET assemblies loading native DLLs via P/Invoke. Editor via AvalonEdit or embedded Monaco (WebView2).

### What Gets Reused
- **C libraries** → P/Invoke to native DLLs (libmariadb.dll, libpq.dll, etc.)
- **SQL logic** → Rewrite in C# (~5K LOC)
- **Plugin protocol** → MEF (Managed Extensibility Framework) or `Assembly.LoadFrom()` for DLL plugins
- **Data grid** → WinUI3 DataGrid / CommunityToolkit DataGrid

### Plugin Model on Windows
```
plugins/
  MySQLDriver/
    MySQLDriver.dll      # .NET assembly
    libmariadb.dll       # Native dependency
```
- `Assembly.LoadFrom()` with custom `AssemblyLoadContext` for isolation
- JSON metadata file alongside DLL (replaces Info.plist)
- Native DLL dependencies loaded via NativeLibrary.Load()

### Editor Strategy
Two sub-options:
- **AvalonEdit**: .NET text editor (used by ILSpy, SharpDevelop). Multi-cursor: NO. Vim mode: NO. Would need heavy custom work.
- **Monaco via WebView2**: Full VS Code editor. Multi-cursor: YES. Vim extension: YES. But: 5-10MB overhead, WebView2 dependency, potential offline issues.

### Feasibility Score: 5/10

| Factor | Score | Notes |
|--------|-------|-------|
| Time (3-6mo, 1-3 people) | 6/10 | C# is fast to develop, but WinUI 3 is immature |
| Plugin model parity | 6/10 | MEF works but native DLL loading in .NET is fiddly |
| Editor parity | 4/10 | AvalonEdit lacks multi-cursor/vim. Monaco adds WebView2 dep. |
| Performance | 6/10 | .NET GC pauses on large datasets. P/Invoke marshaling overhead. |
| Offline/enterprise | 7/10 | .NET runtime required. WebView2 runtime for Monaco. Two runtimes. |
| Code reuse from macOS | 2/10 | Nothing reusable. Windows-only framework. |
| Team ramp-up | 7/10 | C# is approachable. WinUI 3 docs are sparse. |

### Risks
1. **WinUI 3 maturity**: Still has rough edges. DataGrid control is community-maintained. Startup time issues (see WindowsAppSDK #4697). Missing controls vs WPF.
2. **Windows-only**: Zero path to macOS/Linux. If you ever want a unified codebase, this is a dead end.
3. **Two runtime dependencies**: .NET 8+ runtime AND WebView2 runtime (if using Monaco). Enterprise IT departments hate this.
4. **P/Invoke complexity**: Marshaling C structs (libmongoc BSON, libmariadb result sets) through P/Invoke is error-prone and slow for large result sets.
5. **No future convergence**: You'll maintain Swift+macOS and C#+Windows forever. Features will drift.

---

## Comparative Matrix

| Criterion (weighted) | Tauri/Rust (W=weight) | Qt/C++ | WinUI/C# |
|----------------------|----------------------|--------|----------|
| Dev speed (25%) | **7** | 5 | 6 |
| Plugin parity (20%) | 8 | **9** | 6 |
| Editor parity (20%) | **8** | 5 | 4 |
| Performance (15%) | 7 | **9** | 6 |
| Offline enterprise (10%) | **9** | **9** | 7 |
| Future convergence (10%) | **7** | 6 | 2 |
| **Weighted Total** | **7.5** | **6.6** | **5.2** |

---

## Hidden Costs (All Options)

1. **C library recompilation for Windows** (2-4 weeks): libmariadb, libpq, libmongoc, hiredis, FreeTDS, DuckDB, OpenSSL, libssh2. vcpkg helps but has known build failures. Must maintain Windows CI for these.

2. **SSH tunnel replacement** (1-2 weeks): Windows has no built-in SSH. Must embed libssh2 or ship with OpenSSH binaries. Key agent (pageant vs ssh-agent) differences.

3. **Keychain replacement** (3-5 days): Windows Credential Manager (CredRead/CredWrite) or DPAPI. Different size limits, different API.

4. **Code signing replacement** (1 week): No macOS codesign on Windows. Must use Authenticode signing for plugins. Or use hash-based verification (simpler).

5. **Auto-update replacement** (1 week): Sparkle doesn't exist on Windows. Tauri has built-in updater. Qt/WinUI need custom solution (WinSparkle or manual).

6. **Test infrastructure** (ongoing): Must set up Windows CI. Database test containers. Different filesystem behavior (path separators, Unicode handling).

7. **Feature drift tax** (ongoing): Every future macOS feature must be ported. Budget 20-30% overhead per feature cycle for dual-platform maintenance.

8. **Installer/packaging** (1 week): MSI or MSIX packaging. Enterprise deployment (Group Policy, silent install). Different from DMG.

---

## Recommendation: Tauri v2 + Rust Backend + CodeMirror 6

**Choose Option 1.** Here's why and the caveats.

### Why Tauri Wins

1. **You already started it.** `tablepro-windows/src-tauri/` exists. Don't throw away momentum.

2. **CodeMirror 6 solves the editor problem completely.** Your current editor stack (CodeEditSourceEditor + custom VimEngine + CompletionEngine) is ~3K LOC of macOS-specific code wrapping an AppKit NSTextView. CodeMirror 6 gives you multi-cursor, vim mode, SQL autocomplete, tree-sitter highlighting out of the box. It's actually *better* than your current editor for vim coverage.

3. **Fastest path to v1.** TypeScript UI development is 3-5x faster than C++ (Qt) and matches C# speed, with a vastly larger component ecosystem.

4. **Plugin DLL loading in Rust is proven.** The `libloading` crate is battle-tested. Your `PluginDatabaseDriver` protocol maps cleanly to a Rust trait with `#[no_mangle] extern "C"` functions.

5. **Future convergence possible.** Tauri runs on macOS too. After Windows ships, you could evaluate migrating macOS to the same codebase. Not recommended immediately, but the option exists.

6. **Offline-first is native to Tauri.** No CDN dependencies. Everything ships in the binary. WebView2 is pre-installed on Windows 10/11.

### Brutally Honest Caveats

1. **The data grid is the #1 risk.** Your macOS DataGridView uses NSTableView (AppKit) which handles 100K+ rows with native virtual scrolling and cell editing. A web-based table in Tauri WebView will never match this performance. You MUST use TanStack Virtual or a similar virtualization library, and you'll still see worse scroll performance on datasets >50K rows. This is the single biggest user-visible quality gap.

2. **Two codebases is a tax you'll pay forever.** There is no magical way around this. Every `DataChangeManager` feature, every `SQLStatementGenerator` fix, every new `PluginDatabaseDriver` method must be implemented in both Swift and Rust+TypeScript. Budget 30% overhead. If you have 1 developer, this means the macOS version effectively freezes while Windows ships.

3. **The C library compilation gauntlet.** You have 8 C libraries that need Windows static builds. vcpkg is the path, but libmariadb and libpq have known static build issues on Windows (GitHub issues linked). Budget 2-4 weeks of pure build system work before writing any application code.

4. **SSH tunnels will bite you.** Your `SSHTunnelManager` spawns `/usr/bin/ssh` via `Process`. Windows doesn't have this. You'll need libssh2 (Rust: `ssh2` crate) or bundle OpenSSH binaries. Key management, agent forwarding, and ProxyJump will all behave differently. Budget 1-2 weeks.

5. **WebView2 runtime dependency.** It's pre-installed on Windows 10 21H2+ and Windows 11, but some enterprise environments strip it. You may need a fallback installer. Microsoft provides an Evergreen bootstrapper.

6. **Oracle driver** uses OracleNIO (Swift NIO). No direct Rust equivalent. You'd need to use Oracle OCI (C library) via FFI, or defer Oracle support to v2.

### Phased Migration Strategy (Minimizes Rewrite)

```
Phase 0 (Week 1-3): Foundation
├── Set up Windows dev environment + CI
├── Compile all C libraries via vcpkg (libmariadb, libpq, hiredis, FreeTDS, libmongoc, DuckDB, OpenSSL)
├── Define Rust plugin trait (mirror PluginDatabaseDriver exactly)
└── Scaffold Tauri v2 project from existing tablepro-windows/

Phase 1 (Week 4-8): Core + 2 Drivers
├── Implement PluginDriverAdapter equivalent in Rust
├── Port MySQL driver (most popular, good test case)
├── Port PostgreSQL driver
├── Implement connection manager + connection form UI
├── CodeMirror 6 editor with SQL mode + autocomplete
└── Basic data grid with virtual scrolling

Phase 2 (Week 9-14): Feature Parity Sprint  
├── Port remaining 6 drivers (SQLite, ClickHouse, MSSQL, MongoDB, Redis, DuckDB)
├── Defer Oracle to v2 (OracleNIO has no Rust equivalent)
├── Change tracking (DataChangeManager → Rust)
├── SQL statement generator
├── SSH tunnel manager (libssh2)
├── Import/Export (CSV, SQL, JSON, XLSX)
└── Sidebar + table structure views

Phase 3 (Week 15-18): Polish + Ship
├── Settings UI
├── Query history (SQLite FTS5 storage)
├── License verification
├── Keyboard shortcuts parity
├── Windows installer (MSI/MSIX)
├── Auto-updater (Tauri built-in)
└── Enterprise offline testing
```

### What to Skip for v1
- AI chat integration (defer to v2)
- Plugin registry/auto-download (ship all drivers built-in)
- Oracle driver (no Rust equivalent for OracleNIO)
- Plugin enable/disable UI (all plugins always enabled)
- Vim command-line mode (`:w`, `:q`) — CodeMirror vim handles this, but test coverage may gap

### Key Technical Decisions to Lock Day 1
1. **CodeMirror 6** (not Monaco). Smaller, modular, better vim, offline-native.
2. **Rust cdylib plugins** (not WASM, not embedded). Same model as macOS but with DLLs.
3. **vcpkg** for C library management. Pin versions. Commit lockfile.
4. **DPAPI** for credential storage. Not Windows Credential Manager (size limits).
5. **TanStack Virtual** for data grid virtualization. Benchmark early.
6. **libssh2** via `ssh2` Rust crate for SSH tunnels. No bundled binaries.

---

## Unresolved Questions

1. **Should Oracle be deferred or cut entirely?** OracleNIO is Swift-only. The OCI C library exists but is complex. Team capacity question.
2. **Can the macOS codebase eventually converge to Tauri?** CodeMirror 6 may not match CodeEditSourceEditor's macOS-native feel. Users may notice.
3. **How much of the SQL logic (autocomplete, formatter, dialect provider) should live in Rust vs TypeScript?** Rust = faster, TypeScript = faster to iterate. Recommendation: Rust for hot paths (query parsing, result mapping), TypeScript for UI-adjacent logic (autocomplete popup, formatting display).
4. **Windows ARM64 support?** Tauri supports it. C library availability varies. libmongoc ARM64 builds are untested on Windows.
5. **Enterprise GPO/MDM deployment?** MSIX supports it. Need to test with IT teams early.
