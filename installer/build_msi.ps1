param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = (Join-Path $PSScriptRoot "output"),

    [Parameter(Mandatory = $false)]
    [string]$InstallerDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

# Resolve paths
$SourceDir = Resolve-Path $SourceDir
$OutputDir = New-Item -ItemType Directory -Path $OutputDir -Force | Select-Object -ExpandProperty FullName

Write-Host "Building NodeGuarder Agent MSI..." -ForegroundColor Cyan
Write-Host "  Source: $SourceDir"
Write-Host "  Output: $OutputDir"

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

# Find WiX Toolset
$wixPath = $null
$possiblePaths = @(
        Join-Path ${env:ProgramFiles} "WiX Toolset v3\bin",
        Join-Path ${env:ProgramFiles(x86)} "WiX Toolset v3\bin",
        Join-Path ${env:ProgramFiles} "WiX Toolset v4\bin",
        Join-Path ${env:ProgramFiles(x86)} "WiX Toolset v4\bin",
        Join-Path ${env:ProgramFiles} "WiX Toolset\bin",
        Join-Path ${env:ProgramFiles(x86)} "WiX Toolset\bin"
    )

# Also check PATH
$candleInPath = (Get-Command "candle.exe" -ErrorAction SilentlyContinue)
if ($candleInPath) {
    $wixPath = Split-Path $candleInPath.Source -Parent
}
else {
    foreach ($p in $possiblePaths) {
        if (Test-Path (Join-Path $p "candle.exe")) {
            $wixPath = $p
            break
        }
    }
}

if (-not $wixPath) {
    Write-Error "WiX Toolset not found. Please install WiX Toolset v3 from https://wixtoolset.org/"
    exit 1
}

$candle = Join-Path $wixPath "candle.exe"
$light = Join-Path $wixPath "light.exe"

Write-Host "WiX Toolset found at: $wixPath" -ForegroundColor Green

# Get version from the executable
$exeVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $SourceDir "nodeguarder-agent.exe")).FileVersion
if (-not $exeVersion) {
    $exeVersion = "1.0.0"
}
Write-Host "Agent version: $exeVersion" -ForegroundColor Green

# Build WiX object
$wxsFile = Join-Path $InstallerDir "NodeGuarder.wxs"
$wixobjFile = Join-Path $OutputDir "NodeGuarder.wixobj"

Write-Host "Compiling WiX source..." -ForegroundColor Yellow
& $candle -arch x64 `
    -dSourceDir="$SourceDir" `
    -dVersion="$exeVersion" `
    -out "$wixobjFile" `
    "$wxsFile"

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
    "$wixobjFile"

if ($LASTEXITCODE -ne 0) {
    Write-Error "WiX linking failed with exit code $LASTEXITCODE"
    exit 1
}

Write-Host "MSI package created: $msiFile" -ForegroundColor Green
Write-Host "Done." -ForegroundColor Cyan

return $msiFile
