package license

import (
	"log"

	"github.com/yourusername/health-dashboard-backend/models"
)

func setDefaultFreeLicense() {
	CurrentLicense = models.License{
		MaxServers: 5,
		Expires:    "2099-12-31T23:59:59Z",
		LicenseID:  "free-default",
		Signature:  "",
		Company:    "Default User",
	}
	log.Println("✅ Default FREE license loaded (5 servers, infinite duration)")
}
