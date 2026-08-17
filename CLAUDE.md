# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Role & Responsibilities

Your role is to analyze requirements, delegate to available specialized agents, and keep implementation aligned with this repo's active target: Windows.

## Workflow Inheritance

- Primary workflow: `%USERPROFILE%/.claude/rules/primary-workflow.md`
- Development rules: `%USERPROFILE%/.claude/rules/development-rules.md`
- Orchestration protocols: `%USERPROFILE%/.claude/rules/orchestration-protocol.md`
- Documentation management: `%USERPROFILE%/.claude/rules/documentation-management.md`
- And other workflows: `%USERPROFILE%/.claude/rules/*`

**IMPORTANT:** Analyze the skills catalog and activate relevant skills during the task.
**IMPORTANT:** Follow `%USERPROFILE%/.claude/rules/development-rules.md` strictly.
**IMPORTANT:** Before planning or implementation, always read `./README.md` first.
**IMPORTANT:** When delegating implementation work, only use agent types that exist in the current toolset.
**IMPORTANT:** Sacrifice grammar for concision in reports. List unresolved questions at the end.

## Target Scope (Windows-first)

This repo has two platform codebases, but implementation default is Windows:

- **Primary implementation target:** the repository root
- **Reference-only upstream:** `TablePro/` (macOS Swift/AppKit)

Rules:
1. Implement new features, fixes, tests, and release work at the repository root by default.
2. Use `TablePro/` only to inspect behavior and parity when porting features.
3. Do not run macOS/Xcode build, test, lint, or release flows unless the user explicitly asks for macOS work.

## Project Overview (Windows app)

This repository is a Tauri v2 desktop app using:
- Rust backend (`src-tauri/`)
- React + TypeScript frontend (`src/`)
- Windows DLL plugin drivers (`src-tauri/driver-*`)

## Build, Test, and Release Commands (Default)

Run from the repository root unless noted.

```bash
# Install deps
npm ci

# Frontend dev/build
npm run dev
npm run build

# Frontend quality
npx vitest run
npx eslint .

# Tauri dev/build
npm run dev:tauri
npm run build:debug
npx tauri build

# Release artifacts (PowerShell wrappers)
npm run build:portable
npm run build:installer
npm run build:release
```

Rust commands run from `src-tauri/`:

```bash
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

Version bump (from the repository root):

```bash
powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -Version X.Y.Z
```

## Windows Architecture Snapshot

- **Host app:** Tauri commands/services in `src-tauri/src/commands` and `.../services`
- **Plugin runtime:** DLL loading and ABI bridge in `src-tauri/src/plugin/`
- **Plugin SDK:** `src-tauri/plugin-sdk/`
- **Driver crates:** `src-tauri/driver-postgres`, `driver-mysql`, `driver-mssql`, `driver-sqlite`
- **Frontend app:** React UI and state in `src/`
- **Windows CI:** `.github/workflows/windows-build.yml`

## Porting Flow (macOS parity as reference)

When asked to port a feature:
1. Inspect `TablePro/` for expected behavior, edge cases, and UX intent.
2. Map behavior to the existing Windows architecture.
3. Implement only in Windows paths unless user explicitly asks for macOS edits.
4. Add/adjust Rust and/or TS tests in Windows codebase.
5. Validate with Windows commands above.

## Code Search Priority

- Prefer `ccc` first for semantic and cross-file discovery.
- Use `Grep`/`Glob` for exact symbol or path lookups.
- If needed: `ccc init -f`, `ccc index`, then `ccc search`.
- In Windows Bash with encoding issues: `PYTHONIOENCODING=utf-8 ccc ...`.

## Mandatory Rules

1. **CHANGELOG.md:** Update `[Unreleased]` for notable shipped-facing changes. Documentation-only changes do not require CHANGELOG updates.
2. **Test-first correctness:** If tests fail, fix source behavior. Do not change tests to match broken behavior.
3. **Windows validation:** For Windows implementation changes, run relevant checks from this doc (`vitest`, `eslint`, `cargo test`, `cargo clippy`, `npm run build`).
4. **Commit messages:** Use Conventional Commits, single-line subject.

## Agent Execution Strategy

- Plans must include edge cases, state transitions, and failure paths.
- Implementation includes self-review (thread safety, error handling, state reset, retries/timeouts where relevant).
- Tests are part of implementation, not an afterthought.
- Delegate implementation to available specialized agents.
- Parallelize independent tasks.
- Keep prompts self-contained with explicit file paths and acceptance criteria.
- Use worktree isolation for code-changing agents.

## CI/CD

Windows pipeline source of truth:
- `.github/workflows/windows-build.yml`

Current CI quality bar includes:
- `cargo clippy --workspace -- -D warnings`
- `cargo test --workspace`
- `npx vitest run`
- `npx eslint .`
- `npm run build`
- `npx tauri build`
