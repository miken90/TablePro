---
name: release
description: >
  Prepare and ship a Windows release for TablePro. Use this skill only for
  `tablepro-windows/` when asked to bump the Windows app version, build
  portable or installer artifacts, cut a Windows release, or verify the Tauri
  release pipeline.
---

# Release TablePro Windows

Use this skill only for `tablepro-windows/`.

`TablePro/` (macOS) is upstream reference only in this repo workflow. You may inspect macOS behavior for parity checks, but do not run macOS/Xcode release steps unless explicitly requested.

This release flow is driven by PowerShell scripts and the Tauri Windows build pipeline. Do not use old macOS release steps, Xcode version bumps, or SwiftLint-based gates here.

## Source of truth

Read these first:
- `tablepro-windows/package.json`
- `tablepro-windows/scripts/bump-version.ps1`
- `tablepro-windows/scripts/build-release.ps1`
- `tablepro-windows/src-tauri/tauri.conf.json`
- `tablepro-windows/.github/workflows/windows-build.yml`

## Release modes

From `tablepro-windows/`:

```bash
npm run build:portable
npm run build:installer
npm run build:release
```

Meaning:
- `build:portable` -> portable ZIP
- `build:installer` -> MSI + NSIS installer build
- `build:release` -> both portable and installer outputs

## Pre-flight checks

Before changing anything, verify all of these:

1. Version was provided.
2. Version matches strict `X.Y.Z` semver.
   - Current bump script rejects prerelease values like `1.2.3-beta.1`.
3. Working tree status is understood.
   - If there are uncommitted changes, ask whether they should be included.
4. Dependency state is healthy.
   - `npm ci` if needed.
5. No TablePro process running (`tasklist | grep -i tablepro`).
   - A running exe will lock the release binary and cause `Access denied` errors.
6. Validation passes for current code.

Run from `tablepro-windows/`:
```bash
npx vitest run
npx eslint .
npm run build
```

Run from `tablepro-windows/src-tauri/`:
```bash
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

If these fail, fix the source first. Do not ship around failing validation.

## Step 1: Bump version

Use the existing script from `tablepro-windows/`:

```bash
cd tablepro-windows && powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -Version X.Y.Z
```

This updates (via regex, preserving formatting):
- `tablepro-windows/package.json`
- `tablepro-windows/src-tauri/tauri.conf.json`
- `tablepro-windows/src-tauri/Cargo.toml`

Do not hand-edit those three files unless the script is broken and you are fixing the script itself.

## Step 2: Update CHANGELOG.md

Move `[Unreleased]` entries to `[X.Y.Z] - YYYY-MM-DD` section in `CHANGELOG.md`.
Add new empty `[Unreleased]` section at top.

## Step 3: Commit + push

Commit version bump + changelog:
```bash
git add CHANGELOG.md tablepro-windows/package.json tablepro-windows/src-tauri/tauri.conf.json tablepro-windows/src-tauri/Cargo.toml
git commit -m "feat: vX.Y.Z — <summary>"
git push origin main
```

## Step 4: Build release artifacts

**CRITICAL: Use PowerShell** — `npx tauri build` via bash loses cargo subprocess output on Windows. Always invoke build scripts through PowerShell.

From `tablepro-windows/`:

```bash
# Portable only
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Target portable

# Installer only (MSI + NSIS)
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Target installer

