# build-debug.ps1 — Build debug binaries for local testing.
#
# Uses `tauri build --debug` to produce a debug exe that embeds the frontend
# from dist/ (not devUrl). Includes devtools for inspection.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/build-debug.ps1
# Run:    src-tauri\target\debug\tablepro-windows.exe

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path  # tablepro-windows/
Push-Location $root

try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    # 1. Build driver DLLs (debug)
    Write-Host "[debug] Building driver DLLs..." -ForegroundColor Cyan
    $drivers = @(
        "src-tauri/driver-postgres/Cargo.toml",
        "src-tauri/driver-mysql/Cargo.toml",
        "src-tauri/driver-mssql/Cargo.toml",
        "src-tauri/driver-sqlite/Cargo.toml"
    )
    foreach ($d in $drivers) {
        cargo build --manifest-path $d
        if ($LASTEXITCODE -ne 0) { throw "Driver build failed: $d" }
    }

    # 2. Tauri build --debug --no-bundle (frontend + exe only, skip MSI/NSIS/updater)
    Write-Host "[debug] Building Tauri app (debug)..." -ForegroundColor Cyan
    npx tauri build --debug --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Tauri debug build failed" }

    # 3. Copy driver DLLs next to the exe
    $debugDir = "src-tauri\target\debug"
    $pluginsDir = "$debugDir\plugins"
    if (!(Test-Path $pluginsDir)) {
        New-Item -ItemType Directory -Path $pluginsDir | Out-Null
    }
    Get-ChildItem "$debugDir\driver_*.dll" -ErrorAction SilentlyContinue |
        ForEach-Object { Copy-Item $_.FullName "$pluginsDir\" -Force }

    $sw.Stop()
    $elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    Write-Host ""
    Write-Host "[debug] Build complete in ${elapsed}s" -ForegroundColor Green
    Write-Host "[debug] Run:  src-tauri\target\debug\tablepro-windows.exe" -ForegroundColor Green
} finally {
    Pop-Location
}
