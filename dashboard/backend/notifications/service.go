package notifications

import (
	"fmt"
	"log"
    "strings"
)

type notificationService struct {
	settings Settings
}

func NewNotificationService() Service {
	return &notificationService{
		settings: Settings{AlertsEnabled: false},
	}
}

func (s *notificationService) UpdateSettings(settings Settings) {
	s.settings = settings
}

func (s *notificationService) Notify(n Notification) error {
	if !s.settings.AlertsEnabled {
		return nil
	}

	// Filter based on severity if required
	if !s.settings.NotifyOnWarning && n.Type == TypeWarning {
		return nil
	}
	// Always send Critical
	// Info messages? Currently assume if enabled and passes warning check (if warning), we send.
	// If it's INFO and NotifyOnWarning is false (implied Critical Only), maybe skip?
	// Let's assume NotifyOnWarning means "Anything below Critical is filtered out if false"
	if !s.settings.NotifyOnWarning && n.Type != TypeCritical {
		return nil 
	}

	var errs []error

	// Slack
	if s.settings.SlackWebhookURL != "" {
		slack := NewSlackProvider(s.settings.SlackWebhookURL)
		if err := slack.Send(n); err != nil {
			log.Printf("Error sending slack notification: %v", err)
			errs = append(errs, err)
		}
	}

	// MS Teams
	if s.settings.TeamsWebhookURL != "" {
		teams := NewTeamsProvider(s.settings.TeamsWebhookURL)
		if err := teams.Send(n); err != nil {
			log.Printf("Error sending teams notification: %v", err)
			errs = append(errs, err)
		}
	}

    // Discord
    if s.settings.DiscordWebhookURL != "" {
        discord := NewDiscordProvider(s.settings.DiscordWebhookURL)
        if err := discord.Send(n); err != nil {
            log.Printf("Error sending discord notification: %v", err)
            errs = append(errs, err)
        }
    }

	// Email
	if s.settings.SMTPServer != "" && len(s.settings.EmailRecipients) > 0 {
		email := NewEmailProvider(s.settings.SMTPServer, s.settings.SMTPPort, s.settings.SMTPUser, s.settings.SMTPPassword, s.settings.EmailRecipients)
		if err := email.Send(n); err != nil {
			log.Printf("Error sending email notification: %v", err)
			errs = append(errs, err)
		}
	}
    
    if len(errs) > 0 {
        // Collect error strings
        var errStrings []string
        for _, e := range errs {
            errStrings = append(errStrings, e.Error())
        }
        return fmt.Errorf("encountered errors: %s", strings.Join(errStrings, "; "))
    }

	return nil
}
