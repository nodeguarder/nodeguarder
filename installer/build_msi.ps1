param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "",

    [Parameter(Mandatory = $false)]
    [string]$InstallerDir = ""
)

$ErrorActionPreference = "Stop"

# Resolve defaults relative to this script's location
if (-not $InstallerDir) {
    $InstallerDir = Split-Path -Parent $PSCommandPath
}
if (-not $OutputDir) {
    $OutputDir = Join-Path $InstallerDir "output"
}

# Resolve to absolute paths and ensure trailing backslash for WiX preprocessor
$SourceDir = Resolve-Path $SourceDir
if (-not $SourceDir.EndsWith('\')) {
    $SourceDir = $SourceDir + '\'
}
$OutputDir = New-Item -ItemType Directory -Path $OutputDir -Force | Select-Object -ExpandProperty FullName
$InstallerDir = Resolve-Path $InstallerDir

Write-Host "Building NodeGuarder Agent MSI..." -ForegroundColor Cyan
Write-Host "  Source: $SourceDir"
Write-Host "  Output: $OutputDir"
Write-Host "  Installer: $InstallerDir"

# Verify required files exist
$requiredFiles = @(
    (Join-Path $SourceDir "nodeguarder-agent.exe"),
    (Join-Path $SourceDir "onnxruntime.dll"),
    (Join-Path $SourceDir "atr_rules.json")
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Write-Error "Missing required file: $file"
        exit 1
    }
}

# Find WiX Toolset (candle.exe must be on PATH)
$candlePath = (Get-Command "candle.exe" -ErrorAction SilentlyContinue)
if (-not $candlePath) {
    Write-Error "WiX Toolset not found. Install via: choco install wixtoolset"
    exit 1
}
$wixPath = Split-Path $candlePath.Source -Parent
$candle = $candlePath.Source
$light = Join-Path $wixPath "light.exe"

Write-Host "WiX Toolset found at: $wixPath" -ForegroundColor Green

# Get version from Cargo.toml (canonical source)
$repoRoot = Resolve-Path (Join-Path $InstallerDir "..")
$cargoToml = Join-Path $repoRoot "agent" "Cargo.toml"
$versionLine = Select-String -Path $cargoToml -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1
$exeVersion = if ($versionLine) { $versionLine.Matches.Groups[1].Value } else { "1.0.0" }
Write-Host "Agent version: $exeVersion (from Cargo.toml)" -ForegroundColor Green

# Generate icon.ico from logo.png (check agent/assets/ then assets/)
Add-Type -AssemblyName System.Drawing
$pngPath = Join-Path $repoRoot "agent" "assets" "logo.png"
if (-not (Test-Path $pngPath)) {
    $pngPath = Join-Path $repoRoot "assets" "logo.png"
}
$icoPath = Join-Path $SourceDir "icon.ico"
if (Test-Path $pngPath) {
    Write-Host "Generating icon.ico from logo.png..." -ForegroundColor Yellow
    # Prefer ImageMagick for proper multi-resolution icon (installed via choco in CI)
    $magick = Get-Command "magick" -ErrorAction SilentlyContinue
    if ($magick) {
        & $magick.Source convert (Resolve-Path $pngPath) -define icon:auto-resize=16,32,48,64,128,256 $icoPath 2>&1
        Write-Host "Multi-resolution icon created via ImageMagick: $icoPath" -ForegroundColor Green
    } else {
        Add-Type -AssemblyName System.Drawing
        $img = [System.Drawing.Image]::FromFile((Resolve-Path $pngPath))
        $ico = [System.Drawing.Icon]::FromHandle($img.GetHicon())
        $fs = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create)
        $ico.Save($fs)
        $fs.Close()
        $ico.Dispose()
        $img.Dispose()
        Write-Host "Icon created via System.Drawing: $icoPath" -ForegroundColor Green
    }
} else {
    Write-Warning "assets/logo.png not found at $pngPath — generating fallback icon"
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(32, 32)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.Dispose()
    $hIcon = $bmp.GetHicon()
    $ico = [System.Drawing.Icon]::FromHandle($hIcon)
    $fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
    $ico.Save($fs)
    $fs.Close()
    $ico.Dispose()
    $bmp.Dispose()
    Write-Host "Fallback icon created: $icoPath" -ForegroundColor Yellow
}

# Build WiX object
$wxsFile = Join-Path $InstallerDir "NodeGuarder.wxs"
$wixobjFile = Join-Path $OutputDir "NodeGuarder.wixobj"

Write-Host "Compiling WiX source: $wxsFile" -ForegroundColor Yellow
& $candle -arch x64 `
    -dSourceDir="$SourceDir" `
    -dVersion="$exeVersion" `
    -out "$wixobjFile" `
    "$wxsFile" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Error "WiX compilation failed with exit code $LASTEXITCODE"
    exit 1
}

# Link MSI
$msiFile = Join-Path $OutputDir "NodeGuarder-Setup-$exeVersion.msi"

Write-Host "Linking MSI package..." -ForegroundColor Yellow
& $light -ext WixUIExtension `
    -cultures:en-us `
    -out "$msiFile" `
    "$wixobjFile" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Error "WiX linking failed with exit code $LASTEXITCODE"
    exit 1
}

Write-Host "MSI package created: $msiFile" -ForegroundColor Green
Write-Host "Done." -ForegroundColor Cyan

return $msiFile
