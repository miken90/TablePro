# TablePro Project Roadmap

## Current snapshot (2026-03-18)

TablePro is maintained as a dual-platform project:

- **macOS**: stable release line
- **Windows**: active Tauri/Rust/React implementation in this repository

Phase naming below reflects delivery intent, while status labels reflect what is currently implemented in source.

## Phase status overview

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — macOS foundation | Complete | Stable macOS product line exists in repo as reference/source |
| Phase 2 — Windows core port | Complete in codebase | Core runtime, plugin loader, IPC commands, history, editing path are implemented |
| Phase 2.5 — Optimize & Harden | Complete in codebase | Credential encryption, export identifier quoting, async blocking isolation, import/export memory hardening, frontend perf fixes, and modularization landed from plan `plans/260318-optimize-harden/plan.md` |
| Phase 3 — parity and expansion | Planned | Linux target, broader driver parity, and advanced features remain roadmap work |

## Phase 1 — macOS foundation (completed)

Scope delivered in historical product line:

- SQL editor, data grid, connection workflows
- Plugin-based driver model
- Import/export and query history workflows

No active implementation changes are planned in this repository under `TablePro/` during Windows-focused work.

## Phase 2 — Windows core port (implemented in repository)

### Implemented capabilities in source

- Tauri app runtime and command registration in `src-tauri/src/lib.rs`
- Session-based connection/query lifecycle via `ConnectionManager`
- Plugin loading via `libloading` and `PluginVTable` ABI
- Query, schema, storage, history, import, export command surface
- Zustand stores for connection/session mapping, query, editor tabs, history, settings
- SQLite history store with FTS-backed search

### Remaining stabilization targets before broad release claims

- ~~Security hardening for credential persistence~~ ✅ done (DPAPI encryption in `credential_store.rs`)
- Additional release QA and packaging validation against current behavior
- Documentation parity checks as backend/frontend continue to evolve

## Phase 3 — parity and expansion (planned, not complete)

### Objectives (planned)

- [ ] Cross-platform parity gap closure for remaining features
- [ ] Expanded driver coverage and consistency checks
- [ ] Linux distribution planning and implementation
- [ ] Optional AI/parity features alignment across platforms

### Candidate milestone sequence (planning baseline)

| Milestone | Target outcome | Status |
|---|---|---|
| 3.1 | Parity gap inventory + closure plan | Planned |
| 3.2 | Security/storage hardening pass | ✅ Complete (DPAPI, SQL quoting, async I/O, modularization) |
| 3.3 | Linux packaging prototype | Planned |
| 3.4 | v1.0 readiness review | Planned |

## Release-readiness checklist semantics

Use these markers consistently:

- ✅ = completed in current source and verified
- ⏳ = in progress
- ☐ = planned / not started

Current checklist snapshot:

- ✅ Session-based query + schema commands use `session_id`
- ✅ Plugin loader uses `tablepro_plugin_init` + metadata + API version validation
- ✅ History persistence uses `history.sqlite3` + FTS table/triggers
- ✅ Frontend tab state persists via Zustand localStorage
- ✅ Saved-connection at-rest encryption (`dpapi:` format in `connection_store`)
- ⏳ Ongoing docs synchronization against active Windows source changes

## Risks and tracking focus

### High-risk stale zones

1. Plugin ABI docs drifting from `plugin/manager.rs`
2. Storage/security docs overstating encryption state
3. Query-flow docs regressing to old `connection_id` language

### Mitigation

- Require evidence-based doc updates from exact source files before release tags
- Re-run docs validation and link checks after each docs refresh

## Update cadence

- Update roadmap status when implementation state changes in `tablepro-windows/src-tauri/src/*` command/plugin/storage paths
- Update planned milestones only after maintainer agreement

---

**Last Updated**: 2026-03-18  
**Current Delivery State**: Phase 2 implementation present in codebase; Phase 3 planned