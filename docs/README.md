# TablePro Docs Map

This `docs/` folder holds two things that grew independently and are not
merged: a Mintlify-published site, and the repository-harness engineering
surface (`repository-harness 0.1.10`, installed `898ee781`). Neither replaces
the other — read the section relevant to what you need.

## Mintlify site (`mint dev` to preview, `docs.json` is the nav)

User-facing product documentation, published from this repo.

```text
docs/
├── docs.json, index.mdx, quickstart.mdx, installation.mdx, changelog.mdx
├── features/          one page per user-facing feature
├── databases/          one page per engine (postgres, mysql, mssql, sqlite, mongodb, redis) + overview + ssh-tunneling
├── customization/       settings, appearance, editor-settings
├── development/         setup, building, architecture (mdx overview), code-style,
│                         local-metrics.md, upstream-parity-notes.md
└── journals/            dated session journals (not evergreen — historical)
```

```bash
mint dev              # local preview, from repository root
mint broken-links      # link validation
```

## Engineering state docs (not Mintlify-published; reconciled against source)

Reconciled against current code in commit `56524d89`, which also removed a
fabricated DLL-plugin-loader and health-monitor description that had been
sitting in these files. Update them when architecture/runtime behavior
actually changes; verify the new text against source first — this repo has a
documented history of these files describing things that never existed.

- `system-architecture.md` — canonical architecture doc; scope, source files,
  driver model. `ARCHITECTURE.md` (the harness-expected filename) is a
  pointer to this file, not a duplicate.
- `codebase-summary.md`, `project-overview-pdr.md`, `code-standards.md`,
  `project-roadmap.md`, `project-changelog.md`.

## Harness engineering surface (`repository-harness 0.1.10`)

```text
docs/
├── WORKFLOW.md          this repo's actual task-shape/workflow rules
├── product/              what the app does for its user (README.md)
├── decisions/            ADRs for choices future work must inherit (README.md + 0001..)
├── plans/                 README.md convention note; active/ and completed/ hold
│                          only tracked index READMEs — individual plan files are
│                          gitignored local working notes, see docs/plans/README.md
├── templates/             exec-plan.md, decision.md, application-runbook.md,
│                          harness-improvement.md
└── patterns/               encoding-invariants.md
```

`product/`, `decisions/`, and `plans/` are the harness's own working-memory
surface — separate from the Mintlify `features/`/`databases/` pages above,
which are the published, user-facing description of the same behavior.
`decisions/` records *why* something is the way it is and what future work
must not silently reverse; `features/`/`databases/` record *what it does* for
a reader who is not going to read source. Both can be true about the same
behavior; they are not duplicates of each other.

## Root-level, not under `docs/`

- `README.md`, `README.vi.md` — project readme (English/Vietnamese)
- `CHANGELOG.md` — `[Unreleased]` + released versions
- `AGENTS.md` / `CLAUDE.md` — agent-facing repository instructions
- `plans/` (repository root, not `docs/plans/`) — an older, pre-harness plan
  archive (`YYMMDD-slug/` directories going back to the Windows port). Not
  part of the harness convention; left as historical record.
- `memory.md` — accumulated crash-triage findings, read before debugging a
  recurring crash (see AGENTS.md's "Crash triage" section).

## Rules

- Keep implementation claims evidence-based — verify against source, a
  commit, or a runnable command before writing them down.
- Windows-only, personal, non-profit fork — no macOS code or docs belong here.
- Keep each markdown file under 800 lines.
- Prefer relative links that resolve inside `docs/`.
