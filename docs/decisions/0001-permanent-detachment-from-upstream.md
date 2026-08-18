# 0001 Permanent detachment from upstream datlechin/TablePro

Date: 2026-08-17

## Status

Accepted

## Context

TablePro started as a fork of `datlechin/TablePro`, a macOS Swift/AppKit app.
This repo re-platformed it to Tauri v2 (Rust) + React/TypeScript, Windows-only,
personal and non-profit. Commit `da418dcb` ("chore: remove macOS and iOS
codebase") begins a sequence that removes all inherited Swift/AppKit code, the
`upstream` git remote, and all but 5 of the ~491 inherited tags (`git tag |
wc -l` on this repo now returns 5; the pre-detachment count is reported from
the detaching session's own record and is not independently re-derivable here
since the deleted tags no longer exist locally). `docs/development/
upstream-parity-notes.md` was written the same session to carry forward
upstream's *bug-history knowledge* before the SHAs it cites become
unreachable.

Keeping a live relationship to upstream (tracking remote, cherry-picking
fixes, periodic re-merges) was the alternative. It does not fit: upstream is a
different language, UI framework and OS target. There is nothing to merge —
only behavior to re-implement.

## Decision

Detach permanently. No `upstream` remote, no re-merges, ever. Upstream's
value to this repo is documented bug/invariant knowledge only
(`docs/development/upstream-parity-notes.md`), captured once, then frozen.

## Alternatives Considered

1. Keep an upstream remote and selectively cherry-pick fixes — rejected,
   the codebases share no compilable code (Swift/AppKit vs Rust/TS).
2. Re-fork per release to keep a paper trail to upstream commits — rejected,
   adds process for a personal non-profit project with no obligation to track
   upstream.

## Consequences

Positive:

- No confusion about "is this Swift code still relevant" — it is gone.
- Repo size and tag noise drop; `git log`/`git tag` reflect only this port's
  own history going forward.
- `docs/development/upstream-parity-notes.md` preserves the useful part
  (invariants, known bug classes) without carrying dead code.

Tradeoffs:

- Any upstream fix landing after detachment must be independently discovered
  and re-implemented from scratch; there is no diff to pull.
- The parity-notes file is a one-time snapshot — it will drift from upstream's
  actual current state and is not meant to be refreshed.

## Follow-Up

- None. This is a closed, non-reversible decision by design.
