# TablePro Docs Workspace Guide

This `docs/` folder contains two documentation tracks:

1. **Mintlify site content** (`*.mdx`, localized docs, product docs)
2. **Engineering state docs** (`project-overview-pdr.md`, `system-architecture.md`, etc.) used for repository alignment

## Current docs folder structure

```text
docs/
├── docs.json
├── index.mdx
├── quickstart.mdx
├── installation.mdx
├── changelog.mdx
├── features/
├── databases/
├── customization/
├── development/
├── vi/
├── project-overview-pdr.md
├── project-roadmap.md
├── codebase-summary.md
├── system-architecture.md
└── code-standards.md
```

## Local docs workflow

```bash
# from repository root
mint dev
```

Optional validation:

```bash
mint broken-links
node $HOME/.claude/scripts/validate-docs.cjs docs/
```

## Documentation rules for this repository

- Keep implementation claims evidence-based
- This is a Windows-only, personal, non-profit fork — no macOS code or docs remain in this repo
- Mark roadmap items as planned until code exists
- Keep each markdown file under 800 lines
- Prefer relative links that resolve inside `docs/`

## Key maintenance targets

Update these files whenever architecture/runtime behavior changes:

- `project-overview-pdr.md`
- `project-roadmap.md`
- `codebase-summary.md`
- `system-architecture.md`
- `code-standards.md`

For root project context, see `README.md` at repository root.
