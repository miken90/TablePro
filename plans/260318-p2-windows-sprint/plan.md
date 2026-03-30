---
title: "P2 Windows Sprint — Quick Wins Before v1.0"
description: "16 P2 features closing UX gaps, adding auto-updater, connection polish, grid QoL, and remaining export/import features"
status: completed
priority: P2
effort: 18-24d (parallel agents)
tags: [windows, parity, ux, auto-updater, connection, grid, export]
created: 2026-03-18
---

# P2 Windows Sprint — Quick Wins Before v1.0

## Context

After P0 + P1 + Optimize & Harden, Windows parity is ~74%. This sprint closes the remaining UX gap with 16 quick-win features before v1.0 release. All items are S or M size — no XL items (MongoDB, Redis, AI deferred to v1.1).

## Phase Summary

| # | Phase | Features | Est. Effort | Parallel? | Status |
|---|-------|----------|-------------|-----------|--------|
| 1 | Auto-Updater | Tauri updater plugin | 2-3d | Single | [x] |
| 2 | Connection Polish | URL import, color, tags, startup commands | 3-4d | Yes (2) | [x] |
| 3 | Grid QoL | Copy as SQL, ENUM picker, approx row count | 4-5d | Yes (2) | [x] |
| 4 | Filter & Search | Quick search bar, filter presets | 3-4d | Yes (2) | [x] |
| 5 | Query & Structure | Query progress events, Create Table wizard | 5-7d | Yes (2) | [x] |
| 6 | Polish & Packaging | Code signing, preview tabs | 2-3d | Yes (2) | [x] |

**Total sequential: ~19-26 days**
**Total with parallel agents: ~11-16 days**

## Phases

→ [Phase 1: Auto-Updater](./phase-01-auto-updater.md)
→ [Phase 2: Connection Polish](./phase-02-connection-polish.md)
→ [Phase 3: Grid QoL](./phase-03-grid-qol.md)
→ [Phase 4: Filter & Search](./phase-04-filter-search.md)
→ [Phase 5: Query & Structure](./phase-05-query-structure.md)
→ [Phase 6: Polish & Packaging](./phase-06-polish-packaging.md)

## Dependencies

```
Phase 1 (Auto-Updater) → independent (highest impact)
Phase 2 (Connection Polish) → independent
Phase 3 (Grid QoL) → independent
Phase 4 (Filter & Search) → independent
Phase 5 (Query & Structure) → independent
Phase 6 (Polish) → all other phases complete
```

Phases 1-5 parallelizable. Phase 6 runs last.

## Success Criteria

- [x] Tauri auto-updater checks + downloads + installs updates
- [x] Connection URL import parses `mysql://`, `postgresql://`, `mssql://`
- [x] Connection color picker + tags visible in sidebar
- [x] Startup commands execute after connect
- [x] Copy row as INSERT SQL via context menu
- [x] ENUM/SET columns show dropdown picker
- [x] Approximate row count shows instantly for large tables
- [x] Quick search bar filters grid rows
- [x] Filter presets save/load/delete
- [x] Query progress events reach frontend
- [x] Create Table wizard generates + executes DDL
- [x] MQL export ~~generates valid insertMany syntax~~ (DROPPED — no MongoDB driver)
- [x] Preview tabs (single-click = preview, edit/ctrl-click = permanent)
- [x] `cargo test` + `cargo clippy` clean
- [x] `npx vitest run` all pass
- [x] `npm run tauri build` succeeds
