# build-release.ps1 — Release build with selectable targets.
#
# Usage:
#   scripts/build-release.ps1                  # default: all
#   scripts/build-release.ps1 -Target portable
#   scripts/build-release.ps1 -Target installer
#   scripts/build-release.ps1 -Target all
#
# Targets:
#   portable  — Release-optimized exe + driver DLLs → portable ZIP (no Tauri bundle)
#   installer — Tauri bundle → MSI + NSIS installers
#   all       — Both portable + installer

param(
    [ValidateSet("portable", "installer", "all")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path  # tablepro-windows/
Push-Location $root

try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    # Read version from tauri.conf.json
    $conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
    $version = $conf.version
    $arch = "x64"
    $releaseDir = "src-tauri\target\release"
    $bundleDir = "$releaseDir\bundle"

    Write-Host "[release] TablePro v$version ($arch) — target: $Target" -ForegroundColor Cyan
    Write-Host ""

    # --- Shared: build driver DLLs (release) ---
    Write-Host "[release] Building driver DLLs..." -ForegroundColor Cyan
    $drivers = @(
        "src-tauri/driver-postgres/Cargo.toml",
        "src-tauri/driver-mysql/Cargo.toml",
        "src-tauri/driver-mssql/Cargo.toml",
        "src-tauri/driver-sqlite/Cargo.toml"
    )
    foreach ($d in $drivers) {
        cargo build --release --manifest-path $d
        if ($LASTEXITCODE -ne 0) { throw "Driver build failed: $d" }
    }

    # --- Portable: build frontend + cargo release + zip ---
    if ($Target -eq "portable" -or $Target -eq "all") {
        Write-Host "[release] Building frontend..." -ForegroundColor Cyan
        npx vite build
        if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }

        Write-Host "[release] Building main app (release)..." -ForegroundColor Cyan
        cargo build --release --manifest-path src-tauri/Cargo.toml
        if ($LASTEXITCODE -ne 0) { throw "Cargo release build failed" }

        Write-Host "[release] Packaging portable ZIP..." -ForegroundColor Cyan
        $stagingDir = "target\portable-staging"
        $outputZip = "target\TablePro-$version-$arch-portable.zip"

        if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
        New-Item -ItemType Directory -Path $stagingDir | Out-Null
        New-Item -ItemType Directory -Path "$stagingDir\plugins" | Out-Null

        Copy-Item "$releaseDir\tablepro-windows.exe" "$stagingDir\TablePro.exe"

        $wv2 = "$releaseDir\WebView2Loader.dll"
        if (Test-Path $wv2) { Copy-Item $wv2 $stagingDir }

        Get-ChildItem "$releaseDir\driver_*.dll" -ErrorAction SilentlyContinue |
            ForEach-Object { Copy-Item $_.FullName "$stagingDir\plugins\" -Force }

        if (Test-Path "src-tauri\resources") {
            New-Item -ItemType Directory -Path "$stagingDir\resources" -Force | Out-Null
            Copy-Item "src-tauri\resources\*" "$stagingDir\resources\" -Recurse
        }

        if (Test-Path $outputZip) { Remove-Item $outputZip -Force }
        Compress-Archive -Path "$stagingDir\*" -DestinationPath $outputZip
        Remove-Item $stagingDir -Recurse -Force
    }

    # --- Installer: tauri build → MSI + NSIS ---
    if ($Target -eq "installer" -or $Target -eq "all") {
        Write-Host "[release] Building Tauri bundle (MSI + NSIS)..." -ForegroundColor Cyan
        npx tauri build
        if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
    }

    # --- Summary ---
    $sw.Stop()
    $elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "[release] Build complete in ${elapsed}s" -ForegroundColor Green
    Write-Host ""

    if ($Target -eq "portable" -or $Target -eq "all") {
        $zipSize = [math]::Round((Get-Item $outputZip).Length / 1MB, 1)
        Write-Host "  Portable : $outputZip ($zipSize MB)" -ForegroundColor White
    }
    if ($Target -eq "installer" -or $Target -eq "all") {
        $msi = Get-ChildItem "$bundleDir\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($msi) {
            $msiSize = [math]::Round($msi.Length / 1MB, 1)
            Write-Host "  MSI      : $($msi.FullName) ($msiSize MB)" -ForegroundColor White
        }
        $nsis = Get-ChildItem "$bundleDir\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($nsis) {
            $nsisSize = [math]::Round($nsis.Length / 1MB, 1)
            Write-Host "  NSIS     : $($nsis.FullName) ($nsisSize MB)" -ForegroundColor White
        }
    }
    Write-Host "========================================" -ForegroundColor Green
} finally {
    Pop-Location
}
