package license

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"os"

	"github.com/yourusername/health-dashboard-backend/models"
)

// VerifyLicenseSignature checks if the license signature is valid using the public key
// The canonical string format must match the one in license_tool/main.go
func VerifyLicenseSignature(license models.License, publicKeyPath string) error {
	// 1. Load Public Key
	pubKeyData, err := os.ReadFile(publicKeyPath)
	if err != nil {
		return fmt.Errorf("failed to read public key from %s: %v", publicKeyPath, err)
	}

	block, _ := pem.Decode(pubKeyData)
	if block == nil || block.Type != "PUBLIC KEY" {
		return fmt.Errorf("failed to decode PEM block containing public key")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse public key: %v", err)
	}

	ed25519Pub, ok := pub.(ed25519.PublicKey)
	if !ok {
		return fmt.Errorf("public key is not an Ed25519 key")
	}

	// 2. Decode Signature
	if license.Signature == "" {
		return fmt.Errorf("license has no signature")
	}
	sigBytes, err := base64.StdEncoding.DecodeString(license.Signature)
	if err != nil {
		return fmt.Errorf("failed to decode signature: %v", err)
	}

	// 3. Reconstruct Canonical String
	// Company|MaxServers|Expires|LicenseID
	dataToVerify := fmt.Sprintf("%s|%d|%s|%s", license.Company, license.MaxServers, license.Expires, license.LicenseID)

	// 4. Verify
	if valid := ed25519.Verify(ed25519Pub, []byte(dataToVerify), sigBytes); !valid {
		return fmt.Errorf("invalid license signature")
	}

	return nil
}
