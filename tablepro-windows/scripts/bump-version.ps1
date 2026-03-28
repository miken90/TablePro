<#
.SYNOPSIS
    Bump TablePro version across package.json, tauri.conf.json, and Cargo.toml.
.PARAMETER Version
    The new version string (e.g., 0.2.0).
.EXAMPLE
    .\scripts\bump-version.ps1 -Version 0.2.0
#>
param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# package.json
$pkgPath = Join-Path $root "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8
Write-Host "Updated package.json -> $Version"

# tauri.conf.json
$tauriPath = Join-Path $root "src-tauri" "tauri.conf.json"
$tauri = Get-Content $tauriPath -Raw | ConvertFrom-Json
$tauri.version = $Version
$tauri | ConvertTo-Json -Depth 10 | Set-Content $tauriPath -Encoding UTF8
Write-Host "Updated tauri.conf.json -> $Version"

# Cargo.toml (workspace root)
$cargoPath = Join-Path $root "src-tauri" "Cargo.toml"
$cargo = Get-Content $cargoPath -Raw
$cargo = $cargo -replace '(?m)^(version\s*=\s*")[^"]*(")', "`${1}$Version`${2}"
Set-Content $cargoPath $cargo -Encoding UTF8
Write-Host "Updated Cargo.toml -> $Version"

Write-Host "`nVersion bumped to $Version across all files."
