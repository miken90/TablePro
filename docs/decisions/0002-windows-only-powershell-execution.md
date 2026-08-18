# 0002 Windows-only target, PowerShell as the execution environment

Date: 2026-08-17

## Status

Accepted

## Context

The upstream app was macOS-only (Swift/AppKit). The re-platform to Tauri v2
picked one target OS rather than a cross-platform build. Every script under
`scripts/` is PowerShell (`dev.ps1`, `build-debug.ps1`, `build-release.ps1`,
`bump-version.ps1`); CI (`.github/workflows/windows-build.yml`) runs on
`runs-on: windows-latest` only, with steps in order: `npm ci` → `cargo clippy
--workspace -- -D warnings` → `cargo test --workspace` → `npx vitest run` →
`npx eslint .` → `npm run build` → code signing (if secrets present) → `npx
tauri build`. AGENTS.md states the app is Windows-only, personal, non-profit,
and directs any coding agent working from WSL to run build/test/package
commands from a Windows-drive path via `powershell.exe`, never from a
`/home/...` UNC path.

## Decision

Windows is the only supported platform. PowerShell is the execution
environment for every build, test, and package step, both in CI and for local
development. No macOS/Linux build target, no cross-platform abstraction layer
in the build scripts.

## Alternatives Considered

1. Cross-platform Tauri build (Windows + macOS + Linux) — rejected: single
   maintainer, personal non-profit project, no user base on other platforms,
   and it would roughly triple CI and script maintenance for no current
   demand.
2. Bash/Node-based build scripts for portability — rejected: PowerShell gives
   direct access to Windows-specific packaging (MSI/NSIS via `tauri build`,
   code-signing certificate import) without a shim layer.

## Consequences

Positive:

- One CI matrix cell, one script language, one packaging target — less to
  maintain solo.
- Direct access to Windows Credential Manager, DPAPI, and Windows Event Log
  from the app itself, without cross-platform indirection.

Tradeoffs:

- Any contributor or agent working from WSL/Linux/macOS must cross into a
  Windows-drive path and PowerShell for every build/test/package step; there
  is no native Linux/macOS dev loop.
- If the audience ever needs macOS/Linux, this is a second re-platform, not an
  incremental add — the packaging, credential storage, and file-path
  assumptions are Windows-specific throughout.

## Follow-Up

- None currently planned; revisit only if a real cross-platform need appears.
