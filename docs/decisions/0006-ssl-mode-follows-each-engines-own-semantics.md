# 0006 SSL/TLS mode labels follow each engine's own definition, not a uniform meaning

Date: 2026-08-17

## Status

Accepted

## Context

Before commit `6da24442` ("fix(mysql): apply MySQL's own ssl_mode semantics
to TLS connections"), every encrypted MySQL mode validated the server
certificate against a fixed root bundle, ignoring the OS certificate store —
so a self-hosted server, including the one MySQL 8 generates on first start,
could not connect under `require` at all. The fix makes `require` mean what
MySQL's own docs say it means (encrypt, don't verify), while `verify-ca` and
`verify-full` do verify. Commit `176109de` ("feat(connection): explain what
the selected SSL mode verifies") then made the connection dialog state this
per engine, because the same word does not mean the same thing everywhere:
SQL Server encrypts in every mode (per `docs/databases/mssql.mdx`, added in
`6a25cb77`), MySQL's `require` does not verify, PostgreSQL's `require` also
does not verify (`docs/databases/postgresql.mdx`).

## Decision

Where an app-level setting name (`ssl_mode`, encryption mode, etc.) maps to
a driver/engine concept that has its own established meaning, this app
surfaces and implements the *engine's* definition rather than inventing one
uniform cross-engine meaning and forcing every driver into it. The UI states
per-engine what a mode actually does (encrypts? verifies cert? verifies
hostname?) instead of using one label and letting the user assume it behaves
the same everywhere.

## Alternatives Considered

1. Define one app-level "SSL mode" enum with fixed cross-engine semantics
   (e.g. always verify when "require" is selected) — rejected: this is what
   caused the MySQL self-signed-cert connection failure; it silently
   overrides what users of that engine already expect from `require`.
2. Hide the distinction and just label modes "Off / On" — rejected: loses
   the verify-vs-no-verify distinction that matters for MITM exposure,
   and doesn't fix that MSSQL always encrypts regardless of the selected mode.

## Consequences

Positive:

- A MySQL server with a self-signed or freshly-generated certificate connects
  under `require`, matching what every other MySQL client does.
- The connection dialog is honest about what verification actually happens
  per engine, so a user choosing `require` against a public network knows
  they are not protected against a MITM — the dialog says so.

Tradeoffs:

- There is no single "how secure is my connection" answer across engines;
  a user comparing PostgreSQL and SQL Server behavior has to read the
  per-engine text, because the modes are not equivalent.
- `verify-ca`/`verify-full` against a private/internal CA (a self-hosted
  server with its own CA, not a public one) still fails unless that CA is
  installed in the OS trust store — this decision makes the failure honest
  and explained, it does not remove the friction of getting a private CA
  trusted.

## Follow-Up

- None planned; this is the intended, documented behavior per engine.
