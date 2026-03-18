# TablePro Code Standards

## 1. Purpose

These standards define how to keep TablePro code and docs maintainable while matching the current repository structure.

Scope:

- Active implementation: `tablepro-windows/` (Rust + TypeScript)
- Reference implementation: `TablePro/` (Swift, read-only in Windows tasks)
- Documentation: `docs/`

## 2. Ground rules

- Keep changes small, explicit, and testable
- Prefer existing modules over new abstractions
- Match existing naming/casing in each language
- Avoid speculative documentation; only document verified behavior

## 3. Repository-aware structure expectations

### 3.1 Windows backend (`tablepro-windows/src-tauri/src/`)

Current module layout:

```text
src-tauri/src/
├── lib.rs
├── main.rs
├── commands/
├── models/
├── plugin/
├── services/
└── storage/
```

Notes:

- Command handlers live in `commands/*.rs`
- Session orchestration is in `services/connection_manager.rs`
- Plugin host behavior is in `plugin/manager.rs` and `plugin/adapter.rs`
- Persistence backends are under `storage/`

### 3.2 Windows frontend (`tablepro-windows/src/`)

Current module layout:

```text
src/
├── App.tsx
├── components/
├── editor/
├── hooks/
├── ipc/
├── stores/
├── styles/
└── types/
```

Notes:

- Store filenames are camelCase (for example `connectionStore.ts`, `queryStore.ts`)
- Component names are mixed PascalCase / kebab-case; do not rename for style-only changes
- Keep import paths and naming consistent with existing files

## 4. File size and modularity guidance

- Prefer code files under ~200 LOC when practical
- Mandatory docs cap: keep docs markdown files under 800 LOC
- If a file grows too large, split by responsibility, not by arbitrary line count

## 5. Rust standards (Windows backend)

### 5.1 Error handling

- Return `Result<T, AppError>` across command/service boundaries
- Do not use `unwrap()` on runtime/user-controlled data paths
- Use typed error variants over opaque strings when possible

### 5.2 Async and locking

- Use `tokio` async patterns end-to-end
- Keep mutex lock scope minimal; clone/get required state, then release lock before long awaits

### 5.3 Logging

- Use `tracing` macros (`info!`, `warn!`, `error!`, `debug!`)
- Avoid `println!` for production paths

### 5.4 FFI/plugin boundary

- Keep ABI structs/types consistent with `tablepro_plugin_sdk`
- Respect vtable lifecycle and pointer ownership contracts
- Guard FFI calls where panic propagation could cross boundary

## 6. TypeScript/React standards (Windows frontend)

### 6.1 Types and IPC

- Keep `invoke` calls inside typed wrappers in `src/ipc/commands.ts`
- Prefer explicit interface/type definitions in `src/types/`
- Avoid `any` except where unavoidable interop forces it

### 6.2 Store design

- Keep Zustand stores focused by domain (connection/query/schema/history/settings)
- Keep state/action naming explicit (`loadX`, `saveX`, `setX`)
- Persist only data that should survive restart (for example editor tabs)

### 6.3 Components

- Functional components with hooks only
- Lift cross-feature state into stores when needed
- Keep large layout components readable by extracting UI subcomponents

## 7. Security and data handling standards

### 7.1 Documentation accuracy requirement

Security claims in docs must match implementation.

Current implementation reality to preserve in docs until changed:

- `connections.json` stores serialized saved connection data directly
- Do not claim at-rest encryption for saved connection passwords today

### 7.2 Secret hygiene

- Never commit credentials, tokens, private keys, `.env*` secrets
- Avoid logging sensitive connection fields

## 8. Testing and verification standards

Before finalizing implementation changes (outside docs-only tasks):

- Rust lint: `cargo clippy` (via project-required command context)
- TS lint: `eslint` on frontend sources
- Run relevant tests for touched modules

For docs updates:

- Run docs validation: `node $HOME/.claude/scripts/validate-docs.cjs docs/`
- Fix broken links/path references before completion

## 9. Documentation standards for this repository

- Keep docs specific and implementation-backed
- Use current parameter names (`session_id` in backend commands)
- Distinguish **implemented** vs **planned** with clear wording
- Avoid generic marketing language in engineering docs

Required docs to keep synchronized:

- `docs/project-overview-pdr.md`
- `docs/project-roadmap.md`
- `docs/codebase-summary.md`
- `docs/system-architecture.md`
- `docs/code-standards.md`

## 10. Commit and review expectations

- Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, etc.)
- Keep commit message single-line in this repo workflow
- Include changelog/doc updates when behavior changes

## 11. Stale-risk checklist for reviewers

When reviewing docs/code alignment, verify these first:

1. Plugin ABI entrypoints and discovery paths (`plugin/manager.rs`)
2. Query command signatures (`commands/query.rs`)
3. Storage claims (`storage/connection_store.rs`, `storage/history_store.rs`, editor persistence)
4. Frontend store/component filenames under `src/stores` and `src/components`

---

**Last Updated**: 2026-03-18  
**Applies to**: Current repository state