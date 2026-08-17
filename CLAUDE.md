# CLAUDE.md

Claude Code guidance for this repository. Project facts, layout, commands,
storage, and rules live in **[AGENTS.md](./AGENTS.md)** — read that first.
This file only adds Claude Code-specific instructions on top.

## Role

Analyze requirements, delegate to available specialized agents, keep
implementation aligned with AGENTS.md.

## Workflow inheritance (global Claude Code rules)

- Primary workflow: `%USERPROFILE%/.claude/rules/primary-workflow.md`
- Development rules: `%USERPROFILE%/.claude/rules/development-rules.md`
- Orchestration protocols: `%USERPROFILE%/.claude/rules/orchestration-protocol.md`
- Documentation management: `%USERPROFILE%/.claude/rules/documentation-management.md`
- Others: `%USERPROFILE%/.claude/rules/*`

**IMPORTANT:** Activate relevant skills for the task from the skills catalog.
**IMPORTANT:** Follow `%USERPROFILE%/.claude/rules/development-rules.md`.
**IMPORTANT:** Read `./README.md` before planning or implementing.
**IMPORTANT:** Only delegate to agent types that exist in the current toolset.
**IMPORTANT:** Sacrifice grammar for concision in reports; list unresolved
questions at the end.

## Code search priority

- Prefer `ccc` first for semantic/cross-file discovery; `Grep`/`Glob` for
  exact symbol or path lookups.
- Bootstrap if needed: `ccc init -f`, `ccc index`, then `ccc search`.
- Encoding issues in Windows Bash: `PYTHONIOENCODING=utf-8 ccc ...`.

## Mandatory

1. Follow AGENTS.md's CHANGELOG, docs, test-first, and commit rules.
2. Run the gate commands from AGENTS.md for any change under `src/` or
   `src-tauri/`; skip for docs-only changes.
3. Do not restate or "fix" a doc's claim without checking it against source —
   see AGENTS.md's "Docs are not trustworthy by default".
