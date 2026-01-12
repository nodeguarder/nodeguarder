package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type DiscordProvider struct {
	WebhookURL string
}

func NewDiscordProvider(webhookURL string) *DiscordProvider {
	return &DiscordProvider{WebhookURL: webhookURL}
}

func (p *DiscordProvider) Name() string {
	return "Discord"
}

func (p *DiscordProvider) Send(n Notification) error {
	if p.WebhookURL == "" {
		return nil
	}

	// Discord Embed Color
	color := 0x00FF00 // Green
	if n.Type == TypeCritical {
		color = 0xFF0000 // Red
	} else if n.Type == TypeWarning {
		color = 0xFFA500 // Orange
	}

	payload := map[string]interface{}{
		"username": "NodeGuarder",
		"embeds": []map[string]interface{}{
			{
				"title":       n.Subject,
				"description": n.Message,
				"color":       color,
				"timestamp":   time.Now().Format(time.RFC3339),
			},
		},
	}

	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := http.Post(p.WebhookURL, "application/json", bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("failed to send discord notification, status: %d", resp.StatusCode)
	}

	return nil
}
