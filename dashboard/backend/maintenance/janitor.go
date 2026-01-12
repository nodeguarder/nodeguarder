package maintenance

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/notifications"
)

// StartJanitor starts the background maintenance worker
func StartJanitor() {
	go func() {
		log.Println("🧹 Janitor started (Interval: 24h, Retention: 90 days)")
		
		// Run once on startup after a delay
		time.Sleep(1 * time.Minute)
		runCleanup()

		// Then run daily
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			runCleanup()
		}
	}()
}

func runCleanup() {
	log.Println("🧹 Janitor: Starting cleaning cycle...")

	// 1. Delete metrics older than 90 days
	days := 90
	retention := time.Now().AddDate(0, 0, -days).Unix()
	
	result, err := database.DB.Exec("DELETE FROM metrics WHERE timestamp < ?", retention)
	if err != nil {
		log.Printf("❌ Janitor: Failed to prune metrics: %v", err)
	} else {
		rows, _ := result.RowsAffected()
		if rows > 0 {
			log.Printf("🧹 Janitor: Pruned %d old metric records", rows)
		} else {
			log.Println("🧹 Janitor: No old metrics to prune")
		}
	}

	// 2. Delete events older than 90 days
	result, err = database.DB.Exec("DELETE FROM events WHERE timestamp < ?", retention)
	if err != nil {
		log.Printf("❌ Janitor: Failed to prune events: %v", err)
	} else {
		rows, _ := result.RowsAffected()
		if rows > 0 {
			log.Printf("🧹 Janitor: Pruned %d old event records", rows)
		}
	}

	// 3. Optimize database
	_, err = database.DB.Exec("VACUUM")
	if err != nil {
		log.Printf("❌ Janitor: Failed to VACUUM database: %v", err)
	} else {
		log.Println("✨ Janitor: Database optimized (VACUUM completed)")
	}
}

// StartHealthWatcher starts the background health check worker
func StartHealthWatcher() {
	go func() {
		// Interval 5s to be reactive for "Smart Reactive" features
		// In production this might be tunable, but 5s is fine for now
		log.Println("❤️  Health Watchdog started (Check Interval: 5s)")

		notifier := notifications.NewNotificationService()

		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			checkServerHealth(notifier)
		}
	}()
}

func checkServerHealth(notifier notifications.Service) {
	// Get timeout from settings (default 120s)
	timeout := 120
	var val string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'offline_timeout'").Scan(&val); err == nil {
		fmt.Sscanf(val, "%d", &timeout)
	}

	// Threshold
	threshold := time.Now().Unix() - int64(timeout)

	// Identify servers going offline
	rows, err := database.DB.Query("SELECT id, hostname FROM servers WHERE last_seen < ? AND health_status != 'offline'", threshold)
	if err != nil {
		log.Printf("❌ Watchdog: Failed to query offline servers: %v", err)
		return
	}
	defer rows.Close()

	var offlineServers []struct {
		ID       string
		Hostname string
	}

	for rows.Next() {
		var s struct {
			ID       string
			Hostname string
		}
		if err := rows.Scan(&s.ID, &s.Hostname); err == nil {
			offlineServers = append(offlineServers, s)
		}
	}

	if len(offlineServers) > 0 {
		// Load notification settings
		settings := loadNotificationSettings()
		notifier.UpdateSettings(settings)

		for _, s := range offlineServers {
			// Notify
			notifier.Notify(notifications.Notification{
				Subject: fmt.Sprintf("[CRITICAL] Server Offline: %s", s.Hostname),
				Message: fmt.Sprintf("Server %s (%s) has gone OFFLINE (Timeout: %ds). Last seen > %d seconds ago.", s.Hostname, s.ID, timeout, timeout),
				Type:    notifications.TypeCritical,
			})

			// Update Status
			_, err := database.DB.Exec("UPDATE servers SET health_status = 'offline' WHERE id = ?", s.ID)
			if err != nil {
				log.Printf("❌ Watchdog: Failed to mark server %s as offline: %v", s.ID, err)
			} else {
				log.Printf("📉 Watchdog: Marked %s (%s) as OFFLINE", s.Hostname, s.ID)
			}
		}
	}
}

