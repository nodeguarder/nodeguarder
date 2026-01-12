package models

// Server represents a monitored server
type Server struct {
	ID            string `json:"id"`
	Hostname      string `json:"hostname"`
	OSName        string `json:"os_name"`
	OSVersion     string `json:"os_version"`
	AgentVersion  string `json:"agent_version"`
	FirstSeen     int64  `json:"first_seen"`
	LastSeen      int64  `json:"last_seen"`
	HealthStatus  string `json:"health_status"`
	DriftChecksum string `json:"drift_checksum"`
	DriftChanged  bool   `json:"drift_changed"`
	SeenCronJobs  string `json:"seen_cron_jobs"` // JSON string
    LogRequestPending bool   `json:"log_request_pending"`
    LogRequestTime    int64  `json:"log_request_time"`
    LogFilePath       string `json:"log_file_path"`
    LogFileTime       int64  `json:"log_file_time"`
    PendingUninstall  bool   `json:"pending_uninstall"`
}

// Metric represents system metrics at a point in time
type Metric struct {
	ID           int64   `json:"id"`
	ServerID     string  `json:"server_id"`
	Timestamp    int64   `json:"timestamp"`
	CPUPercent   float64 `json:"cpu_percent"`
	MemTotalMB   int64   `json:"mem_total_mb"`
	MemUsedMB    int64   `json:"mem_used_mb"`
	DiskTotalGB  int64   `json:"disk_total_gb"`
	DiskUsedGB   int64   `json:"disk_used_gb"`
	LoadAvg1     float64 `json:"load_avg_1"`
	LoadAvg5     float64 `json:"load_avg_5"`
	LoadAvg15    float64 `json:"load_avg_15"`
	ProcessCount int     `json:"process_count"`
	Uptime       int64   `json:"uptime"`
}

// Event represents a system event
type Event struct {
	ID        int64  `json:"id"`
	ServerID  string `json:"server_id"`
	Timestamp int64  `json:"timestamp"`
	EventType string `json:"event_type"`
	Severity  string `json:"severity"`
	Message   string `json:"message"`
	Details   string `json:"details,omitempty"`
}

// User represents an admin user
type User struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"` // Never send password hash to client
	CreatedAt    int64  `json:"created_at"`
	PasswordChanged bool `json:"password_changed"`
}

// LoginRequest represents a login attempt
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// RegisterRequest represents the agent registration payload
type RegisterRequest struct {
	ServerID          string   `json:"server_id"`
	Hostname          string   `json:"hostname"`
	OSName            string   `json:"os_name"`
	OSVersion         string   `json:"os_version"`
	AgentVersion      string   `json:"agent_version"`
	APISecret         string   `json:"api_secret"`
	RegistrationToken string   `json:"registration_token"`
	DiscoveredCronJobs []string `json:"discovered_cron_jobs"`
}

// LoginResponse contains the JWT token
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// License represents the system license
type License struct {
	MaxServers int    `yaml:"max_servers" json:"max_servers"`
	Expires    string `yaml:"expires" json:"expires"`
	LicenseID  string `yaml:"license_id" json:"license_id"`
	Signature  string `yaml:"signature" json:"signature"`
	Company    string `yaml:"company" json:"company"`
}

// LicenseStatus represents the current license status
type LicenseStatus struct {
	MaxServers       int    `json:"max_servers"`
	CurrentServers   int    `json:"current_servers"`
	SlotsRemaining   int    `json:"slots_remaining"`
	LicenseID        string `json:"license_id"`
	Expires          string `json:"expires"`
	IsExpired        bool   `json:"is_expired"`
	ExpiresFormatted string `json:"expires_formatted"`
	Company          string `json:"company"`
}

// AlertSettings represents notification configuration
type AlertSettings struct {
	ID              int64  `json:"id"`
	SlackWebhookURL string `json:"slack_webhook_url"`
	TeamsWebhookURL string `json:"teams_webhook_url"`
    DiscordWebhookURL string `json:"discord_webhook_url"`
	EmailRecipients string `json:"email_recipients"` // Comma separated
	SMTPServer      string `json:"smtp_server"`
	SMTPPort        int    `json:"smtp_port"`
	SMTPUser        string `json:"smtp_user"`
	SMTPPassword    string `json:"smtp_password"`
	AlertsEnabled   bool   `json:"alerts_enabled"`
	NotifyOnWarning bool   `json:"notify_on_warning"`
}

// AgentConfig represents the configuration sent to agents
type AgentConfig struct {
	DriftIgnore    []string          `json:"drift_ignore"`
	DriftPaths     []string          `json:"drift_paths"`
    DriftInterval  int               `json:"drift_interval"` // Seconds
    HealthEnabled  bool              `json:"health_enabled"` // Toggle health monitoring
    HealthSustainDuration int        `json:"health_sustain_duration"` // Seconds
    StabilityWindow int              `json:"stability_window"`        // Seconds to wait before resolving alerts
    CronEnabled    bool              `json:"cron_enabled"`
	CronIgnore       map[string][]int  `json:"cron_ignore"`
	CronAutoDiscover bool              `json:"cron_auto_discover"`
	CronGlobalTimeout int               `json:"cron_global_timeout"`
	CronTimeouts      map[string]int    `json:"cron_timeouts"`  // Command -> Timeout in seconds
    CollectLogs       bool              `json:"collect_logs"`   // Command to collect logs
	Thresholds       ResourceThresholds `json:"thresholds"`
	OfflineTimeout int               `json:"offline_timeout"` // Seconds
    Uninstall      bool              `json:"uninstall"`       // Command to uninstall
}

// JobRecord tracks the state of a specific cron job (mirrors Agent struct)
type JobRecord struct {
	Command      string `json:"Command"`
	LastExecTime int64  `json:"LastExecTime"`
	ActivePID    int32  `json:"ActivePID"`
	StartTime    int64  `json:"StartTime"`
	LastExitCode int    `json:"LastExitCode"`
	LastErrorMsg string `json:"LastErrorMsg"`
	FailureCount int    `json:"FailureCount"`
    LastDuration int64  `json:"LastDuration"`
}
type ResourceThresholds struct {
	CPUWarning      float64 `json:"cpu_warning"`
	CPUCritical     float64 `json:"cpu_critical"`
	MemoryWarning   float64 `json:"memory_warning"`
	MemoryCritical  float64 `json:"memory_critical"`
	DiskWarning     float64 `json:"disk_warning"`
	DiskCritical    float64 `json:"disk_critical"`
}
