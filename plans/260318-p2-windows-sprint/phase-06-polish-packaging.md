---
phase: 6
features: [code-signing, preview-tabs]
effort: 2-3d
risk: LOW-MED
---

# Phase 6: Polish & Packaging

## Context

- Plan: [plan.md](./plan.md)
- Prerequisite: all other phases complete
- Existing: MSI/NSIS installer working, export system with CSV/JSON/SQL/XLSX

## Overview

Final polish before v1.0: (1) Windows code signing for trustworthy distribution, (2) preview tabs for table browsing.

> [!NOTE]
> MQL export dropped from P2 — no MongoDB driver on Windows yet. Will ship with MongoDB driver in future.

---

## Feature 6A: Windows Code Signing

**What:** Sign MSI/NSIS installer and .exe with EV certificate. Eliminates Windows SmartScreen warnings.

### Implementation

> [!IMPORTANT]
> Requires purchasing a Windows EV code signing certificate beforehand. Team must procure cert before this phase.

#### [MODIFY] `.github/workflows/` (CI)
- Add code signing step after `npm run tauri build`
- Use `signtool.exe` with certificate from GitHub Secrets
- Sign both `.exe` and `.msi`/`.nsis` installer

#### [MODIFY] `src-tauri/tauri.conf.json`
- Add signing config if Tauri supports native signing config

#### Documentation
- Document cert renewal process
- Document signing workflow for local dev builds

### Prerequisites
- [ ] EV certificate purchased and received
- [ ] Certificate stored in GitHub Secrets (PFX + password)
- [ ] signtool.exe available in CI runner

---

## ~~Feature 6B: MQL Export~~ — DROPPED

> Dropped: No MongoDB driver on Windows yet. MQL export will ship with MongoDB driver.

---

## Feature 6C: Preview Tabs

> [!IMPORTANT]
> Current sidebar behavior: single-click → open Data Grid, double-click → open Structure View.
> Preview tabs must NOT break this existing behavior.

**What:** Single-click table in sidebar → opens as **preview tab** (italic title, temporary). Only one preview tab at a time — clicking another table replaces it. Tab becomes permanent when: user edits SQL, double-clicks the tab header, or uses Ctrl+click in sidebar. Double-click table in sidebar still opens Structure View (existing behavior preserved).

### Implementation

#### [MODIFY] `src/stores/editorStore.ts`
- Add `isPreview: boolean` field to tab model
- Preview tab behavior:
  - Only one preview tab exists at a time
  - Single-click table → replace existing preview tab (or create new)
  - Double-click table → open as permanent tab
  - Editing SQL in preview tab → auto-promote to permanent

#### [MODIFY] `src/components/layout/tab-bar.tsx` (or equivalent)
- Preview tab styling: italic title, lighter opacity
- On double-click tab title → promote to permanent
- Show close button on all tabs

#### [MODIFY] `src/components/layout/sidebar-table-node.tsx`
- Single-click handler → open **preview** tab (existing `onOpenTable` behavior, just set `isPreview: true`)
- Double-click handler → open Structure View (existing behavior preserved)
- Preview → permanent promotion happens in tab bar or editor, NOT in sidebar

### Tests
- Manual: single-click table → verify preview tab appears with italic title
- Manual: single-click another table → verify preview tab replaced
- Manual: double-click table → verify permanent tab opened
- Manual: edit SQL in preview tab → verify tab becomes permanent (non-italic)

---

## File Ownership

| Feature | Files |
|---------|-------|
| 6A Signing | `.github/workflows/`, `tauri.conf.json` |
| 6B Preview | `stores/editorStore.ts`, `EditorTabBar.tsx`, `sidebar-table-node.tsx` |

**No conflicts** — all parallel-safe.

## Todo

- [ ] Set up code signing in CI (pending certificate)
- [x] ~~Add MQL export format to Rust export system~~ (DROPPED)
- [x] ~~Add MQL option to export dialog~~ (DROPPED)
- [x] Add `isPreview` to tab model
- [x] Implement preview tab behavior (single-click = preview, double-click = permanent)
- [x] Style preview tabs (italic, lighter)
- [x] Handle tab promotion on edit
- [x] ~~Rust test: MQL format generation~~ (DROPPED)
- [ ] Manual: full preview tabs workflow
- [x] Final verification: `cargo test` + `cargo clippy` + `npx vitest run` + `npm run tauri build`

## Success Criteria

- [ ] Signed installer passes SmartScreen without warnings
- [ ] MQL export generates valid `insertMany` syntax
- [ ] Single-click → preview tab (italic, replaces previous)
- [ ] Double-click → permanent tab
- [ ] Edit preview → auto-promotes to permanent
- [ ] All tests pass, build succeeds
