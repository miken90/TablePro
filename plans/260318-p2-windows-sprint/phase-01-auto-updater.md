---
phase: 1
features: [auto-updater]
effort: 2-3d
risk: LOW
---

# Phase 1: Tauri Auto-Updater

## Context

- Plan: [plan.md](./plan.md)
- Gap ref: [brainstorm](../reports/brainstorm-260318-conversion-gap-analysis.md) — item #13

## Overview

Add Tauri updater plugin so users receive auto-update notifications. Without this, users must manually download new versions. This is the highest-impact missing feature for distribution.

## Architecture

Use `@tauri-apps/plugin-updater` (official Tauri v2 plugin). Checks a remote JSON endpoint for new version metadata. On update available → show dialog → download → install → restart.

**Update flow:**
1. App launch → check update endpoint (debounced, max once per 4h)
2. Response: `{ version, url, signature, notes }` → compare with current version
3. If newer → show non-blocking notification with changelog
4. User clicks "Update" → download MSI/NSIS in background → prompt restart
5. User clicks "Later" → dismiss, check again next launch

**Endpoint:** Static JSON file hosted on GitHub Releases or CDN. Format defined by Tauri updater spec.

## Implementation Steps

### Rust Backend

#### [MODIFY] `src-tauri/Cargo.toml`
- Add `tauri-plugin-updater` dependency

#### [MODIFY] `src-tauri/tauri.conf.json`
- Add updater config:
  ```json
  "plugins": {
    "updater": {
      "endpoints": ["https://releases.tablepro.app/update/{{target}}/{{current_version}}"],
      "pubkey": "<RSA_PUBLIC_KEY>"
    }
  }
  ```

#### [MODIFY] `src-tauri/src/lib.rs`
- Register `tauri_plugin_updater::init()` in builder

#### [MODIFY] `src-tauri/capabilities/default.json`
- Add updater permissions

### Frontend

#### [NEW] `src/components/shared/update-notification.tsx`
- Non-intrusive toast/banner when update available
- Shows version + changelog summary
- "Update Now" and "Later" buttons
- "Update Now" → triggers download, shows progress bar, prompts restart

#### [NEW] `src/hooks/useAutoUpdater.ts`
- On mount: check for update via `@tauri-apps/plugin-updater`
- If update available → set state → render notification
- Handle download progress events
- Debounce: skip check if last check was < 4h ago (localStorage)

#### [MODIFY] `src/components/layout/MainLayout.tsx`
- Mount `<UpdateNotification />` component

## File Ownership

| Area | Files |
|------|-------|
| Rust | `Cargo.toml`, `tauri.conf.json`, `lib.rs`, `capabilities/` |
| Frontend | `update-notification.tsx` (new), `useAutoUpdater.ts` (new), `MainLayout.tsx` |

## Todo

- [x] Add `tauri-plugin-updater` to Cargo.toml + npm
- [x] Configure updater endpoint in `tauri.conf.json`
- [x] Register plugin in `lib.rs`
- [x] Add capability permissions
- [x] Create `useAutoUpdater` hook
- [x] Create `UpdateNotification` component
- [x] Mount in MainLayout
- [ ] Generate RSA key pair for signing
- [ ] Test: mock update endpoint → verify notification appears

## Success Criteria

- [ ] App checks for updates on launch (with 4h debounce)
- [ ] Update notification shown when newer version available
- [ ] Download progress visible
- [ ] Install + restart works
- [ ] No update → no UI shown (silent)

## Risk Assessment

| Risk | Impact | Prob | Mitigation |
|------|--------|------|-----------|
| Missing RSA key pair | HIGH | LOW | Generate during setup, document process |
| Endpoint not yet set up | MED | HIGH | Use placeholder URL, create endpoint before release |
| NSIS vs MSI updater differences | LOW | LOW | Tauri handles both transparently |
