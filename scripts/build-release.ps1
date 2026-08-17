# build-release.ps1 - Release build (installer only).
#
# Usage:
#   scripts/build-release.ps1
#
# Output:
#   MSI + NSIS installers via `npx tauri build`

param()

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path

function Import-DotEnvFile {
    param([string]$FilePath)

    if (!(Test-Path $FilePath)) {
        return
    }

    Get-Content $FilePath | ForEach-Object {
        $line = $_.Trim()
        if (!$line -or $line.StartsWith('#')) {
            return
        }

        $separatorIndex = $line.IndexOf('=')
        if ($separatorIndex -lt 1) {
            return
        }

        $name = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1)
        [System.Environment]::SetEnvironmentVariable($name, $value)
    }

    $keyPath = [System.Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY_PATH")
    if (![string]::IsNullOrWhiteSpace($keyPath) -and [string]::IsNullOrWhiteSpace([System.Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY"))) {
        $resolvedKeyPath = if ([System.IO.Path]::IsPathRooted($keyPath)) { $keyPath } else { Join-Path $root $keyPath }
        if (Test-Path $resolvedKeyPath) {
            $keyValue = Get-Content $resolvedKeyPath -Raw
            [System.Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", $keyValue.Trim())
        }
    }
}

function Invoke-FrontendBuild {
    Write-Host "[release] Building frontend..." -ForegroundColor Cyan
    npx vite build
    if ($LASTEXITCODE -ne 0) {
        throw "Vite build failed"
    }
}

function Invoke-TauriReleaseBuild {
    $tempConfig = Join-Path ([System.IO.Path]::GetTempPath()) ("tablepro-tauri-release-{0}.json" -f [Guid]::NewGuid())
    $hasSigningKey = -not [string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)

    # Clean stale bundle artifacts so we never mistake old builds for new ones
    $msiDir = Join-Path $bundleDir "msi"
    $nsisDir = Join-Path $bundleDir "nsis"
    if (Test-Path $msiDir) { Remove-Item "$msiDir\*" -Force -ErrorAction SilentlyContinue }
    if (Test-Path $nsisDir) { Remove-Item "$nsisDir\*" -Force -ErrorAction SilentlyContinue }

    if ($hasSigningKey) {
        '{"build":{"beforeBuildCommand":""}}' | Set-Content -Path $tempConfig -Encoding utf8
    } else {
        Write-Host "[release] TAURI_SIGNING_PRIVATE_KEY not set; disabling updater artifacts for this local build." -ForegroundColor Yellow
        '{"build":{"beforeBuildCommand":""},"bundle":{"createUpdaterArtifacts":false}}' | Set-Content -Path $tempConfig -Encoding utf8
    }

    try {
        npx tauri build --config $tempConfig
        if ($LASTEXITCODE -ne 0) {
            $msiArtifact = Get-ChildItem (Join-Path $bundleDir "msi\*.msi") -ErrorAction SilentlyContinue | Select-Object -First 1
            $nsisArtifact = Get-ChildItem (Join-Path $bundleDir "nsis\*.exe") -ErrorAction SilentlyContinue | Select-Object -First 1

            if ($msiArtifact -and $nsisArtifact) {
                if ($hasSigningKey) {
                    Write-Host "[release] Tauri returned non-zero, but MSI and NSIS artifacts were created. Treating build as success." -ForegroundColor Yellow
                } else {
                    Write-Host "[release] Tauri returned non-zero without signing key, but MSI and NSIS artifacts were created. Treating local build as success." -ForegroundColor Yellow
                }
                return
            }

            throw "Tauri build failed"
        }
    } finally {
        Remove-Item $tempConfig -Force -ErrorAction SilentlyContinue
    }
}

Push-Location $root
try {
    Import-DotEnvFile ".env"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

function Assert-VersionConsistency {
    $pkgVersion = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
    $tauriVersion = (Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json).version
    $cargoContent = Get-Content "src-tauri\Cargo.toml" -Raw
    if ($cargoContent -match '(?m)^version\s*=\s*"([^"]+)"') {
        $cargoVersion = $Matches[1]
    } else {
        throw "Could not parse version from Cargo.toml"
    }

    if ($pkgVersion -ne $tauriVersion -or $pkgVersion -ne $cargoVersion) {
        throw "Version mismatch: package.json=$pkgVersion, tauri.conf.json=$tauriVersion, Cargo.toml=$cargoVersion. Run scripts\bump-version.ps1 to fix."
    }
    Write-Host "[release] Version consistency OK: $pkgVersion" -ForegroundColor Green
}

    $conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
    $version = $conf.version
    Assert-VersionConsistency
    $releaseDir = "src-tauri\target\release"
    $bundleDir = Join-Path $releaseDir "bundle"

    Write-Host ("[release] TablePro v{0} - installer build" -f $version) -ForegroundColor Cyan
    Write-Host ""

    Invoke-FrontendBuild

    Write-Host "[release] Building Tauri bundle (MSI + NSIS)..." -ForegroundColor Cyan
    Invoke-TauriReleaseBuild

    $sw.Stop()
    $elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ("[release] Build complete in {0}s" -f $elapsed) -ForegroundColor Green
    Write-Host ""

    $msi = Get-ChildItem (Join-Path $bundleDir "msi\*.msi") -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($msi) {
        $msiSize = [math]::Round($msi.Length / 1MB, 1)
        Write-Host ("  MSI      : {0} ({1} MB)" -f $msi.FullName, $msiSize) -ForegroundColor White
    }

    $nsis = Get-ChildItem (Join-Path $bundleDir "nsis\*.exe") -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nsis) {
        $nsisSize = [math]::Round($nsis.Length / 1MB, 1)
        Write-Host ("  NSIS     : {0} ({1} MB)" -f $nsis.FullName, $nsisSize) -ForegroundColor White
    }

    Write-Host "========================================" -ForegroundColor Green
} finally {
    Pop-Location
}
