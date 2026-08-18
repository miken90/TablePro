# Decisions

Decision records preserve lasting product, architecture, data ownership,
security, compatibility, and validation choices that future work must inherit.

Use `docs/templates/decision.md`. Task-local implementation choices remain in
the active execution plan and do not require a separate decision.

An installed consumer begins with no fabricated decisions. Add local decision
documents here as real choices are accepted, then index them in this file.

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-permanent-detachment-from-upstream.md) | Permanent detachment from upstream `datlechin/TablePro` | Accepted |
| [0002](0002-windows-only-powershell-execution.md) | Windows-only target, PowerShell as the execution environment | Accepted |
| [0003](0003-drivers-as-static-rlib-crates-no-plugin-system.md) | Drivers as statically compiled rlib crates, no plugin system | Accepted |
| [0004](0004-no-updater-no-telemetry-local-diagnostics-only.md) | No updater, no telemetry — diagnostics stay local files | Accepted |
| [0005](0005-per-tab-cancellation-with-capability-gating.md) | Query cancellation: per-tab ownership + capability gating | Accepted |
| [0006](0006-ssl-mode-follows-each-engines-own-semantics.md) | SSL/TLS mode labels follow each engine's own definition | Accepted |

Bug fixes are not decisions and are not recorded here — see
`docs/plans/completed/README.md` and `git log` for those. Rejected ADR
candidates and why: none of the crash-class fixes (rustls crypto-provider
install, MSSQL panic on non-string columns, streaming row cap, IPC chunk
ordering) got a decision record — each corrects a defect against an already
accepted design rather than choosing between live alternatives future work
must inherit.
