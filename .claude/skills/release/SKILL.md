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
5. Validation passes for current code.

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
powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -Version 0.2.0
```

This updates:
- `tablepro-windows/package.json`
- `tablepro-windows/src-tauri/tauri.conf.json`
- `tablepro-windows/src-tauri/Cargo.toml`

Do not hand-edit those three files unless the script is broken and you are fixing the script itself.

## Step 2: Build release artifacts

Use the existing script from `tablepro-windows/`:

```bash
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Target portable
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Target installer
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Target all
```

What the script does:
- builds the frontend with Vite
- builds release driver DLLs
- builds the Tauri app
- packages portable ZIP when target includes `portable`
- builds MSI + NSIS when target includes `installer`

## Expected outputs

### Portable
Expected artifact pattern:
- `tablepro-windows/target/TablePro-<version>-x64-portable.zip`

Portable staging should include:
- `TablePro.exe`
- `plugins/driver_*.dll`
- optional `WebView2Loader.dll`
- optional `resources/`

### Installer
Expected artifact locations:
- `tablepro-windows/src-tauri/target/release/bundle/msi/*.msi`
- `tablepro-windows/src-tauri/target/release/bundle/nsis/*.exe`

## Signing and updater behavior

`build-release.ps1` reads `.env` and checks signing variables.

Important behavior:
- if `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH` is available, the build keeps updater artifacts enabled
- if no signing key is available, the script disables updater artifacts for that local build and still allows a local installer build path

That unsigned fallback is expected for local release testing. Do not treat it as a release-script failure by itself.

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

## Optional git flow

If the user wants a tagged release, use the normal git workflow after validation and artifact generation:
1. review changed files
2. commit the version bump and any intended release changes
3. create a tag if requested
4. push branch and tag only with explicit user approval

Keep git steps generic unless the user asked for a full release publication flow.

## Final checklist

A Windows release is ready only when all are true:
- version was bumped by `scripts/bump-version.ps1`
- validation commands passed
- chosen artifact target built successfully
- expected ZIP and/or MSI/NSIS outputs exist
- signing-key behavior is understood for the current environment
- CI workflow expectations still match the local process

## Edge cases

- Commands must run from `tablepro-windows/` unless the command explicitly targets `src-tauri/`.
- Do not claim prerelease semver support. The current bump script allows only `X.Y.Z`.
- Portable and installer builds are not the same artifact. Confirm which one the user wants.
- Release builds depend on driver DLL builds. If a new driver was added but not added to scripts, release output will be incomplete.
- Local builds without signing keys may skip updater artifacts. That is expected.

## Quick workflow

1. Confirm target version and artifact type.
2. Run validation commands.
3. Run `scripts/bump-version.ps1`.
4. Run `scripts/build-release.ps1` with the requested target.
5. Verify output files.
6. If requested, commit/tag/push with explicit approval.
