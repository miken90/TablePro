# Phase 6: Polish, Packaging & QA

**Duration:** 2-4 weeks | **Team:** All devs
**Gate:** All benchmark gates pass, MSI installer works offline, E2E test suite green

## Packaging Strategy (Enterprise Offline)

### Installer Options

| Format | Use Case | Tool |
|--------|----------|------|
| **MSI** (primary) | Enterprise GPO deployment, silent install | Tauri NSIS/WiX |
| **NSIS** (secondary) | User-facing installer with wizard | Tauri built-in |
| **Portable ZIP** | No-install, USB deployment | Manual zip of app dir |

### MSI Requirements for Enterprise Offline

```
TablePro-1.0.0-x64.msi
├── TablePro.exe                    # Main Tauri binary
├── WebView2Loader.dll              # WebView2 bootstrap
├── plugins/
│   ├── driver-postgres.dll         # PostgreSQL driver
│   ├── driver-mysql.dll            # MySQL driver
│   └── driver-mssql.dll            # SQL Server driver
├── resources/
│   ├── sql-keywords.json           # Completion data
│   └── default-settings.json
└── Microsoft.WebView2.FixedVersionRuntime/  # Embedded WebView2
```

### WebView2 Strategy

Enterprise machines may not have WebView2 installed and may block downloads.

**Option A (Recommended):** Evergreen Bootstrapper
- Tauri default: downloads WebView2 if missing
- Problem: won't work offline

**Option B:** Fixed Version Runtime (bundled)
- Bundle WebView2 runtime inside installer (~150MB increase)
- Set `WEBVIEW2_RUNTIME_PATH` env var or registry key
- Guaranteed offline install

**Decision:** Ship both:
1. Standard installer (40MB, assumes WebView2 present or downloads it)
2. Enterprise installer with bundled WebView2 (190MB, fully offline)

### Tauri Config for Packaging

```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/icon.ico"],
    "resources": ["plugins/*.dll", "resources/*"],
    "windows": {
      "webviewInstallMode": {
        "type": "embedBootstrapper"
      },
      "wix": {
        "language": "en-US"
      }
    }
  }
}
```

For enterprise offline build, override:
```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "fixedRuntime",
        "path": "./Microsoft.WebView2.FixedVersionRuntime"
      }
    }
  }
}
```

### Auto-Update (Non-Enterprise)

Tauri Updater plugin with static JSON endpoint:
- Check `https://releases.tablepro.app/windows/latest.json`
- Download delta or full installer
- Enterprise mode: disable updater entirely via config flag

### Code Signing

- Sign with EV code signing certificate (required for Windows SmartScreen)
- Sign MSI, NSIS installer, and all `.exe`/`.dll` files
- Use `signtool.exe` in CI pipeline

## QA Test Plan

### Manual Test Matrix

| Test | PG | MySQL | MSSQL |
|------|----|----|-------|
| Connect (user/pass) | ☐ | ☐ | ☐ |
| Connect (SSL) | ☐ | ☐ | ☐ |
| Connect (Windows Auth) | N/A | N/A | ☐ |
| List databases | ☐ | ☐ | ☐ |
| List tables | ☐ | ☐ | ☐ |
| List columns + types | ☐ | ☐ | ☐ |
| List indexes | ☐ | ☐ | ☐ |
| List foreign keys | ☐ | ☐ | ☐ |
| Execute SELECT | ☐ | ☐ | ☐ |
| Execute INSERT | ☐ | ☐ | ☐ |
| Execute UPDATE | ☐ | ☐ | ☐ |
| Execute DELETE | ☐ | ☐ | ☐ |
| Execute multi-statement | ☐ | ☐ | ☐ |
| Cancel long query | ☐ | ☐ | ☐ |
| Pagination (100K rows) | ☐ | ☐ | ☐ |
| Edit cell + save | ☐ | ☐ | ☐ |
| Add row + save | ☐ | ☐ | ☐ |
| Delete row + save | ☐ | ☐ | ☐ |
| Undo/redo | ☐ | ☐ | ☐ |
| Export CSV | ☐ | ☐ | ☐ |
| Export JSON | ☐ | ☐ | ☐ |
| Export SQL | ☐ | ☐ | ☐ |
| Export XLSX | ☐ | ☐ | ☐ |
| Schema DDL | ☐ | ☐ | ☐ |
| Database switch | ☐ | ☐ | ☐ |
| Schema switch | ☐ | N/A | ☐ |
| Safe mode | ☐ | ☐ | ☐ |
| Vim mode | ☐ | ☐ | ☐ |
| Autocomplete | ☐ | ☐ | ☐ |
| Dark/Light theme | ☐ | ☐ | ☐ |

