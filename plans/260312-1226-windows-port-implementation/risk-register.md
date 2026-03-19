# Risk Register

## Critical Risks

| # | Risk | Likelihood | Impact | Mitigation | Fallback |
|---|------|-----------|--------|------------|----------|
| R1 | **FFI ABI instability** — Rust DLL plugins crash due to ABI mismatch between compiler versions | Medium | High | Pin exact rustc version for core + all plugins. Use `#[repr(C)]` everywhere. Never pass Rust types across boundary. | Embed drivers statically (single binary, lose plugin model) |
| R2 | **WebView2 enterprise blocking** — Corporate firewalls block WebView2 download/install | High | High | Ship enterprise MSI with fixed-version WebView2 bundled | Pre-req doc: require IT to install WebView2 via SCCM |
| R3 | **WebView2 rendering perf** — DataGrid with 10K+ visible cells causes jank in Edge WebView | Medium | High | Virtual scroll (only render visible rows). Minimize DOM nodes. Use CSS containment. | Switch DataGrid to native Rust renderer (egui/Slint), keep rest in WebView |
| R4 | **Tiberius MSSQL auth failures** — Windows integrated auth (SSPI/Kerberos) doesn't work in all enterprise AD configs | Medium | Medium | Test against multiple AD setups early (week 4). Support SQL auth as primary, Windows auth as bonus. | Fall back to ODBC via `odbc-api` crate (uses system ODBC driver) |
| R5 | **CodeMirror vim gaps** — Some vim commands from macOS VimEngine not supported | Low | Low | `@replit/codemirror-vim` covers 95%+ of vim. Test all commands from VimEngine.swift. | Ship without vim in v1, add custom implementation in v1.1 |
| R6 | **Installer size bloat** — Bundled WebView2 + 3 driver DLLs + Rust binary > 200MB | Medium | Medium | Compress with NSIS LZMA. Strip debug symbols. Use `opt-level = "z"`. | Accept larger size for enterprise; offer standard (slim) + enterprise (fat) builds |
| R7 | **DPAPI password migration** — Users moving between Windows machines lose saved passwords | Low | Low | Document limitation. Offer manual export/import of connections (without passwords). | Use encrypted file with user-provided master password instead |
| R8 | **Tokio runtime overhead** — Each DLL plugin needs async runtime, but sharing Tokio across DLL boundary is unsafe | Medium | Medium | Plugin DLLs use sync FFI boundary. Core runs Tokio. Plugin internally can use Tokio but calls are sync from core's perspective — core spawns blocking task. | Use `rayon` thread pool instead of Tokio for plugin calls |
| R9 | **Timeline slip** — Feature parity scope too large for 3-6 month window | Medium | High | Strict YAGNI list. Cut scope aggressively. Ship PG+MySQL first if MSSQL slips. | Release "Early Access" with 80% features, iterate monthly |
| R10 | **WebView2 version fragmentation** — Different Windows versions ship different WebView2 versions with different bugs | Low | Medium | Test on Windows 10 1809+ and Windows 11. Pin minimum WebView2 version in installer. | Bundle fixed-version runtime (already planned for enterprise) |

## Risk Mitigation Timeline

| Week | Risk Addressed | Action |
|------|---------------|--------|
| 1 | R3 | Benchmark WebView2 with 10K DOM nodes, measure paint time |
| 1 | R6 | Measure base Tauri binary size + WebView2 bundle size |
| 2 | R8 | Prototype FFI call from core → plugin DLL with Tokio |
| 3 | R1 | Test DLL plugin loading on 3 different Windows versions |
| 4 | R4 | Test tiberius MSSQL with Windows Auth against AD test server |
| 6 | R5 | Run full vim command audit against @replit/codemirror-vim |
| 8 | R9 | Scope check: are we on track? Cut features if behind |
| 14 | R2 | Test enterprise MSI on locked-down corporate VM |
| 16 | R7 | Test password persistence across user profile migration |

## Dependency Risks

| Dependency | Version | Risk | Backup |
|------------|---------|------|--------|
| `tauri` | 2.x | Stable, well-maintained | Pin exact version |
| `tokio-postgres` | 0.7 | Stable | `sqlx` with postgres feature |
| `mysql_async` | 0.34 | Stable | `sqlx` with mysql feature |
| `tiberius` | 0.12 | Less active (last release July 2024) | `odbc-api` via system ODBC |
| `libloading` | 0.8 | Stable, thin wrapper | Direct `LoadLibraryW` calls |
| `@replit/codemirror-vim` | 6.3 | Active, good community | Fork and maintain |
| `@tanstack/react-table` | 8.x | Very active | Build custom (last resort) |
| WebView2 | Evergreen | Microsoft-maintained | Fixed-version bundle |

## Security Considerations

1. **DLL plugin loading** — Only load from app's own `plugins/` directory. Validate digital signature on DLLs in production builds. Never load from `PATH` or user-writable locations.
2. **Password storage** — Use DPAPI (`CryptProtectData`) with current-user scope. Passwords encrypted at rest, only decryptable by the same Windows user.
3. **SQL injection** — All user-edited data goes through parameterized queries. SQL generator uses dialect-aware escaping. Never concatenate user input into SQL strings.
4. **IPC boundary** — Tauri IPC validates command permissions via capabilities. No arbitrary command execution from frontend.
5. **Code signing** — Sign all executables and DLLs with EV certificate to avoid SmartScreen warnings.