func loadNotificationSettings() notifications.Settings {
	settings := notifications.Settings{}
	
	// Load from alert_settings table (matching handlers/notifications.go logic)
	// We only have one row with ID=1
	var s struct {
		SlackWebhookURL   string
		TeamsWebhookURL   string
		DiscordWebhookURL string
		EmailRecipients   string
		SMTPServer        string
		SMTPPort          int
		SMTPUser          string
		SMTPPassword      string
		AlertsEnabled     bool
		NotifyOnWarning   bool
	}

	err := database.DB.QueryRow(`
		SELECT slack_webhook_url, teams_webhook_url, COALESCE(discord_webhook_url, ''), email_recipients, smtp_server, smtp_port, smtp_user, smtp_password, alerts_enabled, notify_on_warning
		FROM alert_settings WHERE id = 1
	`).Scan(&s.SlackWebhookURL, &s.TeamsWebhookURL, &s.DiscordWebhookURL, &s.EmailRecipients, &s.SMTPServer, &s.SMTPPort, &s.SMTPUser, &s.SMTPPassword, &s.AlertsEnabled, &s.NotifyOnWarning)

	if err == nil {
		recipients := []string{}
		if s.EmailRecipients != "" {
			for _, r := range strings.Split(s.EmailRecipients, ",") {
				recipients = append(recipients, strings.TrimSpace(r))
			}
		}

		settings = notifications.Settings{
			SlackWebhookURL:   s.SlackWebhookURL,
			TeamsWebhookURL:   s.TeamsWebhookURL,
			DiscordWebhookURL: s.DiscordWebhookURL,
			EmailRecipients:   recipients,
			SMTPServer:        s.SMTPServer,
			SMTPPort:          s.SMTPPort,
			SMTPUser:          s.SMTPUser,
			SMTPPassword:      s.SMTPPassword,
			AlertsEnabled:     s.AlertsEnabled,
			NotifyOnWarning:   s.NotifyOnWarning,
		}
	} else {
        // Fallback: Check for Environment Variables (useful for testing/containers without DB init)
        // This ensures that even if DB is empty, if env vars are set, alerts work.
        
        // Discord
        if url := os.Getenv("DISCORD_WEBHOOK_URL"); url != "" {
            settings.DiscordWebhookURL = url
            settings.AlertsEnabled = true
        }
        
        // Slack
        if url := os.Getenv("SLACK_WEBHOOK_URL"); url != "" {
            settings.SlackWebhookURL = url
            settings.AlertsEnabled = true
        }
        
        // MS Teams
        if url := os.Getenv("TEAMS_WEBHOOK_URL"); url != "" {
            settings.TeamsWebhookURL = url
            settings.AlertsEnabled = true
        }
        
        // Email (SMTP)
        if server := os.Getenv("SMTP_SERVER"); server != "" {
            settings.SMTPServer = server
            settings.SMTPUser = os.Getenv("SMTP_USER")
            settings.SMTPPassword = os.Getenv("SMTP_PASSWORD")
            
            portStr := os.Getenv("SMTP_PORT")
            if portStr != "" {
                fmt.Sscanf(portStr, "%d", &settings.SMTPPort)
            } else {
                settings.SMTPPort = 587 // default
            }
            
            recipients := os.Getenv("EMAIL_RECIPIENTS")
            if recipients != "" {
                for _, r := range strings.Split(recipients, ",") {
                    settings.EmailRecipients = append(settings.EmailRecipients, strings.TrimSpace(r))
                }
            }
            
            settings.AlertsEnabled = true
        }
    }
	return settings
}