### Automated Tests

**Rust unit tests:**
- Plugin SDK serialization round-trips
- SQL statement generator (INSERT/UPDATE/DELETE for each dialect)
- SQL escaping per dialect
- Connection config validation
- Settings persistence

**Rust integration tests:**
- Plugin loading/unloading lifecycle
- PostgreSQL driver against test container
- MySQL driver against test container
- MSSQL driver against test container

**TypeScript unit tests (Vitest):**
- Zustand store logic (change tracking, undo/redo)
- SQL context analyzer (completion context detection)
- Column type categorization
- Filter SQL generation

**E2E tests (Playwright + WebDriver):**
- App launches and shows welcome screen
- Create connection → connect → see schema
- Execute query → see results
- Edit cell → save → verify in DB
- Export to CSV → verify file content

### Performance Benchmarks (CI-enforced)

```yaml
# .github/workflows/benchmark.yml
benchmarks:
  cold-start:
    max: 3000ms
    measure: "time from process start to window interactive"
  idle-ram:
    max: 150MB
    measure: "resident memory after connect, idle 30s"
  100k-fetch:
    max: 2000ms
    measure: "IPC round-trip for SELECT * with 100K rows"
  editor-keystroke:
    max: 16ms
    measure: "input event to render (Chrome DevTools Performance)"
  autocomplete:
    max: 100ms
    measure: "trigger to popup visible"
  msi-size:
    max: 80MB
    measure: "standard installer (no bundled WebView2)"
```

## Implementation Steps

### Week 1: Testing & Bug Fixes

- [x] Write Rust unit tests for all services (30+ tests minimum)
- [x] Write TypeScript unit tests for stores and utilities (30+ tests)
- [ ] Set up Playwright for E2E tests (5 critical paths)
- [x] Fix all bugs found during testing
- [ ] Performance profiling:
  - Chrome DevTools for frontend (paint, layout, JS)
  - `tokio-console` for Rust async tasks
  - Windows Performance Monitor for memory
- [ ] Optimize any benchmark failures

### Week 2: Packaging & CI

- [x] Configure Tauri for MSI + NSIS builds
- [ ] Create enterprise build script (bundles WebView2 fixed runtime)
- [x] Set up GitHub Actions for Windows build:
  - Build Rust backend (including all 3 driver DLLs)
  - Build frontend
  - Package MSI + NSIS
  - Run unit tests
  - Sign artifacts (when cert available)
- [x] Create portable ZIP variant
- [ ] Test installer on clean Windows 10 VM
- [ ] Test installer on clean Windows 11 VM
- [ ] Test offline install (no internet at all)
- [x] Create `CHANGELOG.md` for Windows release

### Week 3-4 (Buffer): Final Polish

- [ ] Accessibility audit (keyboard navigation, screen reader basics)
- [ ] High-DPI testing (100%, 125%, 150%, 200% scaling)
- [ ] Memory leak testing (connect/disconnect 100 times, check RSS)
- [ ] Stress testing (open 10 connections, 50 tabs, 1M row table)
- [ ] Documentation: Windows-specific README
- [ ] Beta distribution to 3-5 enterprise testers
- [ ] Address beta feedback
- [ ] Final benchmark run — all gates must pass
- [ ] Tag v1.0.0-windows release

## Release Artifacts

```
releases/
├── TablePro-1.0.0-x64-setup.exe       # NSIS installer (user-facing)
├── TablePro-1.0.0-x64.msi             # MSI (enterprise GPO)
├── TablePro-1.0.0-x64-enterprise.msi  # MSI with bundled WebView2
├── TablePro-1.0.0-x64-portable.zip    # No-install
└── checksums.sha256
```

## Success Criteria

1. All benchmark gates pass (see plan.md table)
2. MSI installs on clean Windows 10/11 without internet
3. Enterprise MSI works without pre-installed WebView2
4. No P0/P1 bugs in manual test matrix
5. E2E test suite passes on CI
6. Memory stable after 4-hour soak test (no leak > 50MB)
