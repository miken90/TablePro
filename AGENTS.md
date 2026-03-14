# AGENTS.md

This file provides guidance when working with code in this repository.

## Role & Responsibilities

Analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows

- Primary workflow: `$HOME/AGENTS.md`
- Development rules: `$HOME/AGENTS.md`
- Orchestration protocols: `$HOME/AGENTS.md`
- Documentation management: `$HOME/AGENTS.md`

**IMPORTANT:** Analyze the skills catalog and activate relevant skills during the process.
**IMPORTANT:** Follow development rules in `$HOME/AGENTS.md` strictly.
**IMPORTANT:** Sacrifice grammar for concision in reports. List unresolved questions at end.

## Project Overview

TablePro Windows — a Windows database client built with Tauri v2 + Rust + TypeScript/React. Ported from the macOS version (SwiftUI + AppKit).

- **Windows source (ACTIVE)**: `tablepro-windows/` — Tauri v2 + Rust backend (`src-tauri/`) + React/TypeScript frontend (`src/`)
- **macOS source (READ-ONLY reference)**: `TablePro/`, `Plugins/`, `Libs/` — Swift codebase. **Do NOT modify, build, or run.** Use only to understand feature behavior, protocols, and logic when porting.
- **Plans**: `plans/` — implementation plans, reports, phase files

## WSL + Windows Environment

**CRITICAL:** This project runs inside WSL (Windows Subsystem for Linux). **ALL build/run/test commands target Windows** and MUST use `powershell.exe`:

```bash
# Build, run, test — always via powershell.exe
powershell.exe -Command "cd tablepro-windows; npm install"
powershell.exe -Command "cd tablepro-windows; npm run tauri dev"
powershell.exe -Command "cd tablepro-windows; npm run tauri build"
powershell.exe -Command "cd tablepro-windows; cargo test --manifest-path src-tauri/Cargo.toml"
powershell.exe -Command "cd tablepro-windows; cargo clippy --manifest-path src-tauri/Cargo.toml"
powershell.exe -Command "cd tablepro-windows; npx vitest run"
```

- **Use native bash** only for: git, gh, file operations, reading macOS reference code
- **Path translation**: `wslpath -w` (WSL→Windows), `wslpath -u` (Windows→WSL)
- **NEVER run** `xcodebuild`, `swiftlint`, `swiftformat`, or any macOS toolchain command — they don't apply here

## macOS Reference Codebase

The Swift codebase under `TablePro/` and `Plugins/` is **reference-only** for understanding:

- Feature behavior and user flows
- Protocol/interface contracts (`DatabaseDriver`, `PluginDatabaseDriver`)
- Data models (`QueryResult`, `ColumnInfo`, `TableInfo`, etc.)
- Business logic patterns (change tracking, SQL generation, autocomplete)
- Storage schemas (connection config, query history, tab state)

**Rules for reference code:**
- Read Swift files to understand WHAT a feature does, then implement in Rust/TypeScript
- Never copy Swift syntax — translate to idiomatic Rust or TypeScript
- The macOS architecture docs in `docs/development/` describe patterns to port

## Architecture (Windows)

### Plugin System

Driver plugins are `.dll` files loaded via Rust `libloading` with C ABI vtable (`PluginVTable`):

- **plugin-sdk** crate — shared FFI types (`FfiStr`, `FfiResult`, `FfiQueryResult`, `PluginVTable`)
- **PluginManager** (`src-tauri/src/plugin/manager.rs`) — DLL discovery, loading, API version validation
- **PluginDriverAdapter** (`src-tauri/src/plugin/adapter.rs`) — FFI → Rust `DatabaseDriver` trait
- Each driver: separate `cdylib` crate (`driver-postgres/`, `driver-mysql/`, `driver-mssql/`)

### Editor

CodeMirror 6 with `@codemirror/lang-sql`, `@replit/codemirror-vim`, custom autocomplete source.

### Change Tracking Flow

1. User edits cell → Zustand `changeStore` records change
2. User clicks Save → Rust `sql_generator` produces INSERT/UPDATE/DELETE
3. Undo/redo via Zustand store stack
4. IPC `data:save_changes` wraps in transaction on Rust side

### Storage

