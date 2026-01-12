package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/models"
	"github.com/yourusername/health-dashboard-backend/notifications"
)

// GetAlertSettings returns the current alert settings
func GetAlertSettings(c *fiber.Ctx) error {
	var s models.AlertSettings
	err := database.DB.QueryRow(`
		SELECT id, slack_webhook_url, teams_webhook_url, COALESCE(discord_webhook_url, ''), email_recipients, smtp_server, smtp_port, smtp_user, smtp_password, alerts_enabled, notify_on_warning
		FROM alert_settings WHERE id = 1
	`).Scan(&s.ID, &s.SlackWebhookURL, &s.TeamsWebhookURL, &s.DiscordWebhookURL, &s.EmailRecipients, &s.SMTPServer, &s.SMTPPort, &s.SMTPUser, &s.SMTPPassword, &s.AlertsEnabled, &s.NotifyOnWarning)

	if err != nil {
		// Return empty default settings if not passed
		return c.JSON(models.AlertSettings{ID: 1})
	}
    
    // Mask password
    s.SMTPPassword = "" 

	return c.JSON(s)
}

// SaveAlertSettings updates the alert settings
func SaveAlertSettings(c *fiber.Ctx) error {
	var req models.AlertSettings
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Handle password update: if empty, keep existing.
    // Ideally user sends "******" or empty string to mean "no change"
    // Let's assume empty string means no change strictly for update.
    // But for initial save it might be needed.
    
    // Check existing password if provided is empty
	if req.SMTPPassword == "" {
        var existingPass string
        err := database.DB.QueryRow("SELECT smtp_password FROM alert_settings WHERE id = 1").Scan(&existingPass)
        if err == nil {
            req.SMTPPassword = existingPass
        }
    }

	// Upsert (since ID=1)
	_, err := database.DB.Exec(`
		INSERT INTO alert_settings (id, slack_webhook_url, teams_webhook_url, discord_webhook_url, email_recipients, smtp_server, smtp_port, smtp_user, smtp_password, alerts_enabled, notify_on_warning)
		VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			slack_webhook_url=excluded.slack_webhook_url,
			teams_webhook_url=excluded.teams_webhook_url,
            discord_webhook_url=excluded.discord_webhook_url,
			email_recipients=excluded.email_recipients,
			smtp_server=excluded.smtp_server,
			smtp_port=excluded.smtp_port,
			smtp_user=excluded.smtp_user,
			smtp_password=excluded.smtp_password,
			alerts_enabled=excluded.alerts_enabled,
            notify_on_warning=excluded.notify_on_warning
	`, req.SlackWebhookURL, req.TeamsWebhookURL, req.DiscordWebhookURL, req.EmailRecipients, req.SMTPServer, req.SMTPPort, req.SMTPUser, req.SMTPPassword, req.AlertsEnabled, req.NotifyOnWarning)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save settings"})
	}

	// Update the live service
    recipients := []string{}
	if req.EmailRecipients != "" {
		for _, r := range strings.Split(req.EmailRecipients, ",") {
			recipients = append(recipients, strings.TrimSpace(r))
		}
	}
    
	settings := notifications.Settings{
		SlackWebhookURL: req.SlackWebhookURL,
		TeamsWebhookURL: req.TeamsWebhookURL,
        DiscordWebhookURL: req.DiscordWebhookURL,
        EmailRecipients: recipients,
		SMTPServer:      req.SMTPServer,
		SMTPPort:        req.SMTPPort,
		SMTPUser:        req.SMTPUser,
		SMTPPassword:    req.SMTPPassword,
		AlertsEnabled:   req.AlertsEnabled,
        NotifyOnWarning: req.NotifyOnWarning,
	}
	Notifier.UpdateSettings(settings)

	return c.JSON(fiber.Map{"status": "ok"})
}

