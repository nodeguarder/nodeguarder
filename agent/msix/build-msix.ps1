# build-msix.ps1 — Build and sign NodeGuarder Agent MSIX package
# Prerequisites:
#   - Windows SDK (for MakeAppx.exe, SignTool.exe)
#   - Rust toolchain
#   - A code signing certificate (self-signed is fine for Store upload)
#
# Usage:
#   .\build-msix.ps1 -Version "1.2.3.0" -CertThumbprint "ABC123..."
#
#   If -CertThumbprint is omitted, a new self-signed cert is generated.

param(
    [string]$Version = "1.0.0.0",
    [string]$CertThumbprint = ""
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$PackageRoot = Join-Path $PSScriptRoot "PackageRoot"
$AssetsDir = Join-Path $PackageRoot "Assets"
$OutputDir = Join-Path $PSScriptRoot "output"

# ---- Validate tools ----
$makeappx = Get-Command "MakeAppx.exe" -ErrorAction SilentlyContinue
$signtool = Get-Command "SignTool.exe" -ErrorAction SilentlyContinue

if (-not $makeappx) {
    Write-Error "MakeAppx.exe not found. Install Windows SDK and ensure it is in PATH."
    exit 1
}
if (-not $signtool) {
    Write-Error "SignTool.exe not found. Install Windows SDK and ensure it is in PATH."
    exit 1
}

# ---- Build Rust binary ----
Write-Host "==> Building nodeguarder-agent (release, store features)..." -ForegroundColor Cyan
Push-Location $RootDir
cargo build --release
if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
Pop-Location

# ---- Stage files ----
Write-Host "==> Staging files..." -ForegroundColor Cyan
$ReleaseDir = Join-Path $RootDir "target\release"
Copy-Item (Join-Path $ReleaseDir "nodeguarder-agent.exe") (Join-Path $PackageRoot "nodeguarder-agent.exe") -Force

# Copy onnxruntime.dll if present (bundled from build dependencies)
$ortDll = Join-Path $ReleaseDir "onnxruntime.dll"
if (Test-Path $ortDll) {
    Copy-Item $ortDll (Join-Path $PackageRoot "onnxruntime.dll") -Force
} else {
    Write-Warning "onnxruntime.dll not found next to the binary. The agent will fail to load the semantic model."
    Write-Warning "Place onnxruntime.dll in $PackageRoot before packaging."
}

# ---- Generate assets from logo ----
Write-Host "==> Generating MSIX assets from logo..." -ForegroundColor Cyan
$LogoPath = Join-Path $RootDir "assets\logo.png"
if (Test-Path $LogoPath) {
    # Use PowerShell to resize the logo for Store requirements
    Add-Type -AssemblyName System.Drawing

    function Resize-Png {
        param([string]$Source, [string]$Dest, [int]$Size)
        $img = [System.Drawing.Image]::FromFile($Source)
        $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, 0, 0, $Size, $Size)
        $g.Dispose()
        $bmp.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $img.Dispose()
    }

    # MSIX required assets
    Resize-Png -Source $LogoPath -Dest (Join-Path $AssetsDir "StoreLogo.png") -Size 50
    Resize-Png -Source $LogoPath -Dest (Join-Path $AssetsDir "Square150x150Logo.png") -Size 150
    Resize-Png -Source $LogoPath -Dest (Join-Path $AssetsDir "Square44x44Logo.png") -Size 44
    Resize-Png -Source $LogoPath -Dest (Join-Path $AssetsDir "Wide310x150Logo.png") -Size 150

    Write-Host "  Assets generated in $AssetsDir" -ForegroundColor Green
} else {
    Write-Warning "Logo not found at $LogoPath. Using placeholder assets."
    # Generate solid-color placeholder assets
    foreach ($asset in @("StoreLogo.png", "Square150x150Logo.png", "Square44x44Logo.png", "Wide310x150Logo.png")) {
        $bmp = New-Object System.Drawing.Bitmap(150, 150)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.Clear([System.Drawing.Color]::FromArgb(99, 102, 241))
        $g.Dispose()
        $bmp.Save((Join-Path $AssetsDir $asset), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    }
}

# ---- Update version in manifest ----
Write-Host "==> Updating manifest version to $Version..." -ForegroundColor Cyan
$ManifestPath = Join-Path $PackageRoot "AppxManifest.xml"
(Get-Content $ManifestPath) -replace 'Version="[^"]*"', "Version=`"$Version`"" | Set-Content $ManifestPath

# ---- Pack MSIX ----
Write-Host "==> Packing MSIX..." -ForegroundColor Cyan
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }
$msixPath = Join-Path $OutputDir "NodeGuarder_$Version.msix"
& $makeappx.Source pack /d $PackageRoot /p $msixPath /l
if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed" }

# ---- Sign ----
if (-not $CertThumbprint) {
    Write-Host "==> No cert specified. Generating self-signed certificate..." -ForegroundColor Yellow
    $cert = New-SelfSignedCertificate -Type Custom `
        -Subject "CN=NodeGuarderLLC" -KeyUsage DigitalSignature `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3") `
        -CertStoreLocation "Cert:\CurrentUser\My"
    $CertThumbprint = $cert.Thumbprint
    Write-Host "  Certificate thumbprint: $CertThumbprint" -ForegroundColor Green
    Write-Host "  IMPORTANT: Export this cert and add it to your CI secrets for reproducible builds." -ForegroundColor Yellow
}

Write-Host "==> Signing MSIX..." -ForegroundColor Cyan
& $signtool.Source sign /fd SHA256 /a /sha1 $CertThumbprint /sm /s My $msixPath
if ($LASTEXITCODE -ne 0) { throw "SignTool failed" }

Write-Host ""
Write-Host "✓ MSIX package created: $msixPath" -ForegroundColor Green
Write-Host "  Version: $Version"
Write-Host "  Signed:  Yes (thumbprint: $CertThumbprint)"
Write-Host ""
Write-Host "  To submit to Windows Store, upload this .msix file to Partner Center."
Write-Host "  The Store will re-sign it with their own trusted certificate."
Write-Host ""
