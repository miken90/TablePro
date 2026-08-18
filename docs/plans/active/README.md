# Active Execution Plans

Individual plan documents in this directory are local working notes and are
gitignored (see `docs/plans/README.md`). This index is the only tracked,
shared record of open work — an empty-looking directory here is expected, not
a gap to fill with an invented plan.

Add a full plan document (`docs/templates/exec-plan.md`) only for an item
below once someone actually starts multi-session work on it. Until then, a
line here is enough.

## Open items (as of 2026-08-18)

- **Five GUI paths have no human-driven test**, only automated coverage or
  none: two-tab cancellation isolation (does cancelling tab A's query ever
  affect tab B's run — `src/stores/tab-stream-registry.ts` ownership logic is
  unit-provable but not clicked through); varchar-numeric round-trip in the
  grid (edit a `varchar` cell holding `007`, save, reload, confirm it is
  still `007` — `services/sql_value_kind.rs` logic is unit-tested, not
  exercised via the UI); TLS against a self-signed certificate end-to-end
  through the connection dialog (driver-level probes exist —
  `src-tauri/tests/live_tls_mongodb.rs`, `live_tls_mssql.rs` — the dialog
  flow itself has not been clicked through); Safe Mode actually blocking a
  sidebar DROP at each of its levels; SQL import followed by a schema-tree
  refresh showing the imported objects.
- **T7 row-mirror deletion** — `src/stores/queryStore.ts` (comment near
  line 368) builds a legacy `QueryResult` mirror of the columnar store for
  `StatusBar`, `ExportDialog`, and the query-announcer. Migrating those three
  readers to read the columnar store directly would drop the mirror and
  roughly halve query-result memory. Deferred until real daily use shows the
  duplication actually matters enough to justify touching three call sites.
- **11 cargo advisories with no safe upgrade path landed this pass**
  (`cargo audit`, run 2026-08-18 against `src-tauri/Cargo.lock`): 3
  `rustls-webpki` (RUSTSEC-2026-0104, -0099, -0098) + 1 `rsa`
  (RUSTSEC-2023-0071, no fix available upstream) are pulled in at
  `rustls-webpki 0.101.7` / `rsa 0.9.10` because `tiberius 0.12.3` pins
  `rustls 0.21` / `tokio-rustls 0.24`, both structurally blocked short of
  tiberius releasing a `rustls 0.23`-compatible version. 2 more
  (RUSTSEC-2026-0154 `russh`, RUSTSEC-2026-0153 `russh-cryptovec`) do have a
  patched release (`russh >=0.60.3`, current: `0.45.0`) not adopted this
  pass — an upgrade was not attempted. The remaining 5 (2 `hickory-proto`,
  2 `quick-xml`, 1 `rkyv`, all transitive) are also unaddressed. `npm audit`
  reports 0 vulnerabilities on the frontend side (same date).
- **Crate still named `tablepro-windows`** (`src-tauri/Cargo.toml`,
  `name = "tablepro-windows"`) though the repo was flattened so this crate
  is the entire application, not a Windows-specific piece of a larger
  project. Renaming touches the binary name, build scripts, and CI — not
  attempted.
- **Result-counter divergence above 500 rows in EXPLAIN mode** — reported as
  a known gap; not reproduced or root-caused in this pass. `src-tauri/src/
  commands/explain.rs` runs EXPLAIN through the same result path as a normal
  query, and the grid's various row counters (status bar, results badge,
  footer) were the subject of several other counter-divergence fixes this
  session (`a804a39c`, `f4ff7352`) — this one specific EXPLAIN-mode,
  above-500-rows case was not covered by those fixes and is unverified here.
- **Vietnamese strings never reviewed by a native speaker** —
  `src/i18n/locales/vi.json` exists and is used by the app; no review pass
  by a Vietnamese speaker is recorded in git history or elsewhere in this
  repo.
