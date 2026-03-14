# build-portable.ps1 — Creates a portable ZIP of TablePro
# Usage: powershell -File scripts/build-portable.ps1

$ErrorActionPreference = "Stop"

$version = "0.1.0"
$arch = "x64"
$stagingDir = "target\portable-staging"
$releaseDir = "src-tauri\target\release"
$outputZip = "target\TablePro-$version-$arch-portable.zip"

Write-Host "Building Tauri app..."
npx tauri build
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

Write-Host "Preparing portable package..."
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Path "$stagingDir\plugins" | Out-Null
New-Item -ItemType Directory -Path "$stagingDir\resources" | Out-Null

# Copy main executable
Copy-Item "$releaseDir\tablepro-windows.exe" "$stagingDir\TablePro.exe"

# Copy WebView2Loader if present
$wv2 = "$releaseDir\WebView2Loader.dll"
if (Test-Path $wv2) { Copy-Item $wv2 $stagingDir }

# Copy plugin DLLs
Get-ChildItem "$releaseDir\driver-*.dll" -ErrorAction SilentlyContinue |
    ForEach-Object { Copy-Item $_.FullName "$stagingDir\plugins\" }

# Copy resources
if (Test-Path "src-tauri\resources") {
    Copy-Item "src-tauri\resources\*" "$stagingDir\resources\" -Recurse
}

# Create ZIP
if (Test-Path $outputZip) { Remove-Item $outputZip -Force }
Compress-Archive -Path "$stagingDir\*" -DestinationPath $outputZip

$size = [math]::Round((Get-Item $outputZip).Length / 1MB, 1)
Write-Host "Portable ZIP created: $outputZip ($size MB)"
