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

    # 1. Tauri build --debug --no-bundle (frontend + exe only, skip MSI/NSIS/updater)
    Write-Host "[debug] Building Tauri app (debug)..." -ForegroundColor Cyan
    npx tauri build --debug --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Tauri debug build failed" }

    # 2. Stage driver capability sidecar files next to the exe
    $debugDir = "src-tauri\target\debug"
    $capsDir = "src-tauri\driver-capabilities"
    if (Test-Path $capsDir) {
        $stageDir = "$debugDir\driver-capabilities"
        if (!(Test-Path $stageDir)) {
            New-Item -ItemType Directory -Path $stageDir | Out-Null
        }
        Get-ChildItem "$capsDir\*.capabilities.json" -ErrorAction SilentlyContinue |
            ForEach-Object { Copy-Item $_.FullName "$stageDir\" -Force }
    }

    $sw.Stop()
    $elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    Write-Host ""
    Write-Host "[debug] Build complete in ${elapsed}s" -ForegroundColor Green
    Write-Host "[debug] Run:  src-tauri\target\debug\tablepro-windows.exe" -ForegroundColor Green
} finally {
    Pop-Location
}
