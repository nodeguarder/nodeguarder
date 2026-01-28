package health

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/models"
)

// Health status constants
const (
	StatusHealthy    = "healthy"
	StatusWarning    = "warning"
	StatusCritical   = "critical"
	StatusOffline    = "offline"
	StatusUnknown    = "unknown"
	StatusRecovering = "recovering"
)

// Default metric interval in seconds (agent reports every 60 seconds by default)
const DefaultMetricIntervalSeconds = 60

// Threshold constants (Exported for tests)
var (
	CPUWarningThreshold     = 80.0
	CPUCriticalThreshold    = 90.0
	MemWarningThreshold     = 80.0
	MemCriticalThreshold    = 90.0
	DiskWarningThreshold    = 80.0
	DiskCriticalThreshold   = 90.0
)

// CalculateHealth determines the health status of a server based on its latest metrics
func CalculateHealth(serverID string) (string, string, error) {
	metrics, err := GetHealthMetricsForServer(serverID)
	if err != nil {
		return "", "", err
	}

	if metrics.IsOffline {
		return StatusOffline, "Server is offline", nil
	}

	config := getAgentConfig()

	// Evaluate metrics
	status, reason := evaluateMetrics(metrics.CPUPercent, metrics.MemoryPercent, metrics.DiskPercent, config)
	return status, reason, nil
}

func getAgentConfig() models.AgentConfig {
	config := models.AgentConfig{
		HealthEnabled: true,
		Thresholds: models.ResourceThresholds{
			CPUWarning:     CPUWarningThreshold,
			CPUCritical:    CPUCriticalThreshold,
			MemoryWarning:  MemWarningThreshold,
			MemoryCritical: MemCriticalThreshold,
			DiskWarning:    DiskWarningThreshold,
			DiskCritical:   DiskCriticalThreshold,
		},
	}

	var val string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'thresholds'").Scan(&val); err == nil {
		json.Unmarshal([]byte(val), &config.Thresholds)
	}
	
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'health_enabled'").Scan(&val); err == nil {
		if val == "false" || val == "0" {
			config.HealthEnabled = false
		}
	}
	
	return config
}

func evaluateMetrics(cpu, mem, disk float64, config models.AgentConfig) (string, string) {
	if !config.HealthEnabled {
		return StatusHealthy, "Health monitoring disabled"
	}

	// Critical Checks
	if config.Thresholds.CPUCritical > 0 && cpu >= config.Thresholds.CPUCritical {
		return StatusCritical, fmt.Sprintf("CPU Critical (%.1f%% >= %.1f%%)", cpu, config.Thresholds.CPUCritical)
	}
	if config.Thresholds.MemoryCritical > 0 && mem >= config.Thresholds.MemoryCritical {
		return StatusCritical, fmt.Sprintf("Memory Critical (%.1f%% >= %.1f%%)", mem, config.Thresholds.MemoryCritical)
	}
	if config.Thresholds.DiskCritical > 0 && disk >= config.Thresholds.DiskCritical {
		return StatusCritical, fmt.Sprintf("Disk Critical (%.1f%% >= %.1f%%)", disk, config.Thresholds.DiskCritical)
	}

	// Warning Checks
	if config.Thresholds.CPUWarning > 0 && cpu >= config.Thresholds.CPUWarning {
		return StatusWarning, fmt.Sprintf("CPU Warning (%.1f%% >= %.1f%%)", cpu, config.Thresholds.CPUWarning)
	}
	if config.Thresholds.MemoryWarning > 0 && mem >= config.Thresholds.MemoryWarning {
		return StatusWarning, fmt.Sprintf("Memory Warning (%.1f%% >= %.1f%%)", mem, config.Thresholds.MemoryWarning)
	}
	if config.Thresholds.DiskWarning > 0 && disk >= config.Thresholds.DiskWarning {
		return StatusWarning, fmt.Sprintf("Disk Warning (%.1f%% >= %.1f%%)", disk, config.Thresholds.DiskWarning)
	}

	return StatusHealthy, "Metrics within normal limits"
}

