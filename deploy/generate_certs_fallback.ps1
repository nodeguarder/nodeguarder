
$certDir = Join-Path $PSScriptRoot "certs"
if (-not (Test-Path $certDir)) { New-Item -ItemType Directory -Force -Path $certDir | Out-Null }

Write-Host "Generating self-signed certificate via PowerShell..."
$cert = New-SelfSignedCertificate -Subject "CN=localhost" -KeyAlgorithm RSA -KeyLength 2048 -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(1)
$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
$pfxPath = Join-Path $certDir "cert.pfx"
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd

Write-Host "Converting PFX to PEM using Docker (alpine)..."
# We use docker because Windows doesn't easily export private keys to PEM natively
# We mount certDir to /certs and run openssl commands
docker run --rm -v "${certDir}:/certs" alpine sh -c "apk add --no-cache openssl && openssl pkcs12 -in /certs/cert.pfx -nocerts -out /certs/key.pem -nodes -passin pass:password && openssl pkcs12 -in /certs/cert.pfx -clcerts -nokeys -out /certs/cert.pem -passin pass:password"

# Cleanup PFX
Remove-Item $pfxPath -Force

Write-Host "Generated cert.pem and key.pem in $certDir"

