---
title: Windows roadmap reset after licensing removal
date: 2026-04-03 00:31
severity: High
component: planning/windows-roadmap
status: Resolved
---

# Windows roadmap reset after licensing removal

## Context
We created a new execution plan at `plans/260403-0031-windows-next-non-licensing-roadmap/plan.md` with 5 phases and rewired dependencies so `plans/260318-optimize-harden/plan.md` is now blocked by this roadmap for overlapping polish/hardening items.

## What Happened
Priority changed midstream: Windows build is now free, so licensing work was dropped hard from near-term scope. We re-ordered delivery into:
1) platform polish/resilience baseline,
2) driver substrate prep,
3) MongoDB vertical slice,
4) power-user parity tranche,
5) Redis design + implementation.

This was not cosmetic planning. It changed sequencing constraints and what “v1-ready” means.

## Decisions
- **Chosen:** multi-wave roadmap with platform hardening first, then one non-SQL proving ground (MongoDB), then parity, then Redis.
- **Rejected:** doing licensing + new drivers in parallel. Reason: too many rollback points, mixed failure modes, and impossible attribution when regressions hit.
- **Rejected:** Redis before MongoDB. Reason: it front-loads product-mode ambiguity before we validate non-SQL substrate on a broader document model.

## Technical impact
- Cross-plan dependency is explicit: `260318-optimize-harden` now has `blockedBy: [260403-0031-windows-next-non-licensing-roadmap]`.
- Overlap consolidation moved into Phase 1: tab persistence durability, payload chunking/safety, health monitor recovery, SSH polish.
- Scope control tightened by explicit deferrals: licensing, entitlement/signature flows, and broad speculative abstraction.

## Brutal truth
The painful part: we spent prior cycles carrying licensing in the mental model, then killed it in one directive. That churn is exhausting, but pretending licensing still belongs would be worse and would burn more calendar with fake progress.

## Lessons
- Freeze monetization assumptions before slicing engineering roadmap.
- Keep deferrals explicit in the plan file, not in people’s heads.
- Use one proving vertical (MongoDB) before generalizing architecture for all non-SQL backends.

## Next
- **Owner:** planning lead.
- **By 2026-04-05:** mark Phase 1 backlog items as executable tasks with acceptance checks.
- **By 2026-04-08:** finalize Phase 2 substrate seams and driver capability contract draft.
- **By 2026-04-12:** start MongoDB slice implementation kickoff if Phase 1 exit criteria hold.

Unresolved questions: none.
