package handlers

import (
	"log"
    "os"
	"strings"

	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/models"
	"github.com/yourusername/health-dashboard-backend/notifications"
)

var Notifier notifications.Service

func InitNotifications() {
	Notifier = notifications.NewNotificationService()
	
	// Load settings from DB
	// We only have one row with ID=1
	var s models.AlertSettings
	err := database.DB.QueryRow(`
		SELECT id, slack_webhook_url, teams_webhook_url, COALESCE(discord_webhook_url, ''), email_recipients, smtp_server, smtp_port, smtp_user, smtp_password, alerts_enabled, notify_on_warning
		FROM alert_settings WHERE id = 1
	`).Scan(&s.ID, &s.SlackWebhookURL, &s.TeamsWebhookURL, &s.DiscordWebhookURL, &s.EmailRecipients, &s.SMTPServer, &s.SMTPPort, &s.SMTPUser, &s.SMTPPassword, &s.AlertsEnabled, &s.NotifyOnWarning)

	if err != nil {
        // Fallback: Check for Environment Variables (for testing/containers)
        // This ensures main application notifications work if DB is empty but env vars are set.
        settings := notifications.Settings{}
        hasSettings := false

        if url := os.Getenv("DISCORD_WEBHOOK_URL"); url != "" {
            settings.DiscordWebhookURL = url
            hasSettings = true
        }
        if url := os.Getenv("SLACK_WEBHOOK_URL"); url != "" {
            settings.SlackWebhookURL = url
            hasSettings = true
        }
        if url := os.Getenv("TEAMS_WEBHOOK_URL"); url != "" {
            settings.TeamsWebhookURL = url
            hasSettings = true
        }
        if server := os.Getenv("SMTP_SERVER"); server != "" {
             settings.SMTPServer = server
             settings.SMTPUser = os.Getenv("SMTP_USER")
             settings.SMTPPassword = os.Getenv("SMTP_PASSWORD")
             // ignoring detailed recipient/port parsing for brevity in this fallback, assuming mainly for webhooks
             // but could expand if needed.
             hasSettings = true
        }

        if hasSettings {
             settings.AlertsEnabled = true
             Notifier.UpdateSettings(settings)
             log.Println("⚠️  Notification settings loaded from Environment Variables (Database empty)")
        }

		return
	}

	recipients := []string{}
	if s.EmailRecipients != "" {
		for _, r := range strings.Split(s.EmailRecipients, ",") {
			recipients = append(recipients, strings.TrimSpace(r))
		}
	}

	settings := notifications.Settings{
		SlackWebhookURL: s.SlackWebhookURL,
		TeamsWebhookURL: s.TeamsWebhookURL,
        DiscordWebhookURL: s.DiscordWebhookURL,
		EmailRecipients: recipients,
		SMTPServer:      s.SMTPServer,
		SMTPPort:        s.SMTPPort,
		SMTPUser:        s.SMTPUser,
		SMTPPassword:    s.SMTPPassword,
		AlertsEnabled:   s.AlertsEnabled,
		NotifyOnWarning: s.NotifyOnWarning,
	}
    
	Notifier.UpdateSettings(settings)
    log.Println("✅ Notification service initialized")
}
