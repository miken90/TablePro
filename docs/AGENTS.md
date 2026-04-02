# AGENTS.md (docs workspace)

Project-specific guidance for documentation agents working in `docs/`.

## Scope

Allowed edit targets for docs-focused tasks:

- `docs/**`
- root `README.md` only when explicitly requested or required for consistency

Do not modify application source code in docs tasks.

## Primary objective

Keep documentation synchronized with current repository behavior, especially:

- Windows runtime in `tablepro-windows/`
- macOS `TablePro/` only when explicitly documenting upstream/reference behavior
- Plugin ABI and discovery flow
- Session-based IPC command contracts
- Actual storage and security behavior

## Required process

1. Read relevant docs files first
2. Verify claims against source files before writing
3. Prefer exact command/type names from code
4. Mark uncertain or future items as planned
5. Validate docs before finishing

## Source-of-truth files for Windows runtime docs

- `tablepro-windows/src-tauri/src/lib.rs`
- `tablepro-windows/src-tauri/src/plugin/manager.rs`
- `tablepro-windows/src-tauri/src/plugin/adapter.rs`
- `tablepro-windows/src-tauri/src/commands/query.rs`
- `tablepro-windows/src-tauri/src/services/connection_manager.rs`
- `tablepro-windows/src-tauri/src/storage/connection_store.rs`
- `tablepro-windows/src-tauri/src/storage/history_store.rs`
- `tablepro-windows/src/stores/*.ts`

## Accuracy rules

- Do not document APIs/features you cannot verify in code
- Do not claim DPAPI at-rest connection password protection unless implemented in connection storage path
- Use `session_id` terminology for runtime command flow (not deprecated connection-id patterns)
- Confirm links exist before adding them

## Size and structure constraints

- Keep each docs markdown file under 800 lines
- Split content by topic if a file approaches the limit
- Prefer concise sections and tables over long prose blocks

## Validation command

Run after documentation edits:

```bash
node $HOME/.claude/scripts/validate-docs.cjs docs/
```

Fix warnings/errors before marking task complete.

## Reporting format for docs tasks

At completion, report:

1. Files changed
2. Per-file summary
3. Open questions for maintainers
4. Any stale-risk areas still needing follow-up