| What                 | Implementation                              |
| -------------------- | ------------------------------------------- |
| Connection passwords | DPAPI (`CryptProtectData`)                  |
| User preferences     | JSON in `%APPDATA%/TablePro/settings.json`  |
| Query history        | SQLite FTS5 via `rusqlite`                  |
| Tab state            | JSON in `%APPDATA%/TablePro/tabs/`          |
| Filter presets       | JSON in `%APPDATA%/TablePro/`               |

### Logging

Rust: `tracing` crate with structured logging. Never `println!()` in production code.

## Semantic Code Search (cocoindex-code)

Use the `cocoindex-code` MCP server's `code_search` tool for semantic code search when:
- Searching for code by meaning or description rather than exact text
- Exploring unfamiliar parts of the codebase
- Looking for implementations without knowing exact names
- Finding similar code patterns or related functionality

Use grep/glob instead when searching for exact string literals, known identifiers, or listing files by type.

## Code Style

### Rust

- Follow `cargo clippy` warnings — treat as errors
- `rustfmt` for formatting
- Explicit error types, no `unwrap()` in production code
- `#[repr(C)]` for all FFI boundary types

### TypeScript

- ESLint + Prettier
- Strict TypeScript (`strict: true`)
- Functional React components with hooks
- Zustand for state management

## Mandatory Rules

These are **non-negotiable** — never skip them:

1. **CHANGELOG.md**: Update under `[Unreleased]` section for new features and notable changes. Don't add "Fixed" for fixing unreleased features.

2. **Documentation**: Update docs in `docs/` (Mintlify-based) when adding/changing features.

3. **Test-first correctness**: When tests fail, fix the **source code** — never adjust tests to match incorrect output.

4. **Lint after changes**: `cargo clippy` (Rust) + `npx eslint .` (TypeScript). Run via `powershell.exe`.

5. **Commit messages**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Single line only, no description body.

## Python Scripts (Skills)

When running Python scripts from skills, use the venv Python interpreter:
- **Linux/macOS:** `skills/.venv/bin/python3 scripts/xxx.py`

**IMPORTANT:** When scripts fail, try to fix them directly.

## [IMPORTANT] Consider Modularization

- If a code file exceeds 200 lines, consider modularizing it
- Check existing modules before creating new
- Use kebab-case naming with descriptive names
- After modularization, continue with main task
- Exception: Markdown, plain text, bash scripts, config files

## Documentation Management

Keep docs in `./docs` folder (Mintlify-based):
```
./docs
├── features/           # Feature documentation
├── databases/          # Per-database guides
├── customization/      # Settings, appearance, editor
├── development/        # Architecture, building, code style
├── api/                # License API
├── vi/                 # Vietnamese translations
└── zh/                 # Chinese translations
```

### Plans

Save plans in `plans/` directory with timestamp and descriptive name.

**Example:** `plans/260312-1226-windows-port-implementation/`

```
plans/
├── YYMMDD-HHMM-feature-name/
│   ├── research/
│   ├── reports/
│   ├── plan.md
│   ├── phase-01-setup.md
│   ├── phase-02-implement.md
│   └── phase-03-test.md
├── reports/
│   └── {type}-{date}-{slug}.md
└── ...
```

## Agent Execution Strategy

- **Plans must include edge cases.** Identify edge cases, thread safety concerns, and boundary conditions as explicit checklist items.
- **Implementation includes self-review.** Check: thread safety, all code paths, error handling, flag/state reset logic.
- **Tests are part of implementation, not a separate step.**
- **Always use team agents** for implementation work.
- **Always parallelize** independent tasks.
- **Main context = orchestrator only.** Read files, launch agents, summarize results, update tracking.
- **Agent prompts must be self-contained.** Include file paths, the specific problem, and clear instructions.
- **Use worktree isolation** for agents making code changes.
- **Implementation standards**: Clean architecture, correct platform approach, proper design patterns, no backward compatibility hacks.

## Performance Pitfalls

- **Never send >1MB JSON payloads** over Tauri IPC in a single invoke — stream in chunks.
- **Virtualize all large lists** (DataGrid, sidebar tree) — never render full DOM for >1K items.
- **Coalesce IPC progress events** — don't spam frontend at >30fps.
- **No `unwrap()` on user data** — always handle errors gracefully.

## Writing Style (Docs & Marketing Copy)

Write like a developer, not a marketing AI. Be specific over generic.

