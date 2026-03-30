# Phase 7 Implementation Report: Notifications & Feedback (Toast System)

**Date:** 2026-03-19  
**Phase:** 07 — Notifications & Feedback  
**Status:** Completed

## What Was Implemented

Integrated `sonner` toast notifications across the app for async operation feedback.

### Key Decisions
- `changeStore.ts` has no `saveChanges` function — save logic lives in `use-table-save.ts` (outside file ownership). Added `saveChanges(sessionId, payload)` action directly to `changeStore` as a proper IPC-calling action with toast feedback. This gives the store ownership of the save flow.
- Error toasts use `duration: Infinity` (persist until dismissed).
- `ToastProvider` uses `theme="dark"` + CSS variable overrides to match the app's dark theme.

## Files Created

| File | Lines | Notes |
|------|-------|-------|
| `src/components/shared/toast-provider.tsx` | 18 | Toaster: bottom-right, visibleToasts=3, closeButton, dark theme |
| `src/hooks/useToast.ts` | 26 | Typed wrapper: success/error/warning/info/loading/dismiss |

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Added `<ToastProvider />` inside ErrorBoundary |
| `src/stores/queryStore.ts` | Added `toast.loading` before query, `toast.success` with row count on success, `toast.error` (Infinity) on failure |
| `src/stores/connectionStore.ts` | Added `toast.loading` on connect, `toast.success` with host on connect, `toast.error` (Infinity) on failure, `toast.info` on disconnect |
| `src/stores/changeStore.ts` | Added `saveChanges(sessionId, payload)` action with loading/success/error toasts; imported `sonner` and `commands` |
| `package.json` | `sonner` added to dependencies (1 package installed) |

## Build Status

- **TypeScript:** ✅ 0 errors (`npx tsc` clean)
- **Vite build:** ✅ `✓ built in 4.52s`
- **Warning:** Pre-existing dynamic import warning for `commands.ts` (not introduced by this phase)

## Toast Behavior Summary

| Event | Toast Type | Duration |
|-------|-----------|---------|
| Query executing | loading | auto-dismiss on completion |
| Query success | success | 4000ms (default) |
| Query error | error | Infinity |
| Connecting | loading | auto-dismiss on completion |
| Connect success | success | 4000ms |
| Connect failure | error | Infinity |
| Disconnect | info | 4000ms |
| Saving changes | loading | auto-dismiss on completion |
| Save success | success | 4000ms |
| Save failure | error | Infinity |

## Issues / Deviations

- `changeStore.ts` did not contain a `saveChanges` function as the plan expected — the save logic was in `use-table-save.ts` (not owned by this phase). Resolved by adding `saveChanges` as a new action on `changeStore`, which is architecturally correct and makes the store own IPC persistence.
- The `useToast` hook uses `ExternalToast` type from sonner for proper typing.
