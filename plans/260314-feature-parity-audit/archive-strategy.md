# macOS Reference Code — Archive Strategy

> Date: 2026-03-14
> Context: Windows port at ~55% parity. macOS code still needed as reference.

## Current State

| Category | Files | Notes |
|----------|-------|-------|
| `TablePro/` (Swift source) | 343 | Main app code — **actively referenced** |
| `Plugins/` (Swift plugins) | 218 | Driver + export plugins — **actively referenced** |
| `LocalPackages/` (Swift packages) | 253 | CodeEditLanguages, CodeEditSourceEditor |
| `TableProTests/` (Swift tests) | 170 | Test patterns reference |
| `TablePro.xcodeproj/` | 4 | Xcode project file |
| `Libs/` (LFS static libs) | 48 | macOS-only `.a` binaries (Git LFS) |
| macOS config (`.swiftlint.yml`, `.swiftformat`, `appcast.xml`, `signatures/`) | 4 | macOS tooling config |
| **Total macOS-only** | **1,040** | vs 152 Windows files |

## Build Artifacts Status

Already handled by `.gitignore`:
- ✅ `node_modules/` — not tracked
- ✅ `tablepro-windows/dist/` — not tracked
- ✅ `tablepro-windows/src-tauri/target/` (20GB local) — not tracked
- ✅ `Libs/*.a` — Git LFS pointers only (131 bytes each in repo)

**No cleanup action needed for build artifacts.**

## Archive Plan (3 Phases)

### Phase 1 — NOW: Label & Protect (No deletion)
- [x] Document parity checklist (see `parity-checklist.md`)
- [x] AGENTS.md already marks macOS code as "READ-ONLY reference"
- [ ] Consider adding `README.md` inside `TablePro/` and `Plugins/` directories:
  ```
  # ⚠️ macOS Reference Code — DO NOT MODIFY
  # This code is the macOS (SwiftUI + AppKit) version of TablePro.
  # Used as reference for porting features to Windows (tablepro-windows/).
  # Will be archived once Windows port reaches full parity.
  ```

### Phase 2 — AT ~90% PARITY: Create Archive Branch
When parity checklist shows ~90% Done:
1. Create branch `archive/macos-reference` from current HEAD
2. Tag it `macos-reference-v0.17.0` (last macOS version)
3. Remove macOS files from `main` branch:
   - `TablePro/`, `Plugins/`, `LocalPackages/`, `TableProTests/`
   - `TablePro.xcodeproj/`, `Libs/`
   - `.swiftlint.yml`, `.swiftformat`, `appcast.xml`, `signatures/`
4. Update `.gitignore` to ignore macOS dirs
5. Update `AGENTS.md` to reference archive branch

### Phase 3 — POST-RELEASE: Full Separation (Optional)
After first stable Windows release:
- Consider moving macOS code to separate repo `tablepro-macos` (read-only archive)
- Or keep archive branch — simpler, less overhead

## What NOT to Delete (Shared Files)

These files serve both platforms and should remain:
- `CHANGELOG.md` — unified changelog
- `README.md`, `README.vi.md` — project README
- `LICENSE`, `CLA.md`, `CONTRIBUTING.md` — legal
- `docs/` — feature documentation (Mintlify)
- `.claude/` — AI agent config
- `AGENTS.md`, `CLAUDE.md` — agent instructions
- `.editorconfig`, `.gitattributes` — shared config
- `scripts/` — may contain shared scripts

## Decision Criteria for Phase 2

Move to Phase 2 when ALL of these are true:
- [ ] P0 features from parity checklist all ✅
- [ ] At least 80% of P1 features ✅
- [ ] Windows builds and runs end-to-end for core workflows
- [ ] Team no longer opens Swift files weekly for reference
- [ ] First Windows beta/release shipped