**Banned words**: seamless, robust, comprehensive, intuitive, effortless, powerful (as filler), streamlined, leverage, elevate, harness, supercharge, unlock, unleash, dive into, game-changer, empower, delve.

---

## Rule: development-rules

# Development Rules

**IMPORTANT:** Follow **YAGNI** - **KISS** - **DRY** principles always.

## General
- **File Naming**: kebab-case with descriptive names (self-documenting for LLM tools)
- **File Size**: Keep code files under 200 lines
- Use `gh` for Github, `psql` for Postgres debugging
- **[IMPORTANT]** Follow codebase structure and code standards during implementation
- **[IMPORTANT]** Implement real code, not simulations or mocks
- **[IMPORTANT]** All compile/build/test commands run via `powershell.exe`

## Code Quality
- Ensure no syntax errors and code compiles
- Prioritize functionality and readability
- Use try-catch error handling & cover security standards

## Pre-commit/Push Rules
- Run linting before commit (Rust: `cargo clippy`, TS: `npx eslint .`) — via `powershell.exe`
- Run tests before push (DO NOT ignore failed tests)
- **DO NOT** commit secrets (dotenv, API keys, credentials)
- Use conventional commit format, no AI references

## Code Implementation
- Write clean, readable, maintainable code
- Follow established architectural patterns
- Handle edge cases and error scenarios
- **DO NOT** create new enhanced files, update existing files directly

---

## Rule: documentation-management

# Project Documentation Management

### Roadmap & Changelog Maintenance
- **CHANGELOG.md**: Track releases and unreleased changes
- **Documentation** (`./docs`): Mintlify-based feature docs

### Update Protocol
1. **Before Updates**: Read current state
2. **During Updates**: Maintain version consistency and formatting
3. **After Updates**: Verify links, dates, cross-references
4. **Quality Check**: Ensure updates align with actual progress

---

## Rule: orchestration-protocol

# Orchestration Protocol

## Delegation Context (MANDATORY)

When spawning subagents, **ALWAYS** include:
1. **Work Context Path**: Git root of primary files
2. **Reports Path**: `{work_context}/plans/reports/`
3. **Plans Path**: `{work_context}/plans/`

#### Sequential Chaining
- **Planning → Implementation → Testing → Review**: Feature development
- **Research → Design → Code → Documentation**: New components
- Each agent completes fully before next begins

#### Parallel Execution
- Independent components can run in parallel
- Ensure no file conflicts or shared resource contention
- Plan integration points before parallel execution

---

## Rule: primary-workflow

# Primary Workflow

**IMPORTANT:** Activate relevant skills as needed. Ensure token efficiency.

#### 1. Code Implementation
- Delegate to `planner` agent first for implementation plan
- Use `researcher` agents in parallel for technical research
- **[IMPORTANT]** After modifying code, run compile check via `powershell.exe`
- **[IMPORTANT]** Read macOS Swift code as reference, implement in Rust/TypeScript

#### 2. Testing
- Delegate to `tester` agent on the **final code**
- **DO NOT** ignore failing tests
- **DO NOT** use fake data, mocks, tricks to pass builds
- Fix failing tests and re-test until all pass

#### 3. Code Quality
- Delegate to `code-reviewer` agent after tests pass

#### 4. Integration
- Follow the plan from `planner` agent
- Delegate to `docs-manager` agent to update docs

#### 5. Debugging
- Delegate to `debugger` agent for issue analysis
- Fix based on report, then re-test

---

## Rule: team-coordination-rules

# Team Coordination Rules

> Only apply when operating as a teammate within an Agent Team.

## File Ownership (CRITICAL)
- Each teammate MUST own distinct files — no overlapping edits
- Define ownership via glob patterns in task descriptions
- Tester owns test files only

## Git Safety
- Prefer git worktrees for parallel work
- Never force-push from a teammate session
- Commit frequently with descriptive messages

## Report Output
- Save reports to `plans/reports/`
- Naming: `{type}-{date}-{slug}.md`
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

## Task Claiming
- Claim lowest-ID unblocked task first
- Set task to `in_progress` before starting work
- If all tasks blocked, notify lead

## CI/CD

GitHub Actions for Windows builds: cargo build → npm build → tauri build → MSI/NSIS packaging → code signing.
