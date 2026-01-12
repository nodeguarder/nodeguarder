package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

const (
	DefaultConfigPath = "/etc/nodeguarder-agent/config.yaml"
	DefaultInterval   = 60 // seconds
)

type (
	Config struct {
		ServerID          string `yaml:"server_id" json:"server_id"`
		APISecret         string `yaml:"api_secret" json:"api_secret"`
		DashboardURL      string `yaml:"dashboard_url" json:"dashboard_url"`
		RegistrationToken string `yaml:"registration_token" json:"registration_token"`
		Interval          int    `yaml:"interval" json:"interval"`
		Thresholds        Thresholds `yaml:"thresholds" json:"thresholds"`
		DriftPaths        []string   `yaml:"drift_paths" json:"drift_paths"`
        DriftInterval     int        `yaml:"drift_interval" json:"drift_interval"` // Seconds
        HealthEnabled     bool       `yaml:"health_enabled" json:"health_enabled"`
        HealthSustainDuration int    `yaml:"health_sustain_duration" json:"health_sustain_duration"`
        CronEnabled       bool       `yaml:"cron_enabled" json:"cron_enabled"`
        CronAutoDiscover  bool       `yaml:"cron_auto_discover" json:"cron_auto_discover"`
		CronLogPath       string     `yaml:"cron_log_path" json:"cron_log_path"`
        CronIgnore        map[string][]int `yaml:"cron_ignore" json:"cron_ignore"`
        CronGlobalTimeout int        `yaml:"cron_global_timeout" json:"cron_global_timeout"`
        CronTimeouts      map[string]int `yaml:"cron_timeouts" json:"cron_timeouts"`
        DisableSSLVerify  bool       `yaml:"disable_ssl_verify" json:"disable_ssl_verify"`
        CollectLogs       bool       `yaml:"-" json:"collect_logs"`   // Runtime only
        Uninstall         bool       `yaml:"-" json:"uninstall"`       // Runtime only
	}

	Thresholds struct {
		CPU    int `yaml:"cpu" json:"cpu_critical"`
		Memory int `yaml:"memory" json:"memory_critical"`
		Disk   int `yaml:"disk" json:"disk_critical"`
	}
)

// Load reads the configuration file from the given path
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	cfg := Config{
		Interval: DefaultInterval,
		Thresholds: Thresholds{
			CPU:    90,
			Memory: 95,
			Disk:   90,
		},
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Validate required fields
	if cfg.ServerID == "" {
		return nil, fmt.Errorf("server_id is required")
	}
	if cfg.APISecret == "" {
		return nil, fmt.Errorf("api_secret is required")
	}
	if cfg.DashboardURL == "" {
		return nil, fmt.Errorf("dashboard_url is required")
	}
	// Interval default handled in initialization

	return &cfg, nil
}

// Save writes the configuration to the given path
func (c *Config) Save(path string) error {
	// Create directory if it doesn't exist
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// GenerateDefault creates a new configuration with generated credentials
func GenerateDefault(dashboardURL string) *Config {
	return &Config{
		ServerID:     uuid.New().String(),
		APISecret:    generateSecret(),
		DashboardURL: dashboardURL,
		Interval:     DefaultInterval,
		Thresholds: Thresholds{
			CPU:    90,
			Memory: 95,
			Disk:   90,
		},
	}
}

// generateSecret creates a random 32-byte hex string
func generateSecret() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
