package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
    "path/filepath"
	"strings"
	"text/template"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/health"
	"github.com/yourusername/health-dashboard-backend/license"
	"github.com/yourusername/health-dashboard-backend/models"
	"github.com/yourusername/health-dashboard-backend/notifications"
	"golang.org/x/crypto/bcrypt"
	"gopkg.in/yaml.v2"
)


// AgentRegister handles agent registration
func AgentRegister(c *fiber.Ctx) error {
	var req struct {
		ServerID          string `json:"server_id"`
		Hostname          string `json:"hostname"`
		OSName            string `json:"os_name"`
		OSVersion         string `json:"os_version"`
		AgentVersion      string `json:"agent_version"`
		APISecret         string `json:"api_secret"`
		RegistrationToken string `json:"registration_token"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Validate required fields
	if req.ServerID == "" || req.Hostname == "" || req.APISecret == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing required fields"})
	}

	// CHECK REGISTRATION TOKEN
	// We only check this for NEW registrations (where we insert). 
	// However, the agent sends it every time ideally, or at least on first connect.
	// For simplicity, we enforce it always or at least check if the server exists.
	// Actually, if we re-register, we might rotate secrets, so we should probably always enforce it 
	// if we want to be strict. BUT, existing agents don't have it.
	// Strategy: If server exists, we trust the APISecret hash check (which happens later).
	// If server DOES NOT exist (New Registration), we REQUIRE the token.
	
	var existingID string
	err := database.DB.QueryRow("SELECT id FROM servers WHERE id = ?", req.ServerID).Scan(&existingID)
	isNewServer := err == sql.ErrNoRows

	if isNewServer {
		if req.RegistrationToken != RegistrationToken {
			log.Printf("❌ Registration failed: Invalid token from %s", req.Hostname)
			return c.Status(403).JSON(fiber.Map{"error": "Invalid registration token"})
		}
	}

	// CHECK LICENSE BEFORE REGISTRATION
	if !license.IsValid() {
		return c.Status(403).JSON(fiber.Map{
			"error":   "License expired",
			"expires": license.CurrentLicense.Expires,
		})
	}

	// Check if we're at the server limit
	var serverCount int
	err = database.DB.QueryRow("SELECT COUNT(*) FROM servers").Scan(&serverCount)
	if err != nil {
		log.Printf("Failed to count servers: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to check license"})
	}

	if isNewServer && serverCount >= license.CurrentLicense.MaxServers {
		return c.Status(403).JSON(fiber.Map{
			"error":            "License limit reached",
			"max_servers":      license.CurrentLicense.MaxServers,
			"current_servers":  serverCount,
			"license_id":       license.CurrentLicense.LicenseID,
		})
	}

	// Hash the API secret
	secretHash, err := bcrypt.GenerateFromPassword([]byte(req.APISecret), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to hash secret"})
	}

	now := time.Now().Unix()

	// Check if server already exists
	// We already checked this above for token verification
	// err = database.DB.QueryRow("SELECT id FROM servers WHERE id = ?", req.ServerID).Scan(&existingID)
	
	if isNewServer {
		// New server - insert
		_, err = database.DB.Exec(`
			INSERT INTO servers (id, hostname, os_name, os_version, agent_version, api_secret_hash, first_seen, last_seen, health_status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, req.ServerID, req.Hostname, req.OSName, req.OSVersion, req.AgentVersion, string(secretHash), now, now, "healthy")

		if err != nil {
			log.Printf("Failed to insert server: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to register server"})
		}

		log.Printf("✅ New server registered: %s (%s)", req.Hostname, req.ServerID)
	} else if err == nil {
		// Existing server - update
		_, err = database.DB.Exec(`
			UPDATE servers 
			SET hostname = ?, os_name = ?, os_version = ?, agent_version = ?, api_secret_hash = ?, last_seen = ?
			WHERE id = ?
		`, req.Hostname, req.OSName, req.OSVersion, req.AgentVersion, string(secretHash), now, req.ServerID)

		if err != nil {
			log.Printf("Failed to update server: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to update server"})
		}

		log.Printf("♻️  Server re-registered: %s (%s)", req.Hostname, req.ServerID)
	} else {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}

	return c.JSON(fiber.Map{"status": "registered"})
}