// TestAlert sends a test notification
func TestAlert(c *fiber.Ctx) error {
    // We reuse the saved settings or allow testing params?
    // Using saved settings is safer/easier
    
    // Send a test Warning
    // Send a test Warning
    // Skipped Info test to ensure it goes through as Critical
    
    // Actually, Send() method on Provider is public, but Service.Notify checks settings.
    // Let's send a Critical test message so it always goes through if alerts are enabled.
    
    if err := Notifier.Notify(notifications.Notification{
        Subject: "Test Notification",
        Message: "This is a test notification from NodeGuarder.",
        Type: notifications.TypeCritical,
    }); err != nil {
        log.Printf("❌ Test Alert Failed: %v", err)
        return c.Status(500).JSON(fiber.Map{"error": err.Error()})
    }
    
    return c.JSON(fiber.Map{"status": "ok"})
}
// GetConfig returns the global configuration settings
func GetConfig(c *fiber.Ctx) error {
	config := models.AgentConfig{
		DriftIgnore:    []string{},
		DriftPaths:     []string{"/etc"}, // Default
		CronIgnore:     make(map[string][]int),
		Thresholds: models.ResourceThresholds{
			CPUWarning:     80,
			CPUCritical:    95,
			MemoryWarning:  80,
			MemoryCritical: 95,
			DiskWarning:    80,
			DiskCritical:   95,
		},
		OfflineTimeout: 60,
        CronGlobalTimeout: 300,
        CronTimeouts: make(map[string]int),
	}

	loadJSON := func(key string, target interface{}) {
		var val string
		if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val); err == nil {
			json.Unmarshal([]byte(val), target)
		}
	}

	loadJSON("drift_ignore", &config.DriftIgnore)
	loadJSON("cron_ignore", &config.CronIgnore)
	loadJSON("cron_timeouts", &config.CronTimeouts)
	loadJSON("thresholds", &config.Thresholds)
	
	// Load drift_paths (handling legacy single path migration if needed, but for now just load new key)
	// Optionally we could check "drift_path" if "drift_paths" is empty, but let's stick to clean cut.
	loadJSON("drift_paths", &config.DriftPaths)

	var val string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'offline_timeout'").Scan(&val); err == nil {
		fmt.Sscanf(val, "%d", &config.OfflineTimeout)
	}
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_global_timeout'").Scan(&val); err == nil {
		fmt.Sscanf(val, "%d", &config.CronGlobalTimeout)
	}
    
    // Load drift_interval
    config.DriftInterval = 300 // Default 5 mins
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'drift_interval'").Scan(&val); err == nil {
        fmt.Sscanf(val, "%d", &config.DriftInterval)
    }

    // Load health settings
    config.HealthEnabled = true // Default
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'health_enabled'").Scan(&val); err == nil {
         if val == "false" || val == "0" {
            config.HealthEnabled = false
        }
    }

    config.HealthSustainDuration = 30 // Default
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'health_sustain_duration'").Scan(&val); err == nil {
        fmt.Sscanf(val, "%d", &config.HealthSustainDuration)
    }

    config.StabilityWindow = 120 // Default 2 mins
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'stability_window'").Scan(&val); err == nil {
        fmt.Sscanf(val, "%d", &config.StabilityWindow)
    }

	// Aggregate Discovered Cron Jobs
	// Aggregate Discovered Cron Jobs
    var discoveredJobs []interface{}
    rows, err := database.DB.Query("SELECT seen_cron_jobs FROM servers WHERE seen_cron_jobs IS NOT NULL AND seen_cron_jobs != ''")
    if err == nil {
        defer rows.Close()
        uniqueJobs := make(map[string]models.JobRecord)
        
        for rows.Next() {
            var jobsJSON string
            if err := rows.Scan(&jobsJSON); err == nil {
                // Try to unmarshal as []JobRecord (New Agent)
                var jobRecords []models.JobRecord
                if err := json.Unmarshal([]byte(jobsJSON), &jobRecords); err == nil {
                     for _, rec := range jobRecords {
                        // Keep the one with latest execution time, or just overwrite
                        if existing, ok := uniqueJobs[rec.Command]; !ok || rec.LastExecTime > existing.LastExecTime {
                            uniqueJobs[rec.Command] = rec
                        }
                    }
                    continue
                }
                
                // Fallback: Try []string (Old Agent)
                var jobStrings []string
                if err := json.Unmarshal([]byte(jobsJSON), &jobStrings); err == nil {
                    for _, cmd := range jobStrings {
                        if _, ok := uniqueJobs[cmd]; !ok {
                             uniqueJobs[cmd] = models.JobRecord{Command: cmd}
                        }
                    }
                }
            }
        }
        
        for _, rec := range uniqueJobs {
            discoveredJobs = append(discoveredJobs, rec)
        }
    }

    // Load cron_enabled
    var cronEnabledVal string
    // Default to true if not found
    config.CronEnabled = true
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_enabled'").Scan(&cronEnabledVal); err == nil {
        if cronEnabledVal == "false" || cronEnabledVal == "0" {
            config.CronEnabled = false
        }
    }

    // Load cron_auto_discover
    var cronAutoDiscoverVal string
    config.CronAutoDiscover = true // Default to true
    if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'cron_auto_discover'").Scan(&cronAutoDiscoverVal); err == nil {
         if cronAutoDiscoverVal == "false" || cronAutoDiscoverVal == "0" {
            config.CronAutoDiscover = false
        }
    }

	// Return extended config for frontend
	return c.JSON(fiber.Map{
        "drift_ignore": config.DriftIgnore,
        "drift_paths": config.DriftPaths,
        "drift_interval": config.DriftInterval,
        "health_enabled": config.HealthEnabled,
        "health_sustain_duration": config.HealthSustainDuration,
        "cron_enabled": config.CronEnabled,
        "cron_auto_discover": config.CronAutoDiscover,
        "cron_ignore": config.CronIgnore,
        "cron_global_timeout": config.CronGlobalTimeout,
        "cron_timeouts": config.CronTimeouts,
        "thresholds": config.Thresholds,
        "offline_timeout": config.OfflineTimeout,
        "stability_window": config.StabilityWindow,
        "discovered_cron_jobs": discoveredJobs,
    })
}

