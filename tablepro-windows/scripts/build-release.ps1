# build-release.ps1 - Release build with selectable targets.
#
# Usage:
#   scripts/build-release.ps1                  # default: all
#   scripts/build-release.ps1 -Target portable
#   scripts/build-release.ps1 -Target installer
#   scripts/build-release.ps1 -Target all
#
# Targets:
#   portable  - Release exe + driver DLLs -> portable ZIP
#   installer - Tauri bundle -> MSI + NSIS installers
#   all       - Both portable + installer

param(
    [ValidateSet("portable", "installer", "all")]
    [string]$Target = "all"
)

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

function Invoke-ReleaseDriverBuild {
    $drivers = @(
        "src-tauri/driver-postgres/Cargo.toml",
        "src-tauri/driver-mysql/Cargo.toml",
        "src-tauri/driver-mssql/Cargo.toml",
        "src-tauri/driver-sqlite/Cargo.toml"
    )

    Write-Host "[release] Building driver DLLs..." -ForegroundColor Cyan
    foreach ($driver in $drivers) {
        cargo build --release --manifest-path $driver
        if ($LASTEXITCODE -ne 0) {
            throw "Driver build failed: $driver"
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

    if ($hasSigningKey) {
        '{"build":{"beforeBuildCommand":""}}' | Set-Content -Path $tempConfig -Encoding utf8
    } else {
        Write-Host "[release] TAURI_SIGNING_PRIVATE_KEY not set; disabling updater artifacts for this local build." -ForegroundColor Yellow
        '{"bundle":{"createUpdaterArtifacts":false}}' | Set-Content -Path $tempConfig -Encoding utf8
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
    $arch = "x64"
    $releaseDir = "src-tauri\target\release"
    $bundleDir = Join-Path $releaseDir "bundle"
    $outputZip = "target\TablePro-$version-$arch-portable.zip"

    Write-Host ("[release] TablePro v{0} ({1}) - target: {2}" -f $version, $arch, $Target) -ForegroundColor Cyan
    Write-Host ""

    Invoke-FrontendBuild
    Invoke-ReleaseDriverBuild

    if ($Target -eq "portable" -or $Target -eq "all") {
        Write-Host "[release] Building main app (release)..." -ForegroundColor Cyan
        cargo build --release --manifest-path src-tauri/Cargo.toml
        if ($LASTEXITCODE -ne 0) {
            throw "Cargo release build failed"
        }

        Write-Host "[release] Packaging portable ZIP..." -ForegroundColor Cyan
        $stagingDir = "target\portable-staging"
        $pluginsDir = Join-Path $stagingDir "plugins"
        $resourcesDir = Join-Path $stagingDir "resources"

        if (Test-Path $stagingDir) {
            Remove-Item $stagingDir -Recurse -Force
        }

        New-Item -ItemType Directory -Path $stagingDir | Out-Null
        New-Item -ItemType Directory -Path $pluginsDir | Out-Null

        Copy-Item (Join-Path $releaseDir "tablepro-windows.exe") (Join-Path $stagingDir "TablePro.exe")

        $wv2 = Join-Path $releaseDir "WebView2Loader.dll"
        if (Test-Path $wv2) {
            Copy-Item $wv2 $stagingDir
        }

        Get-ChildItem (Join-Path $releaseDir "driver_*.dll") -ErrorAction SilentlyContinue |
            ForEach-Object { Copy-Item $_.FullName $pluginsDir -Force }

        if (Test-Path "src-tauri\resources") {
            New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null
            Copy-Item "src-tauri\resources\*" $resourcesDir -Recurse
        }

        if (Test-Path $outputZip) {
            Remove-Item $outputZip -Force
        }

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory(
            $stagingDir,
            $outputZip,
            [System.IO.Compression.CompressionLevel]::Optimal,
            $false
        )
        Remove-Item $stagingDir -Recurse -Force
    }

    if ($Target -eq "installer" -or $Target -eq "all") {
        Write-Host "[release] Building Tauri bundle (MSI + NSIS)..." -ForegroundColor Cyan
        Invoke-TauriReleaseBuild
    }

    $sw.Stop()
    $elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ("[release] Build complete in {0}s" -f $elapsed) -ForegroundColor Green
    Write-Host ""

    if (($Target -eq "portable" -or $Target -eq "all") -and (Test-Path $outputZip)) {
        $zipSize = [math]::Round((Get-Item $outputZip).Length / 1MB, 1)
        Write-Host ("  Portable : {0} ({1} MB)" -f $outputZip, $zipSize) -ForegroundColor White
    }

    if ($Target -eq "installer" -or $Target -eq "all") {
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
    }

    Write-Host "========================================" -ForegroundColor Green
} finally {
    Pop-Location
}
