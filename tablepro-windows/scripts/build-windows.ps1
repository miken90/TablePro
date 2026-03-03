#!/usr/bin/env pwsh
# TablePro Windows Build Script
# Usage: .\scripts\build-windows.ps1 [-Dev] [-SkipPrereqs]

param(
    [switch]$Dev,
    [switch]$SkipPrereqs
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ProjectDir = Join-Path $Root "tablepro-windows"

Write-Host "`n=== TablePro Windows Build ===" -ForegroundColor Cyan

# --- Prerequisites Check ---
if (-not $SkipPrereqs) {
    Write-Host "`n[1/5] Checking prerequisites..." -ForegroundColor Yellow

    # Rust
    if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
        Write-Host "  ERROR: Rust not found. Install: winget install Rustlang.Rustup" -ForegroundColor Red
        exit 1
    }
    $rustVersion = (rustc --version)
    Write-Host "  Rust: $rustVersion" -ForegroundColor Green

    # Node.js
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  ERROR: Node.js not found. Install: winget install OpenJS.NodeJS.LTS" -ForegroundColor Red
        exit 1
    }
    $nodeVersion = (node --version)
    Write-Host "  Node: $nodeVersion" -ForegroundColor Green

    # npm
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "  ERROR: npm not found" -ForegroundColor Red
        exit 1
    }

    # MSVC (cl.exe)
    $clPath = Get-Command cl -ErrorAction SilentlyContinue
    if (-not $clPath) {
        # Try to find via VS Build Tools
        $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
        if (Test-Path $vsWhere) {
            $vsPath = & $vsWhere -latest -property installationPath 2>$null
            Write-Host "  VS Build Tools found at: $vsPath" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: MSVC (cl.exe) not in PATH. Build may fail." -ForegroundColor Yellow
            Write-Host "  Install: winget install Microsoft.VisualStudio.2022.BuildTools --override `"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`"" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  MSVC: found" -ForegroundColor Green
    }

    # WebView2
    $wv2 = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
    if ($wv2) {
        Write-Host "  WebView2: $($wv2.pv)" -ForegroundColor Green
    } else {
        $wv2User = Get-ItemProperty "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
        if ($wv2User) {
            Write-Host "  WebView2: $($wv2User.pv)" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: WebView2 not detected. Install: winget install Microsoft.EdgeWebView2Runtime" -ForegroundColor Yellow
        }
    }
}

# --- Install npm dependencies ---
Write-Host "`n[2/5] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $ProjectDir
try {
    npm install 2>&1 | Out-Null
    Write-Host "  npm install: OK" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: npm install failed" -ForegroundColor Red
    exit 1
}

# --- Frontend build check ---
Write-Host "`n[3/5] Building frontend..." -ForegroundColor Yellow
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Frontend build failed. Run 'npm run build' for details." -ForegroundColor Red
    exit 1
}
Write-Host "  Frontend: OK" -ForegroundColor Green

# --- Tauri build ---
if ($Dev) {
    Write-Host "`n[4/5] Starting dev mode..." -ForegroundColor Yellow
    Write-Host "  Running: cargo tauri dev" -ForegroundColor Cyan
    cargo tauri dev
} else {
    Write-Host "`n[4/5] Building release binary + installer..." -ForegroundColor Yellow
    Write-Host "  This may take 3-5 minutes on first build." -ForegroundColor Gray
    cargo tauri build 2>&1 | Tee-Object -Variable buildOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n  ERROR: Build failed" -ForegroundColor Red
        exit 1
    }

    # --- Output ---
    Write-Host "`n[5/5] Build complete!" -ForegroundColor Green
    $bundleDir = Join-Path $ProjectDir "src-tauri\target\release\bundle"

    $msi = Get-ChildItem "$bundleDir\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
    $nsis = Get-ChildItem "$bundleDir\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    $exe = Join-Path $ProjectDir "src-tauri\target\release\tablepro-windows.exe"

    Write-Host "`n=== Output Files ===" -ForegroundColor Cyan
    if (Test-Path $exe) {
        $size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
        Write-Host "  Binary:    $exe ($size MB)" -ForegroundColor White
    }
    if ($msi) {
        $size = [math]::Round($msi.Length / 1MB, 1)
        Write-Host "  MSI:       $($msi.FullName) ($size MB)" -ForegroundColor White
    }
    if ($nsis) {
        $size = [math]::Round($nsis.Length / 1MB, 1)
        Write-Host "  Installer: $($nsis.FullName) ($size MB)" -ForegroundColor White
    }

    Write-Host "`nDone! Install via the MSI or run the .exe directly." -ForegroundColor Green
}
Pop-Location
