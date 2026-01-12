package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type SlackProvider struct {
	WebhookURL string
}

func NewSlackProvider(webhookURL string) *SlackProvider {
	return &SlackProvider{WebhookURL: webhookURL}
}

func (p *SlackProvider) Name() string {
	return "Slack"
}

func (p *SlackProvider) Send(n Notification) error {
	if p.WebhookURL == "" {
		return nil
	}

	color := "#36a64f" // Green
	if n.Type == TypeCritical {
		color = "#ff0000" // Red
	} else if n.Type == TypeWarning {
		color = "#ffcc00" // Yellow
	}

	payload := map[string]interface{}{
		"attachments": []map[string]interface{}{
			{
				"color": color,
				"title": n.Subject,
				"text":  n.Message,
				"ts":    time.Now().Unix(),
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
		return fmt.Errorf("failed to send slack notification, status: %d", resp.StatusCode)
	}

	return nil
}
