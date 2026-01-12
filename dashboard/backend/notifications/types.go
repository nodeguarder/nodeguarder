package notifications

type NotificationType string

const (
	TypeCritical NotificationType = "CRITICAL"
	TypeWarning  NotificationType = "WARNING"
	TypeInfo     NotificationType = "INFO"
	TypeSuccess  NotificationType = "SUCCESS"
)

type Notification struct {
	Subject string
	Message string
	Type    NotificationType
}

type Provider interface {
	Send(n Notification) error
	Name() string
}

type Service interface {
	Notify(n Notification) error
	UpdateSettings(settings Settings)
}

type Settings struct {
	SlackWebhookURL string
	TeamsWebhookURL string
    DiscordWebhookURL string
	EmailRecipients []string
	SMTPServer      string
	SMTPPort        int
	SMTPUser        string
	SMTPPassword    string
	AlertsEnabled   bool
	NotifyOnWarning bool
}
