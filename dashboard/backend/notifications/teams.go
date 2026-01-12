package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type TeamsProvider struct {
	WebhookURL string
}

func NewTeamsProvider(webhookURL string) *TeamsProvider {
	return &TeamsProvider{
		WebhookURL: webhookURL,
	}
}

func (p *TeamsProvider) Name() string {
	return "Microsoft Teams"
}

func (p *TeamsProvider) Send(n Notification) error {
	if p.WebhookURL == "" {
		return nil
	}

	// Determine color based on type
	color := "0076D7" // Default Blue
	switch n.Type {
	case TypeCritical:
		color = "FF0000" // Red
	case TypeWarning:
		color = "FFA500" // Orange
	case TypeSuccess:
		color = "00FF00" // Green
	}

	// Create MessageCard payload
	payload := map[string]interface{}{
		"@type":      "MessageCard",
		"@context":   "http://schema.org/extensions",
		"themeColor": color,
		"summary":    n.Subject,
		"sections": []map[string]interface{}{
			{
				"activityTitle":    n.Subject,
				"activitySubtitle": n.Type,
				"text":             n.Message,
				"markdown":         true,
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", p.WebhookURL, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("teams API returned status: %d", resp.StatusCode)
	}

	return nil
}
