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

# package.json — regex replace to preserve formatting
$pkgPath = Join-Path $root "package.json"
$pkgContent = [IO.File]::ReadAllText($pkgPath)
$pkgContent = $pkgContent -replace '("version"\s*:\s*")[^"]*(")', "`${1}$Version`${2}"
[IO.File]::WriteAllText($pkgPath, $pkgContent)
Write-Host "Updated package.json -> $Version"

# tauri.conf.json — regex replace to preserve formatting
$tauriPath = Join-Path (Join-Path $root "src-tauri") "tauri.conf.json"
$tauriContent = [IO.File]::ReadAllText($tauriPath)
$tauriContent = $tauriContent -replace '("version"\s*:\s*")[^"]*(")', "`${1}$Version`${2}"
[IO.File]::WriteAllText($tauriPath, $tauriContent)
Write-Host "Updated tauri.conf.json -> $Version"

# Cargo.toml (workspace root)
$cargoPath = Join-Path (Join-Path $root "src-tauri") "Cargo.toml"
$cargo = [IO.File]::ReadAllText($cargoPath)
$cargo = $cargo -replace '(?m)^(version\s*=\s*")[^"]*(")', "`${1}$Version`${2}"
[IO.File]::WriteAllText($cargoPath, $cargo)
Write-Host "Updated Cargo.toml -> $Version"

Write-Host "`nVersion bumped to $Version across all files."
