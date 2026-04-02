# Contributing to docs in TablePro

Thanks for helping improve TablePro documentation.

This guide is specific to this repository’s current docs setup.

## What you can edit

You can contribute to:

- Mintlify docs content under `docs/` (`*.mdx`, localized docs, guides)
- Engineering markdown docs under `docs/*.md` (architecture, standards, roadmap, PDR)

## Basic contribution flow

1. Fork and clone the repository
2. Create a feature branch
3. Make your docs changes in `docs/`
4. Validate links and doc consistency
5. Open a pull request

## Local preview

```bash
mint dev
```

Preview at `http://localhost:3000`.

## Validation before PR

Run:

```bash
mint broken-links
node $HOME/.claude/scripts/validate-docs.cjs docs/
```

If a command reports issues, fix them before opening PR.

## Writing rules for this project

- Use direct, technical language
- Keep claims aligned with code in `tablepro-windows/`
- Treat macOS source/docs as upstream/reference unless the doc explicitly targets macOS behavior
- If behavior is not implemented yet, label it **planned**
- Do not claim credential encryption at rest for saved Windows connections unless implementation changes
- Use valid relative links only

## High-value doc update targets

When code changes in these areas, update docs accordingly:

- Plugin loading and ABI (`src-tauri/src/plugin/*`)
- Query command signatures (`src-tauri/src/commands/query.rs`)
- Storage and history behavior (`src-tauri/src/storage/*`, frontend stores)
- Session handling (`src-tauri/src/services/connection_manager.rs`, `src/stores/connectionStore.ts`)

## PR expectations

- Keep changes scoped
- Include evidence-backed updates
- Mention any uncertainty explicitly
- Ensure no broken links in edited docs

## CLA

Contributions require the project CLA as described in root `README.md` / `CLA.md`.
