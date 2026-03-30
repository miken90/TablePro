# Brainstorm Report: Windows conversion strategy

## Problem statement
- Convert TablePro from macOS SwiftUI/AppKit to Windows.
- v1 target: all user-visible feature parity, advanced SQL editor parity (multi-cursor/autocomplete/vim), keep plugin behavior, enterprise offline runtime.
- Constraints: small team (1-3), 3-6 months, balanced CPU/RAM, priority drivers first: PostgreSQL, MySQL, SQL Server.

## Brutal feasibility check
- Full parity in 3-6 months with 1-3 engineers is high risk. Not impossible, but margin thin.
- Direct Swift code reuse on Windows is near-zero for UI/runtime; this is mostly rewrite, not port.
- Biggest technical risk is large-result data grid performance on web-rendered UI.

## Evaluated approaches

### 1) Tauri v2 + Rust core + TypeScript UI + CodeMirror 6 (recommended)
- Pros: fastest dev loop for small team, strong editor parity path, existing cross-platform trajectory, low overhead backend in Rust.
- Cons: data grid perf risk in WebView2, plugin ABI complexity across DLL boundaries.
- Feasibility score: 7.5/10.

### 2) Qt 6 + C++
- Pros: best native grid/render perf, mature desktop controls, close plugin-loader mental model.
- Cons: slower delivery velocity, higher complexity, editor parity cost higher (vim/autocomplete stack custom work).
- Feasibility score: 6.6/10.

### 3) WinUI 3 + C#
- Pros: native Windows UX/tooling.
- Cons: Windows-only dead-end, harder to match advanced editor behavior quickly, .NET/native-driver boundary friction.
- Feasibility score: 5.2/10.

## Final recommendation
- Use Tauri v2 + Rust + TypeScript + CodeMirror 6.
- Keep plugin behavior via Rust dynamic loading (`libloading`) and C ABI vtable boundary.
- Enforce benchmark gates early; decide pivot quickly if grid perf fails.

## Structure and language/framework check
- Runtime/core language: Rust.
- UI language: TypeScript (React).
- Windows shell/framework: Tauri v2 + WebView2.
- SQL editor stack: CodeMirror 6 + vim extension + custom SQL completion provider.
- Plugin contract: C ABI (`#[repr(C)]`) DLL interface, versioned API.
- Storage/security mapping: DPAPI for secrets, SQLite for query history, JSON for tabs/settings.

## Performance optimization strategy
- Define hard gates from week 1: startup, idle RAM, keystroke latency, large-grid render.
- Use virtualized grid only; no full materialization for big result sets.
- Push heavy query/data transforms to Rust side, keep UI thread light.
- Stream results in chunks over IPC; avoid giant JSON payload spikes.
- Profile each milestone with fixed datasets; block feature creep if gates fail.

## Risks and mitigations
- WebView2 grid bottleneck: run 100K-row benchmark in phase 1; if fail twice after optimization, pivot grid architecture.
- Plugin ABI crash class: strict memory ownership rules + compatibility tests per driver.
- Scope collapse risk: if schedule exceeds 2x in any phase, de-scope to PG/MySQL first and move SQL Server to next release.
- Offline enterprise constraints: ship bundled WebView2 installer variant and signed offline artifacts.

## Success metrics
- Cold start < 3s.
- Idle RAM < 150MB.
- 100K row first render < 2s.
- Editor keystroke latency < 16ms p95.
- No internet dependency at runtime.

## Decisions agreed
- v1 parity means all user-visible features.
- Advanced SQL editor parity required in v1.
- Enterprise offline means no runtime internet.
- Driver priority if forced: PostgreSQL, MySQL, SQL Server.

## Next steps
- Use implementation plan at `plans/260312-1226-windows-port-implementation/`.
- Execute phase 1 benchmark gate before deep feature migration.
- Keep weekly risk review against benchmark/fallback criteria.