// SaveConfig updates the global configuration settings
func SaveConfig(c *fiber.Ctx) error {
	var req models.AgentConfig
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	saveJSON := func(key string, val interface{}) {
		bytes, _ := json.Marshal(val)
		_, err := database.DB.Exec(`
			INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
		`, key, string(bytes), time.Now().Unix())
		if err != nil {
			log.Printf("Failed to save config %s: %v", key, err)
		}
	}

	saveJSON("drift_ignore", req.DriftIgnore)
	saveJSON("drift_paths", req.DriftPaths)
	saveJSON("cron_ignore", req.CronIgnore)
	saveJSON("cron_timeouts", req.CronTimeouts)
	saveJSON("thresholds", req.Thresholds)
	
	database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "offline_timeout", fmt.Sprintf("%d", req.OfflineTimeout), time.Now().Unix())

    database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "cron_global_timeout", fmt.Sprintf("%d", req.CronGlobalTimeout), time.Now().Unix())

    database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "cron_enabled", fmt.Sprintf("%t", req.CronEnabled), time.Now().Unix())

    database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "cron_auto_discover", fmt.Sprintf("%t", req.CronAutoDiscover), time.Now().Unix())

    database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "drift_interval", fmt.Sprintf("%d", req.DriftInterval), time.Now().Unix())

    database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "health_enabled", fmt.Sprintf("%t", req.HealthEnabled), time.Now().Unix())

    database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "health_sustain_duration", fmt.Sprintf("%d", req.HealthSustainDuration), time.Now().Unix())

    database.DB.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
	`, "stability_window", fmt.Sprintf("%d", req.StabilityWindow), time.Now().Unix())

	return c.JSON(fiber.Map{"status": "ok"})
}