// UpdateServerHealth calculates and updates server health status in the database
// Returns: newStatus, oldStatus, newReason, oldReason, error
func UpdateServerHealth(serverID string) (string, string, string, string, error) {
	// Get current status and last change time
	var oldStatus string
	var oldReason string
	var lastStatusChange int64
	err := database.DB.QueryRow("SELECT health_status, COALESCE(last_status_change, 0), COALESCE(health_message, '') FROM servers WHERE id = ?", serverID).Scan(&oldStatus, &lastStatusChange, &oldReason)
	if err == sql.ErrNoRows {
		oldStatus = StatusUnknown
		lastStatusChange = 0
		oldReason = ""
	} else if err != nil {
		return "", "", "", "", err
	}

	newStatus, reason, err := CalculateHealth(serverID)
	if err != nil {
		return "", "", "", "", err
	}

	// Stability Window Logic
	if newStatus == StatusHealthy {
		// Fetch settings
		stabilityWindow := int64(120) // Default
		var val string
		if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'stability_window'").Scan(&val); err == nil {
			var sVal int64
			if _, err := fmt.Sscanf(val, "%d", &sVal); err == nil && sVal >= 0 {
				stabilityWindow = sVal
			}
		}

		if (oldStatus == StatusOffline || oldStatus == StatusCritical) {
			if stabilityWindow > 0 {
				// Initial entry into recovery
				newStatus = StatusRecovering
				reason = fmt.Sprintf("Recovering from (%s)", oldStatus)
				log.Printf("[DEBUG] Server %s moving from %s to %s (stability window: %ds)", serverID, oldStatus, newStatus, stabilityWindow)
			} else {
				log.Printf("[DEBUG] Server %s skipping recovery state (stability window: 0s)", serverID)
			}
		} else if oldStatus == StatusRecovering {
			timeInState := time.Now().Unix() - lastStatusChange
			if timeInState < stabilityWindow {
				// Not stable yet, stay recovering
				newStatus = StatusRecovering
				if oldReason != "" {
					reason = oldReason
				} else {
					reason = "Stabilizing..."
				}
				log.Printf("[DEBUG] Server %s remains in %s (time in state: %ds < window: %ds)", serverID, newStatus, timeInState, stabilityWindow)
			} else {
				log.Printf("[DEBUG] Server %s stability window passed (%ds >= %ds), transitioning to healthy", serverID, timeInState, stabilityWindow)
			}
		}
	} else if newStatus != oldStatus {
		log.Printf("[DEBUG] Server %s status change: %s -> %s (Reason: %s)", serverID, oldStatus, newStatus, reason)
	}

	// Update DB
	timestamp := lastStatusChange
	if newStatus != oldStatus {
		timestamp = time.Now().Unix()
	}

	_, err = database.DB.Exec(
		"UPDATE servers SET health_status = ?, last_status_change = ?, health_message = ? WHERE id = ?",
		newStatus,
		timestamp,
		reason,
		serverID,
	)

	if err != nil {
		log.Printf("Failed to update health status for %s: %v", serverID, err)
		return "", "", "", "", err
	}

	return newStatus, oldStatus, reason, oldReason, nil
}

// GetServerHealth returns the current health status for a server
func GetServerHealth(serverID string) (string, error) {
	var status string
	err := database.DB.QueryRow("SELECT health_status FROM servers WHERE id = ?", serverID).Scan(&status)
	if err == sql.ErrNoRows {
		return StatusUnknown, nil
	}
	if err != nil {
		return StatusUnknown, err
	}

	return status, nil
}

// GetHealthMetrics returns detailed metrics for health determination
type HealthMetrics struct {
	CPUPercent      float64 `json:"cpu_percent"`
	MemoryPercent   float64 `json:"memory_percent"`
	DiskPercent     float64 `json:"disk_percent"`
	IsOffline       bool    `json:"is_offline"`
	HasDriftEvent   bool    `json:"has_drift_event"`
	HealthStatus    string  `json:"health_status"`
	LastMetricTime  int64   `json:"last_metric_time"`
}

// GetHealthMetricsForServer returns detailed health metrics for a server
func GetHealthMetricsForServer(serverID string) (*HealthMetrics, error) {
	// Get latest metric
	var metric models.Metric
	err := database.DB.QueryRow(`
		SELECT timestamp, cpu_percent, mem_total_mb, mem_used_mb, disk_total_gb, disk_used_gb
		FROM metrics
		WHERE server_id = ?
		ORDER BY timestamp DESC
		LIMIT 1
	`, serverID).Scan(&metric.Timestamp, &metric.CPUPercent, &metric.MemTotalMB, 
		&metric.MemUsedMB, &metric.DiskTotalGB, &metric.DiskUsedGB)

	if err == sql.ErrNoRows {
		return &HealthMetrics{
			HealthStatus: StatusUnknown,
			IsOffline:    true,
		}, nil
	}
	if err != nil {
		return nil, err
	}

	// Calculate percentages
	memPercent := 0.0
	if metric.MemTotalMB > 0 {
		memPercent = (float64(metric.MemUsedMB) / float64(metric.MemTotalMB)) * 100.0
	}

	diskPercent := 0.0
	if metric.DiskTotalGB > 0 {
		diskPercent = (float64(metric.DiskUsedGB) / float64(metric.DiskTotalGB)) * 100.0
	}

	// Check if offline
	now := time.Now().Unix()
	maxStaleSeconds := int64(DefaultMetricIntervalSeconds * 2) // default
	var timeoutVal string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'offline_timeout'").Scan(&timeoutVal); err == nil {
		var val int64
		if _, err := fmt.Sscanf(timeoutVal, "%d", &val); err == nil {
			maxStaleSeconds = val
		}
	}
	isOffline := now-metric.Timestamp > maxStaleSeconds

	// Check for drift events
	hasDrift := hasDriftEvent(serverID)

	// Get current health status
	status, _ := GetServerHealth(serverID)

	return &HealthMetrics{
		CPUPercent:     metric.CPUPercent,
		MemoryPercent:  memPercent,
		DiskPercent:    diskPercent,
		IsOffline:      isOffline,
		HasDriftEvent:  hasDrift,
		HealthStatus:   status,
		LastMetricTime: metric.Timestamp,
	}, nil
}

func hasDriftEvent(serverID string) bool {
	var count int
	// Check for unresolved drift events in the last hour?
	err := database.DB.QueryRow("SELECT COUNT(*) FROM events WHERE server_id = ? AND event_type = 'drift' AND created_at > ?", serverID, time.Now().Add(-1*time.Hour).Unix()).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}