# Both
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Target all
```

What the script does:
- builds the frontend with Vite
- builds all 6 release driver DLLs (postgres, mysql, mssql, sqlite, mongodb, redis)
- cleans stale bundle artifacts before building
- builds the Tauri app
- packages portable ZIP when target includes `portable`
- builds MSI + NSIS when target includes `installer`

### If build-release.ps1 fails on installer

The script handles unsigned builds by disabling `createUpdaterArtifacts`. If it still fails:

1. Build exe directly: `cd src-tauri && cargo build --release`
2. Then run bundler via PowerShell:
   ```bash
   echo '{"build":{"beforeBuildCommand":""},"bundle":{"createUpdaterArtifacts":false}}' > tauri-unsigned-build.json
   powershell -ExecutionPolicy Bypass -Command "npx tauri build --config tauri-unsigned-build.json"
   ```
3. Check artifacts exist in `src-tauri/target/release/bundle/nsis/` and `msi/`

## Expected outputs

### Portable
Expected artifact pattern:
- `tablepro-windows/target/TablePro-<version>-x64-portable.zip`

Portable staging should include:
- `TablePro.exe`
- `plugins/driver_*.dll` + `*.capabilities.json`
- optional `WebView2Loader.dll`
- optional `resources/`

### Installer
Expected artifact locations:
- `tablepro-windows/src-tauri/target/release/bundle/msi/TablePro_<version>_x64_en-US.msi`
- `tablepro-windows/src-tauri/target/release/bundle/nsis/TablePro_<version>_x64-setup.exe`

**ALWAYS verify** artifact filenames contain the correct version. If they show an old version, the build reused stale artifacts.

## Signing and updater behavior

`build-release.ps1` reads `.env` and checks signing variables.

Important behavior:
- if `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH` is available, the build keeps updater artifacts enabled
- if no signing key is available, the script disables updater artifacts and sets `beforeBuildCommand: ""` (since frontend/drivers were already built)

That unsigned fallback is expected for local release testing. Do not treat it as a release-script failure by itself.

## Step 5: Create GitHub release

Write release notes to a temp file, then use `gh`:

```bash
gh release create vX.Y.Z "<installer-path>" --repo miken90/TablePro --title "TablePro vX.Y.Z" --notes-file <notes-file> --draft
```

If hooks block artifact access, provide the exact `!` command for the user to run in terminal.

After user reviews draft: `gh release edit vX.Y.Z --draft=false --repo miken90/TablePro`

**Target repo:** `miken90/TablePro` (origin). Never release to upstream.

## CI verification contract

The Windows CI workflow is:
- `tablepro-windows/.github/workflows/windows-build.yml`

It validates:
- `cargo clippy --workspace -- -D warnings`
- `cargo test --workspace`
- `npx vitest run`
- `npx eslint .`
- `npm run build`
- `npx tauri build`

Use this workflow as the release quality bar.

## Final checklist

A Windows release is ready only when all are true:
- [ ] version was bumped by `scripts/bump-version.ps1`
- [ ] CHANGELOG.md updated
- [ ] validation commands passed
- [ ] no TablePro process running during build
- [ ] chosen artifact target built successfully
- [ ] artifact filenames contain correct version
- [ ] expected ZIP and/or MSI/NSIS outputs exist
- [ ] signing-key behavior is understood for the current environment
- [ ] changes committed and pushed
- [ ] GitHub release created (draft or published)

## Edge cases

- Commands must run from `tablepro-windows/` unless the command explicitly targets `src-tauri/`.
- Do not claim prerelease semver support. The current bump script allows only `X.Y.Z`.
- Portable and installer builds are not the same artifact. Confirm which one the user wants.
- Release builds depend on driver DLL builds. If a new driver was added but not added to `build:drivers` in package.json, release output will be incomplete.
- Local builds without signing keys may skip updater artifacts. That is expected.
- **Always kill TablePro.exe before building** — a running exe locks the release binary.
- **npx tauri build via bash loses cargo output** — always use PowerShell wrapper.

## Quick workflow

1. Confirm target version, artifact type, and target repo.
2. Kill any running TablePro process.
3. Run validation commands.
4. Run `scripts/bump-version.ps1`.
5. Update CHANGELOG.md.
6. Commit + push.
7. Run `scripts/build-release.ps1` with the requested target (via PowerShell).
8. Verify output files (version in filename!).
9. Create GitHub release with `gh release create`.
