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
$scriptExitCode = 0

function Get-ChildProcessIds {
    param([int]$ParentId)

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        $child.ProcessId
        Get-ChildProcessIds -ParentId $child.ProcessId
    }
}

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $processIds = @($RootProcessId) + @(Get-ChildProcessIds -ParentId $RootProcessId)
    $processIds |
        Sort-Object -Unique -Descending |
        ForEach-Object {
            if (Get-Process -Id $_ -ErrorAction SilentlyContinue) {
                Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            }
        }
}

Push-Location $root
try {
    # 0. Ensure the Vite port is free before starting
    $stale = (Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue).OwningProcess |
        Select-Object -Unique
    if ($stale) {
        throw "Port 1420 is already in use by PID(s): $($stale -join ', '). Close the existing process and retry."
    }

    # 1. Build driver DLLs (same as beforeDevCommand)
    Write-Host "[dev] Building driver DLLs..." -ForegroundColor Cyan

    cargo build --manifest-path src-tauri/driver-postgres/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw "driver-postgres build failed (exit $LASTEXITCODE)" }

    cargo build --manifest-path src-tauri/driver-mysql/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw "driver-mysql build failed (exit $LASTEXITCODE)" }

    cargo build --manifest-path src-tauri/driver-mssql/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw "driver-mssql build failed (exit $LASTEXITCODE)" }

    cargo build --manifest-path src-tauri/driver-sqlite/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw "driver-sqlite build failed (exit $LASTEXITCODE)" }

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
        $scriptExitCode = $LASTEXITCODE
    } finally {
        # 5. Cleanup: stop the Vite process tree started by this script
        Write-Host "[dev] Stopping Vite..." -ForegroundColor Yellow
        Stop-ProcessTree -RootProcessId $viteProc.Id

        $portPid = (Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue).OwningProcess |
            Select-Object -Unique
        if ($portPid) {
            Write-Host "[dev] Warning: port 1420 still in use by PID(s): $($portPid -join ', ')" -ForegroundColor Yellow
        }
        Write-Host "[dev] Done." -ForegroundColor Green
    }
} finally {
    Pop-Location
}

if ($scriptExitCode -ne 0) {
    exit $scriptExitCode
}
