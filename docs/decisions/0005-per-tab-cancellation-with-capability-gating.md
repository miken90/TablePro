# 0005 Query cancellation: per-tab ownership + capability gating, not a global cancel

Date: 2026-08-17

## Status

Accepted

## Context

Commit `e66c0639` ("fix(query): cancel the run that started, not the active
tab's session") replaced a design where Stop cancelled whichever session was
"active," which cancelled the wrong query when several tabs had runs in
flight and none was focused (`f61b55d4`, "fix(query): stop guessing which
query to cancel"). The fix introduced ownership captured at run start
(`src/stores/tab-stream-registry.ts`: `TabStream.ownerKey` and `sessionId` are
set when a run begins and never re-read from "the current active tab"), and a
real cancel implementation per engine where the protocol supports one:
PostgreSQL via `client.cancel_token()` (`driver-postgres/src/lib.rs`), MySQL
via a second connection issuing `KILL QUERY <id>` (`driver-mysql/src/
cancel.rs`). MSSQL, MongoDB and Redis drivers return `DriverError::
Unsupported` from `cancel_query()`; the UI affordance for cancel is gated
per engine by `supportsQueryCancellation` in each driver's capability sidecar
(`driver-capabilities/*.capabilities.json`: `true` for postgres, mysql,
sqlite; `false` for mssql, mongodb, redis).

## Decision

Cancellation is scoped to the run that started it, not to "whatever is
currently active." The owning tab and target session are fixed at run start
and never redirected by later UI focus changes. Whether cancel is offered at
all is a per-driver capability (`supportsQueryCancellation`), honestly `false`
where the engine's cancel isn't implemented, rather than showing a button
that silently does nothing.

## Alternatives Considered

1. A single global "cancel whatever's running" — this is what existed before
   `e66c0639` and is what caused the misdirected-cancel bug; rejected.
2. Implement cancellation for all 6 engines uniformly before shipping the
   capability gate — rejected for this pass: MSSQL/MongoDB/Redis cancel
   requires more driver-specific work (see `docs/plans/active/README.md`);
   gating the UI honestly was the smaller, correct-now step.

## Consequences

Positive:

- Switching tabs while a query runs elsewhere can never cancel the wrong
  query — ownership is fixed, not re-derived from UI state.
- The cancel button's presence now matches actual driver capability instead
  of always appearing and doing nothing on 3 of 6 engines.

Tradeoffs:

- MSSQL, MongoDB and Redis users cannot cancel a long-running query from the
  UI at all — they must wait it out or close the connection. This is now
  visible (button absent) rather than silently broken (button present, no
  effect), but the underlying capability gap is real and unresolved.
- Any future driver must remember to both implement `cancel_query()` and set
  its sidecar flag; nothing enforces the two stay in sync beyond code review.

## Follow-Up

- Implement real cancellation for MSSQL, MongoDB, Redis where each protocol
  allows it — tracked in `docs/plans/active/README.md`, not started.
