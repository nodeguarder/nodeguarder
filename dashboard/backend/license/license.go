package license

import (

	"log"
	"os"
	"time"

	"github.com/yourusername/health-dashboard-backend/models"
	"gopkg.in/yaml.v2"
)

var CurrentLicense models.License

// LoadLicense loads the license from license.yaml and verifies it
func LoadLicense(licensePath string) error {
	// If path not provided, use default base path
	if licensePath == "" {
		licensePath = "/app/license.yaml"
	}

	var data []byte
	var err error

	// 1. Try to read the license file
	data, err = os.ReadFile(licensePath)
	if err != nil {
		// If file doesn't exist, use default FREE license (5 servers)
		if os.IsNotExist(err) {
			log.Println("⚠️  license.yaml not found, using default FREE license (5 servers)")
			setDefaultFreeLicense()
			return nil
		}
		log.Printf("⚠️  Error reading license file: %v. Using default FREE license.", err)
		setDefaultFreeLicense()
		return nil
	}

	// 2. Parse YAML
	var loadedLicense models.License
	if len(data) == 0 {
		log.Println("⚠️  license.yaml is empty, using default FREE license (5 servers)")
		setDefaultFreeLicense()
		return nil
	}

	if err := yaml.Unmarshal(data, &loadedLicense); err != nil {
		log.Printf("⚠️  Failed to parse license file: %v. Using default FREE license.", err)
		setDefaultFreeLicense()
		return nil
	}

	// 3. Verify Signature
	// We look for public.key in the same directory as license.yaml or /app/public.key
	publicKeyPath := "/app/public.key"
	if _, err := os.Stat(publicKeyPath); os.IsNotExist(err) {
		// Try local directory (for dev/testing)
		publicKeyPath = "public.key"
	}

	// Only verify if we have a public key. 
	// If we don't have a public key, we can't verify, so we should fail or warn.
	// For "Generic Customer Image", public key is embedded.
	if err := VerifyLicenseSignature(loadedLicense, publicKeyPath); err != nil {
		log.Printf("❌ License validation failed: %v", err)
		// Fallback to Free license on verification failure? 
		// Or assume it's invalid and block?
		// User said "Standard is free so this should be included default".
		// If the file exists but signature is invalid, we should probably reject it.
		// However, to be safe, we can fall back to the restricted free tier.
		log.Println("⚠️  Invalid license signature. Falling back to FREE license (5 servers).")
		CurrentLicense = models.License{
			MaxServers: 5,
			Expires:    "2099-12-31T23:59:59Z",
			LicenseID:  "free-tier",
			Company:    "Free Tier (Invalid Signature)",
		}
		return nil // Return nil so app doesn't crash, but functionality is restricted
	}

	CurrentLicense = loadedLicense
	log.Printf("✅ License loaded and verified: %s | Company: %s | %d servers | Expires: %s", 
		CurrentLicense.LicenseID, CurrentLicense.Company, 
		CurrentLicense.MaxServers, CurrentLicense.Expires)

	return nil
}

// UpdateLicense updates the license file with new content (e.g. from upload)
// It does NOT sign it (backend cannot sign). It just writes it.
// Validation happens on next LoadLicense or we can validate here.
func UpdateLicense(newLicense models.License, licensePath string) error {
	if licensePath == "" {
		licensePath = "/app/license.yaml"
	}

	// Marshal to YAML
	data, err := yaml.Marshal(newLicense)
	if err != nil {
		return err
	}

	// Write to file
	if err := os.WriteFile(licensePath, data, 0644); err != nil {
		return err
	}

	// Reload to verify and update memory
	return LoadLicense(licensePath)
}

// IsValid checks if the current license is valid (expiration only, signature checked on load)
func IsValid() bool {
	expiresTime, err := time.Parse(time.RFC3339, CurrentLicense.Expires)
	if err != nil {
		log.Printf("Warning: Failed to parse license expiration date: %v", err)
		return true // If we can't parse, allow it (or should we fail?)
	}
	return time.Now().Before(expiresTime)
}

// GetStatus returns the current license status
func GetStatus(currentServerCount int) models.LicenseStatus {
	expiresTime, _ := time.Parse(time.RFC3339, CurrentLicense.Expires)
	
	status := models.LicenseStatus{
		MaxServers:       CurrentLicense.MaxServers,
		CurrentServers:   currentServerCount,
		SlotsRemaining:   CurrentLicense.MaxServers - currentServerCount,
		LicenseID:        CurrentLicense.LicenseID,
		Expires:          CurrentLicense.Expires,
		IsExpired:        time.Now().After(expiresTime),
		ExpiresFormatted: expiresTime.Format("2006-01-02"),
		Company:          CurrentLicense.Company,
	}

	return status
}