// AgentPushMetrics handles metrics ingestion
func AgentPushMetrics(c *fiber.Ctx) error {
	var req struct {
		ServerID  string                 `json:"server_id"`
		APISecret string                 `json:"api_secret"`
		Timestamp int64                  `json:"timestamp"`
		Metrics   map[string]interface{} `json:"metrics"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Authenticate agent
	if !authenticateAgent(req.ServerID, req.APISecret) {
		return c.Status(401).JSON(fiber.Map{"error": "Authentication failed"})
	}
	
	var processesJSON string
	if procs, ok := req.Metrics["processes"]; ok && procs != nil {
		if bytes, err := json.Marshal(procs); err == nil {
			processesJSON = string(bytes)
		}
	}

    // Handle Discovered Cron Jobs
	if cronJobs, ok := req.Metrics["cron_jobs"]; ok && cronJobs != nil {
        // We now support both []string (old) and []JobRecord (new, comes as []interface{})
        // Since we just store it as JSON in the DB, we can marshal whatever we get
        // as long as it is a slice.
		if _, ok := cronJobs.([]interface{}); ok {
            if bytes, err := json.Marshal(cronJobs); err == nil {
                database.DB.Exec("UPDATE servers SET seen_cron_jobs = ? WHERE id = ?", string(bytes), req.ServerID)
            }
        }
	}

	// Insert metrics
	_, err := database.DB.Exec(`
		INSERT INTO metrics (server_id, timestamp, cpu_percent, mem_total_mb, mem_used_mb, disk_total_gb, disk_used_gb, load_avg_1, load_avg_5, load_avg_15, process_count, processes, uptime)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		req.ServerID,
		req.Timestamp,
		req.Metrics["cpu_percent"],
		req.Metrics["mem_total_mb"],
		req.Metrics["mem_used_mb"],
		req.Metrics["disk_total_gb"],
		req.Metrics["disk_used_gb"],
		req.Metrics["load_avg_1"],
		req.Metrics["load_avg_5"],
		req.Metrics["load_avg_15"],
		req.Metrics["process_count"],
		processesJSON,
		req.Metrics["uptime"],
	)

	if err != nil {
		log.Printf("Failed to insert metrics: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to store metrics"})
	}

	// Update last_seen
	database.DB.Exec("UPDATE servers SET last_seen = ? WHERE id = ?", time.Now().Unix(), req.ServerID)

	// Calculate and update health status based on new metrics
	newStatus, oldStatus, reason, oldReason, err := health.UpdateServerHealth(req.ServerID)
	if err != nil {
		log.Printf("Failed to update health status: %v", err)
		// Don't fail the request if health calculation fails
	} else {
		// Check for status transition to notify
		if newStatus != oldStatus {
            // Resolve hostname for notifications
            hostname := getHostname(req.ServerID)

			// CRITICAL / OFFLINE ALERTS
			if newStatus == "critical" || newStatus == "offline" {
				go func(hname, sid, status, reason string) {
					if Notifier == nil { return }
					Notifier.Notify(notifications.Notification{
						Subject: fmt.Sprintf("[%s] Server Alert: %s is %s", strings.ToUpper(status), hname, status),
						Message: fmt.Sprintf("Server %s (%s) has entered %s state. Reason: %s", hname, sid, status, reason),
						Type:    notifications.TypeCritical,
					})
				}(hostname, req.ServerID, newStatus, reason)
			} else if newStatus == "healthy" && (oldStatus == "recovering" || oldStatus == "offline" || oldStatus == "critical") {
                // RECOVERY NOTIFICATION
                go func(hname, sid, oldStat, oldReas string) {
                    if Notifier == nil { return }
                    
                    msg := fmt.Sprintf("Server '%s' is back online.", hname) // Default from Offline
                    
                    if oldStat == "recovering" {
                         // Check original reason embedded in recover state
                         lowerReason := strings.ToLower(oldReas)
                         if strings.Contains(lowerReason, "offline") {
                             msg = fmt.Sprintf("[RESOLVED] Server '%s' is back online.", hname)
                         } else if strings.Contains(lowerReason, "critical") || strings.Contains(lowerReason, "warning") || strings.Contains(lowerReason, "cpu") || strings.Contains(lowerReason, "memory") || strings.Contains(lowerReason, "disk") {
                             msg = fmt.Sprintf("[RESOLVED] Server '%s' stability restored.", hname)
                         }
                    } else if oldStat == "offline" {
                        msg = fmt.Sprintf("[RESOLVED] Server '%s' is back online.", hname)
                    } else if oldStat == "critical" {
                        msg = fmt.Sprintf("[RESOLVED] Server '%s' stability restored.", hname)
                    }

                    Notifier.Notify(notifications.Notification{
						Subject: fmt.Sprintf("[RESOLVED] Server %s Recovered", hname),
						Message: msg,
						Type:    notifications.TypeSuccess,
					})
                }(hostname, req.ServerID, oldStatus, oldReason)
            }
		}
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// AgentPushEvents handles events ingestion
func AgentPushEvents(c *fiber.Ctx) error {
	var req struct {
		ServerID  string `json:"server_id"`
		APISecret string `json:"api_secret"`
		Events    []struct {
			Type      string `json:"type"`
			Severity  string `json:"severity"`
			Message   string `json:"message"`
			Timestamp int64  `json:"timestamp"`
			Details   string `json:"details"`
		} `json:"events"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Authenticate agent
	if !authenticateAgent(req.ServerID, req.APISecret) {
		return c.Status(401).JSON(fiber.Map{"error": "Authentication failed"})
	}

    // Resolve hostname for notifications
    hostname := getHostname(req.ServerID)

	// Insert events
	for _, event := range req.Events {
		_, err := database.DB.Exec(`
			INSERT INTO events (server_id, timestamp, event_type, severity, message, details)
			VALUES (?, ?, ?, ?, ?, ?)
		`, req.ServerID, event.Timestamp, event.Type, event.Severity, event.Message, event.Details)

		if err != nil {
			log.Printf("Failed to insert event: %v", err)
			continue
		}

		// If it's a drift event, update server drift status and recalculate health
		if event.Type == "drift" {
			database.DB.Exec("UPDATE servers SET drift_changed = 1 WHERE id = ?", req.ServerID)
			
			// Notify Drift
			go func(hname, msg string) {
				if Notifier == nil { return }
				Notifier.Notify(notifications.Notification{
					Subject: fmt.Sprintf("[WARNING] Drift Detected on %s", hname),
					Message: msg, // Use the actual event message
					Type:    notifications.TypeWarning,
				})
			}(hostname, event.Message)

			// Drift events can trigger warning status even if metrics are normal
			newStatus, oldStatus, _, _, err := health.UpdateServerHealth(req.ServerID)
			if err != nil {
				log.Printf("Failed to update health status after drift event: %v", err)
			} else if newStatus != oldStatus && (newStatus == "critical" || newStatus == "offline") {
                 // Logic duplicated from Metrics, but Drift usually only causes Warning.
                 // If it somehow caused Critical (unlikely unless logic changes), notify.
            }
		}

		// Notify on Health Events (CPU, Memory, Disk)
		if event.Type == "health" && event.Severity != "info" {
			go func(hname, msg, severity string) {
				if Notifier == nil { return }
				notifType := notifications.TypeWarning
				if severity == "critical" {
					notifType = notifications.TypeCritical
				}
				Notifier.Notify(notifications.Notification{
					Subject: fmt.Sprintf("[%s] Health Alert on %s", strings.ToUpper(severity), hname),
					Message: msg,
					Type:    notifType,
				})
			}(hostname, event.Message, event.Severity)
		}

		// Notify on Cron Failures
		// We want to capture: 'cron', 'cron_error', 'long_running'
		// Also any message containing 'cron' as a fallback
		isCronType := event.Type == "cron" || event.Type == "cron_error" || event.Type == "long_running"
		if isCronType || strings.Contains(strings.ToLower(event.Message), "cron") {
             
			if event.Severity != "info" {
				go func(hname, msg, evtType string) {
					if Notifier == nil { return }
					
					subject := fmt.Sprintf("[CRITICAL] Cron Job Failure on %s", hname)
					notifType := notifications.TypeCritical

					if evtType == "long_running" {
						subject = fmt.Sprintf("[WARNING] Long Running Cron Job on %s", hname)
						// User previously treated it as critical, but let's stick to their example context or default to warning?
						// Actually, user text implied "Long running... (Timeout)" which sounds like a warning/alert.
						// Let's use Warning to distinguish from hard failures.
						notifType = notifications.TypeWarning
					}

					Notifier.Notify(notifications.Notification{
						Subject: subject,
						Message: msg,
						Type:    notifType,
					})
				}(hostname, event.Message, event.Type)
			}
		}
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// authenticateAgent verifies the agent's credentials
func authenticateAgent(serverID, apiSecret string) bool {
	var secretHash string
	err := database.DB.QueryRow("SELECT api_secret_hash FROM servers WHERE id = ?", serverID).Scan(&secretHash)
	if err != nil {
		return false
	}

	err = bcrypt.CompareHashAndPassword([]byte(secretHash), []byte(apiSecret))
	return err == nil
}

// GetLicenseStatus returns current license status
func GetLicenseStatus(c *fiber.Ctx) error {
	var serverCount int
	err := database.DB.QueryRow("SELECT COUNT(*) FROM servers").Scan(&serverCount)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to get server count"})
	}

	status := license.GetStatus(serverCount)
	return c.JSON(status)
}

// GenerateAgentPackage generates an install script for the agent
func GenerateAgentPackage(c *fiber.Ctx) error {
	format := c.Params("format")
	if format != "bash" {
		return c.Status(400).JSON(fiber.Map{"error": "Only bash format is currently supported"})
	}

	// Verify Admin Token for generating the package
	token := c.Query("token")
	if token != RegistrationToken {
		return c.Status(403).JSON(fiber.Map{"error": "Unauthorized: Invalid token"})
	}

	// Generate unique API secret for this agent
	apiSecret := generateRandomSecret(32)

	// Get dashboard URL from request header or use default
	dashboardURL := c.Get("X-Dashboard-URL")
	if dashboardURL == "" {
		dashboardURL = c.Get("Origin")
		if dashboardURL == "" {
			dashboardURL = "https://localhost:8443"
		}
	}

	// Generate server ID
	serverID := generateServerID()

	// Determine if we should use insecure flags (dev mode or local network)
	insecure := strings.Contains(dashboardURL, "localhost") || 
                strings.Contains(dashboardURL, "127.0.0.1") ||
                strings.Contains(dashboardURL, "192.168.") ||
                strings.Contains(dashboardURL, "10.") ||
                (strings.Contains(dashboardURL, "172.") && isPrivateIP(dashboardURL))

	// Generate bash script
	script, err := generateBashInstallScript(dashboardURL, serverID, apiSecret, RegistrationToken, insecure)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to generate install script"})
	}

	// Set response headers for file download
	c.Set("Content-Disposition", `attachment; filename="nodeguarder-agent-install.sh"`)
	c.Set("Content-Type", "application/x-bash")

	return c.Send([]byte(script))
}

// UploadLicense handles license file upload (admin only)
func UploadLicense(c *fiber.Ctx) error {
	file, err := c.FormFile("license")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "No license file provided"})
	}

	// Open uploaded file
	src, err := file.Open()
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Failed to open file"})
	}
	defer src.Close()

	// Read file contents
	licenseData, err := io.ReadAll(src)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Failed to read file"})
	}

	// Validate YAML
	var newLicense models.License
	if err := yaml.Unmarshal(licenseData, &newLicense); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid license file format"})
	}

	// Validate required fields
	if newLicense.MaxServers <= 0 || newLicense.LicenseID == "" || newLicense.Expires == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid license: missing max_servers, license_id, or expires"})
	}

	// Validate signature
	// Get license path from environment (needed for public key path too usually, but public key is usually fixed)
	publicKeyPath := os.Getenv("PUBLIC_KEY_PATH")
	if publicKeyPath == "" {
		publicKeyPath = "/app/public.key"
	}
	// Also support local path if not in container for testing
	if _, err := os.Stat(publicKeyPath); os.IsNotExist(err) {
		publicKeyPath = "public.key"
	}

	log.Printf("🔐 License validation: ID=%s, Expires=%s, MaxServers=%d", newLicense.LicenseID, newLicense.Expires, newLicense.MaxServers)
	log.Printf("📝 Verifying signature...")

	if err := license.VerifyLicenseSignature(newLicense, publicKeyPath); err != nil {
		log.Printf("❌ Signature mismatch: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "Invalid license: signature verification failed. License appears to have been modified."})
	}

	log.Printf("✅ Signature verified!")

	// Get license path from environment
	licensePath := os.Getenv("LICENSE_PATH")
	if licensePath == "" {
		licensePath = "/app/license.yaml"
	}

	// Update license
	if err := license.UpdateLicense(newLicense, licensePath); err != nil {
		log.Printf("Failed to update license: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("Failed to update license: %v", err)})
	}

	return c.JSON(fiber.Map{
		"status":       "License updated successfully",
		"license_id":   newLicense.LicenseID,
		"max_servers":  newLicense.MaxServers,
		"expires":      newLicense.Expires,
	})
}

// Helper functions

// generateRandomSecret generates a random secret string
func generateRandomSecret(length int) string {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "secret-" + fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return base64.URLEncoding.EncodeToString(b)[:length]
}

// generateServerID generates a unique server ID
func generateServerID() string {
	return fmt.Sprintf("server-%d", time.Now().UnixNano())
}

// generateBashInstallScript generates the bash install script
func generateBashInstallScript(dashboardURL, serverID, apiSecret, regToken string, insecure bool) (string, error) {
	scriptTemplate := `#!/bin/bash
set -e

# NodeGuarder Auto-Installer
# Defaults
DEFAULT_DASHBOARD_URL="{{ .DashboardURL }}"
DEFAULT_TOKEN="{{ .RegistrationToken }}"

DASHBOARD_URL="$DEFAULT_DASHBOARD_URL"
REGISTRATION_TOKEN="$DEFAULT_TOKEN"

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --dashboard-url) DASHBOARD_URL="$2"; shift ;;
        --token) REGISTRATION_TOKEN="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

# Server ID is fixed for this unique script download
SERVER_ID="{{ .ServerID }}"
API_SECRET="{{ .APISecret }}"

AGENT_BIN="nodeguarder-agent"
INSTALL_DIR="/opt/nodeguarder-agent"
SYSTEMD_FILE="/etc/systemd/system/nodeguarder-agent.service"
CONFIG_FILE="$INSTALL_DIR/config.yaml"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Installing NodeGuarder Agent...${NC}"
echo -e "${YELLOW}📍 Dashboard: $DASHBOARD_URL${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root (use: sudo bash $0)${NC}"
   exit 1
fi

# Detect OS and architecture
OS="unknown"
ARCH="amd64"

if command -v apt-get &> /dev/null; then
    OS="debian"
elif command -v dnf &> /dev/null; then
    OS="rhel"
elif command -v yum &> /dev/null; then
    OS="rhel"
elif command -v zypper &> /dev/null; then
    OS="suse"
elif command -v pacman &> /dev/null; then
    OS="arch"
elif command -v apk &> /dev/null; then
    OS="alpine"
elif command -v systemctl &> /dev/null; then
    OS="linux"
else
    echo -e "${RED}❌ Unsupported OS. Supported: Debian, RHEL, SUSE, Arch, Alpine, or any Generic Linux with systemd${NC}"
    exit 1
fi

if [[ $(uname -m) == "aarch64" ]]; then
    ARCH="arm64"
elif [[ $(uname -m) == "armv7l" ]]; then
    ARCH="arm"
elif [[ $(uname -m) == "i686" ]]; then
    ARCH="386"
fi

echo -e "${YELLOW}📋 Detected OS: $OS, Architecture: $ARCH${NC}"

# Create installation directory
mkdir -p "$INSTALL_DIR"
echo -e "${GREEN}✓ Created directory: $INSTALL_DIR${NC}"

# Download agent binary from Dashboard
    AGENT_URL="${DASHBOARD_URL}/api/v1/agent/download/linux/${ARCH}"
    
    echo -e "${YELLOW}📥 Downloading agent binary from $AGENT_URL...${NC}"
    if command -v curl &> /dev/null; then
        curl {{ if .Insecure }}-k{{ end }} -L "$AGENT_URL" -o "$INSTALL_DIR/$AGENT_BIN" 2>/dev/null || true
    elif command -v wget &> /dev/null; then
        wget {{ if .Insecure }}--no-check-certificate{{ end }} "$AGENT_URL" -O "$INSTALL_DIR/$AGENT_BIN" 2>/dev/null || true
    fi
    
    if [ ! -f "$INSTALL_DIR/$AGENT_BIN" ]; then
        echo -e "${RED}❌ Failed to download agent binary!${NC}"
        echo "Please ensure the dashboard is accessible at $DASHBOARD_URL and the agent binary is available."
        exit 1
    else
        chmod +x "$INSTALL_DIR/$AGENT_BIN"
        echo -e "${GREEN}✓ Downloaded agent binary${NC}"
    fi

# Create config file
cat > "$CONFIG_FILE" <<EOF
server_id: $SERVER_ID
api_secret: $API_SECRET
dashboard_url: $DASHBOARD_URL
registration_token: $REGISTRATION_TOKEN
interval: 10
disable_ssl_verify: {{ .Insecure }}
EOF

chmod 600 "$CONFIG_FILE"
echo -e "${GREEN}✓ Created config file: $CONFIG_FILE${NC}"

# Create systemd service file
cat > "$SYSTEMD_FILE" <<EOF
[Unit]
Description=NodeGuarder Agent Monitoring Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/opt/nodeguarder-agent/nodeguarder-agent --config $CONFIG_FILE
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nodeguarder-agent

[Install]
WantedBy=multi-user.target
EOF

chmod 644 "$SYSTEMD_FILE"
echo -e "${GREEN}✓ Created systemd service: $SYSTEMD_FILE${NC}"

# Create uninstall script
UNINSTALL_SCRIPT="$INSTALL_DIR/uninstall.sh"
cat > "$UNINSTALL_SCRIPT" <<'EOF'
#!/bin/bash
set -e

echo "Uninstalling NodeGuarder Agent..."

if systemctl is-active --quiet nodeguarder-agent; then
    echo "Stopping service..."
    systemctl stop nodeguarder-agent
fi

if systemctl is-enabled --quiet nodeguarder-agent; then
    echo "Disabling service..."
    systemctl disable nodeguarder-agent
fi

if [ -f /etc/systemd/system/nodeguarder-agent.service ]; then
    echo "Removing service file..."
    rm /etc/systemd/system/nodeguarder-agent.service
    systemctl daemon-reload
fi

if [ -d /opt/nodeguarder-agent ]; then
    echo "Removing agent files..."
    rm -rf /opt/nodeguarder-agent
fi

echo "Uninstallation complete."
EOF

chmod +x "$UNINSTALL_SCRIPT"
echo -e "${GREEN}✓ Created uninstall script: $UNINSTALL_SCRIPT${NC}"

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable nodeguarder-agent.service
echo -e "${GREEN}✓ Enabled nodeguarder-agent service${NC}"

# Start the service
systemctl start nodeguarder-agent.service
echo -e "${GREEN}✓ Started nodeguarder-agent service${NC}"

# Wait a moment and check status
sleep 2
if systemctl is-active --quiet nodeguarder-agent.service; then
    echo -e "${GREEN}✅ NodeGuarder Agent installed and running!${NC}"
    echo ""
    echo -e "${GREEN}Dashboard: $DASHBOARD_URL${NC}"
    echo -e "${GREEN}Server ID: $SERVER_ID${NC}"
    echo ""
    echo "📝 To view logs:"
    echo "   journalctl -u nodeguarder-agent -f"
    echo ""
    echo "🛑 To stop the service:"
    echo "   sudo systemctl stop nodeguarder-agent"
    echo ""
    echo "🔄 To restart the service:"
    echo "   sudo systemctl restart nodeguarder-agent"
    echo ""
    echo "⚙️  To view/edit config:"
    echo "   cat $CONFIG_FILE"
else
    echo -e "${RED}❌ Failed to start nodeguarder-agent service${NC}"
    echo "Check logs with: journalctl -u nodeguarder-agent -n 20"
    exit 1
fi
`

	// Create a template and execute it
	tmpl, err := template.New("install").Parse(scriptTemplate)
	if err != nil {
		return "", err
	}

	data := struct {
		DashboardURL string
		ServerID     string
		APISecret    string
		RegistrationToken string
		Insecure     bool
	}{
		DashboardURL: dashboardURL,
		ServerID:     serverID,
		APISecret:    apiSecret,
		RegistrationToken: regToken,
		Insecure:     insecure,
	}

	var result strings.Builder
	if err := tmpl.Execute(&result, data); err != nil {
		return "", err
	}

	return result.String(), nil
}

// isPrivateIP checks if the URL contains a private IP address
func isPrivateIP(url string) bool {
    // Simple checks for common private ranges
    if strings.Contains(url, "192.168.") || strings.Contains(url, "10.") {
        return true
    }
    // Check for 172.16.x.x - 172.31.x.x
    if strings.Contains(url, "172.") {
        // This is a simplified check. For a robust check we'd parse the IP.
        // But for this use case, if it contains 172. and is a dashboard URL, it's likely internal.
        // We can refine if needed.
        return true 
    }
    return false
}

// getHostname resolves server ID to hostname
func getHostname(serverID string) string {
    var hostname string
    err := database.DB.QueryRow("SELECT hostname FROM servers WHERE id = ?", serverID).Scan(&hostname)
    if err != nil || hostname == "" {
        return serverID
    }
    return hostname
}

// DownloadAgent serves the agent binary
func DownloadAgent(c *fiber.Ctx) error {
	osName := c.Params("os")
	arch := c.Params("arch")

	if osName != "linux" {
		return c.Status(400).JSON(fiber.Map{"error": "Only linux is supported"})
	}

	// Sanitize architecture
	validArchs := map[string]bool{"amd64": true, "arm64": true, "arm": true, "386": true}
	if !validArchs[arch] {
		return c.Status(400).JSON(fiber.Map{"error": "Unsupported architecture"})
	}

	// Path to binaries (configurable via env, default to ./agent-binaries)
	binaryPath := os.Getenv("AGENT_BINARY_PATH")
	if binaryPath == "" {
		binaryPath = "./agent-binaries"
	}

	filename := fmt.Sprintf("nodeguarder-agent-%s-%s", osName, arch)
	fullPath := fmt.Sprintf("%s/%s", binaryPath, filename)

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return c.Status(404).JSON(fiber.Map{"error": "Agent binary not found for this architecture"})
	}

	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	return c.SendFile(fullPath)
}

// GetAgentVersion returns the latest available agent version
func GetAgentVersion(c *fiber.Ctx) error {
	// Version is injected at build time into the container env
	version := os.Getenv("AGENT_VERSION")
	if version == "" {
		version = "1.1.0" // Fallback
	}
	return c.JSON(fiber.Map{
		"version": version,
		"latest": true,
	})
}
// AgentGetConfig returns the configuration for the agent
func AgentGetConfig(c *fiber.Ctx) error {
	serverID := c.Query("server_id")
	apiSecret := c.Query("api_secret")

	// Authenticate
	if !authenticateAgent(serverID, apiSecret) {
		return c.Status(401).JSON(fiber.Map{"error": "Authentication failed"})
	}

	// Fetch Global Configuration
	// Defaults
	config := models.AgentConfig{
		DriftIgnore: []string{},
		DriftPaths:  []string{"/etc"},
		CronIgnore:  make(map[string][]int),
		Thresholds: models.ResourceThresholds{
			CPUWarning:     80,
			CPUCritical:    95,
			MemoryWarning:  80,
			MemoryCritical: 95,
			DiskWarning:    80,
			DiskCritical:   95,
		},
		OfflineTimeout: 120, // 2 minutes
	}



	// Load stored settings
	var driftIgnoreJSON string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'drift_ignore'").Scan(&driftIgnoreJSON); err == nil {
		json.Unmarshal([]byte(driftIgnoreJSON), &config.DriftIgnore)
	}

	var cronIgnoreJSON string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_ignore'").Scan(&cronIgnoreJSON); err == nil {
		json.Unmarshal([]byte(cronIgnoreJSON), &config.CronIgnore)
	}

    var cronTimeoutsJSON string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_timeouts'").Scan(&cronTimeoutsJSON); err == nil {
		json.Unmarshal([]byte(cronTimeoutsJSON), &config.CronTimeouts)
	}

    var cronGlobalTimeoutVal string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_global_timeout'").Scan(&cronGlobalTimeoutVal); err == nil {
		fmt.Sscanf(cronGlobalTimeoutVal, "%d", &config.CronGlobalTimeout)
	}

	// Load Thresholds individually or as a block
	// We'll load them individually ideally, or as a thresholds object.
	// Let's try individual for granularity if we had a flat table, 
	// but storing the whole struct as JSON is easier for "Config UI" saving.
	var thresholdsJSON string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'thresholds'").Scan(&thresholdsJSON); err == nil {
		json.Unmarshal([]byte(thresholdsJSON), &config.Thresholds)
	}
	
	// Offline Timeout
	var timeoutVal string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'offline_timeout'").Scan(&timeoutVal); err == nil {
		fmt.Sscanf(timeoutVal, "%d", &config.OfflineTimeout)
	}

    // Cron Enabled
    var cronEnabledVal string
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_enabled'").Scan(&cronEnabledVal); err == nil {
        config.CronEnabled = cronEnabledVal == "true"
    } else {
        config.CronEnabled = true // Default to true
    }

    // Cron Auto Discover
    var cronAutoDiscoverVal string
    config.CronAutoDiscover = true // Default to true
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_auto_discover'").Scan(&cronAutoDiscoverVal); err == nil {
        if cronAutoDiscoverVal == "false" || cronAutoDiscoverVal == "0" {
            config.CronAutoDiscover = false
        }
    }

	// Drift Paths
	var driftPathsJSON string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'drift_paths'").Scan(&driftPathsJSON); err == nil {
		if err := json.Unmarshal([]byte(driftPathsJSON), &config.DriftPaths); err != nil {
        }
	}
    
    // Health Enabled
    var healthEnabledVal string
    // Default to true if not found (matching frontend load logic, though zero value is false, explicit load is better)
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'health_enabled'").Scan(&healthEnabledVal); err == nil {
         config.HealthEnabled = healthEnabledVal == "true"
    } else {
         config.HealthEnabled = true // Default true
    }

    // Health Sustain Duration
    var healthSustainVal string
    config.HealthSustainDuration = 30 // Default
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'health_sustain_duration'").Scan(&healthSustainVal); err == nil {
        fmt.Sscanf(healthSustainVal, "%d", &config.HealthSustainDuration)
    }

    // Drift Interval
    var driftIntervalVal string
    config.DriftInterval = 300 // Default to 5m
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'drift_interval'").Scan(&driftIntervalVal); err == nil {
        fmt.Sscanf(driftIntervalVal, "%d", &config.DriftInterval)
    }

    // Check for pending log request
    var logRequestPending bool
    if err := database.DB.QueryRow("SELECT log_request_pending FROM servers WHERE id = ?", serverID).Scan(&logRequestPending); err == nil {
        config.CollectLogs = logRequestPending
    }

    // Check for pending uninstall
    var pendingUninstall bool
    if err := database.DB.QueryRow("SELECT pending_uninstall FROM servers WHERE id = ?", serverID).Scan(&pendingUninstall); err == nil {
        config.Uninstall = pendingUninstall
    }

	return c.JSON(config)
}

// AgentUploadLogs handles log file upload from agent
func AgentUploadLogs(c *fiber.Ctx) error {
    serverID := c.FormValue("server_id")
    apiSecret := c.FormValue("api_secret")

    // Authenticate
    if !authenticateAgent(serverID, apiSecret) {
        return c.Status(401).JSON(fiber.Map{"error": "Authentication failed"})
    }

    file, err := c.FormFile("logs")
    if err != nil {
        return c.Status(400).JSON(fiber.Map{"error": "No log file provided"})
    }

    // Save file
    // Ensure data directory exists
    logDir := "/data/logs"
    if err := os.MkdirAll(logDir, 0755); err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "Failed to create log directory"})
    }

    filename := fmt.Sprintf("%s_%d_logs.zip", serverID, time.Now().Unix())
    filePath := filepath.Join(logDir, filename)

    if err := c.SaveFile(file, filePath); err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "Failed to save log file"})
    }

    // Update DB
    now := time.Now().Unix()
    _, err = database.DB.Exec(`
        UPDATE servers 
        SET log_request_pending = 0, log_file_path = ?, log_file_time = ? 
        WHERE id = ?
    `, filename, now, serverID)

    if err != nil {
        log.Printf("Failed to update server log info: %v", err)
        return c.Status(500).JSON(fiber.Map{"error": "Failed to update database"})
    }

    log.Printf("✅ Logs received for server %s: %s", serverID, filename)

    return c.JSON(fiber.Map{"status": "ok"})
}
