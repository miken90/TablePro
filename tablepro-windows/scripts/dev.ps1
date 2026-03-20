# dev.ps1 — Launch Vite + Rust app independently (bypasses Tauri CLI).
#
# The Tauri CLI `dev` command manages child processes and can silently kill
# the app after a few minutes on Windows.  This script avoids that by
# running Vite and `cargo run` as two independent processes.
#
# Usage:  powershell -File scripts/dev.ps1
# Stop:   Close the app window (script cleans up Vite automatically)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path  # tablepro-windows/

# 0. Kill any leftover process on port 1420
$stale = (Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue).OwningProcess |
    Select-Object -Unique
if ($stale) {
    $stale | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Write-Host "[dev] Cleaned up stale process on port 1420" -ForegroundColor Yellow
    Start-Sleep -Seconds 1
}

# 1. Build driver DLLs (same as beforeDevCommand)
Write-Host "[dev] Building driver DLLs..." -ForegroundColor Cyan
cargo build --manifest-path src-tauri/driver-postgres/Cargo.toml
cargo build --manifest-path src-tauri/driver-mysql/Cargo.toml
cargo build --manifest-path src-tauri/driver-mssql/Cargo.toml
cargo build --manifest-path src-tauri/driver-sqlite/Cargo.toml

# 2. Start Vite dev server as a background PowerShell process
Write-Host "[dev] Starting Vite dev server..." -ForegroundColor Cyan
$viteProc = Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-Command", "npx vite --port 1420 --strictPort" `
    -WorkingDirectory $root `
    -PassThru -WindowStyle Minimized

# 3. Wait for Vite to be ready (TCP port check)
$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    if ($viteProc.HasExited) {
        throw "Vite exited unexpectedly (code $($viteProc.ExitCode))"
    }
    $tcp = (Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue)
    if ($tcp) { break }
    Start-Sleep -Seconds 1
    $waited++
}
if ($waited -ge $maxWait) {
    if (!$viteProc.HasExited) { Stop-Process -Id $viteProc.Id -Force -ErrorAction SilentlyContinue }
    throw "Vite dev server did not start within ${maxWait}s"
}
Write-Host "[dev] Vite ready at http://localhost:1420" -ForegroundColor Green

# 4. Run the Tauri app via cargo (no Tauri CLI involved)
Write-Host "[dev] Starting Tauri app..." -ForegroundColor Cyan
try {
    cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --features devtools --
} finally {
    # 5. Cleanup: stop Vite when the app exits
    Write-Host "[dev] Stopping Vite..." -ForegroundColor Yellow
    if (!$viteProc.HasExited) {
        Stop-Process -Id $viteProc.Id -Force -ErrorAction SilentlyContinue
    }
    # Kill any lingering process on port 1420
    $portPid = (Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue).OwningProcess |
        Select-Object -Unique
    if ($portPid) {
        $portPid | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    }
    Write-Host "[dev] Done." -ForegroundColor Green
}
