# Execution Plans

Execution plans are Git-native working memory for complex tasks. They preserve
enough context for another agent or human to resume work without reconstructing
intent from chat history or a partial diff.

## When To Create A Plan

Use an ephemeral plan for bounded, single-session work.

Create one durable plan when work spans sessions, coordinates contributors, has
meaningful dependencies or ordering, requires recovery steps, or would be unsafe
to resume from the diff alone.

Use `docs/templates/exec-plan.md` and place the file under `active/`.
For an explicitly authorized baseline-to-rerun Harness experiment, use
`docs/templates/harness-improvement.md` instead.

## Lifecycle

```text
docs/plans/active/<slug>.md
  -> update progress and decisions during implementation
  -> record final validation and result
  -> move to docs/plans/completed/<slug>.md
```

The plan is the primary task artifact. Promote a lasting product or architecture
decision into `docs/decisions/`; keep task-local choices in the plan.

## Individual plan files are local-only, not committed

`.gitignore` excludes every file under `docs/plans/active/` and
`docs/plans/completed/` except `README.md`:

```gitignore
docs/plans/**/*.md
!docs/plans/**/README.md
```

A plan document created during a work session stays on that machine; it is
not pushed and will not appear for another contributor or agent picking up
the branch elsewhere. Only the two `README.md` index files in this tree are
tracked and shared — they exist so a fresh session finds a short, honest list
of what is open and what is done instead of an unexplained empty directory
that invites someone to "fix" it by inventing content.

Consequence: do not point another session at "the plan in
`docs/plans/active/<slug>.md`" across a branch/session boundary — it will not
be there. Point at the index entry, the relevant commit range, or a report
under `plans/reports/` (root-level, this repo's separate report location)
instead.

## Active Plans

See `active/README.md` for the current index.

## Completed Plans

See `completed/README.md` for the current index.
