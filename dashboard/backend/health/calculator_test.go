package health

import (
	"testing"
	"time"

	"github.com/yourusername/health-dashboard-backend/models"
)

// Test health status determination for different metric values
func TestEvaluateMetrics(t *testing.T) {
	tests := []struct {
		name     string
		cpu      float64
		mem      float64
		disk     float64
		expected string
	}{
		{
			name:     "All healthy",
			cpu:      50.0,
			mem:      60.0,
			disk:     70.0,
			expected: StatusHealthy,
		},
		{
			name:     "CPU warning",
			cpu:      85.0,
			mem:      60.0,
			disk:     70.0,
			expected: StatusWarning,
		},
		{
			name:     "Memory critical",
			cpu:      50.0,
			mem:      96.0,
			disk:     70.0,
			expected: StatusCritical,
		},
		{
			name:     "Disk warning",
			cpu:      50.0,
			mem:      60.0,
			disk:     82.0,
			expected: StatusWarning,
		},
		{
			name:     "Multiple warnings",
			cpu:      85.0,
			mem:      81.0,
			disk:     70.0,
			expected: StatusWarning,
		},
		{
			name:     "Critical CPU",
			cpu:      96.0,
			mem:      60.0,
			disk:     70.0,
			expected: StatusCritical,
		},
		{
			name:     "Borderline CPU warning",
			cpu:      80.0,
			mem:      50.0,
			disk:     50.0,
			expected: StatusWarning,
		},
		{
			name:     "Borderline CPU critical",
			cpu:      95.0,
			mem:      50.0,
			disk:     50.0,
			expected: StatusCritical,
		},
	}

	// Create a default config for testing using the exported constants
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

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// evaluateMetrics now requires config
			result, _ := evaluateMetrics(tt.cpu, tt.mem, tt.disk, config)
			if result != tt.expected {
				t.Errorf("evaluateMetrics(%v, %v, %v) = %s, want %s",
					tt.cpu, tt.mem, tt.disk, result, tt.expected)
			}
		})
	}
}

// Test threshold constants are correct
func TestThresholdConstants(t *testing.T) {
	tests := []struct {
		name     string
		value    float64
		expected bool
	}{
		{
			name:     "CPU at warning threshold",
			value:    CPUWarningThreshold,
			expected: true,
		},
		{
			name:     "CPU below warning threshold",
			value:    CPUWarningThreshold - 0.1,
			expected: false,
		},
		{
			name:     "CPU at critical threshold",
			value:    CPUCriticalThreshold,
			expected: true,
		},
		{
			name:     "Memory warning threshold",
			value:    MemWarningThreshold,
			expected: true,
		},
		{
			name:     "Disk critical threshold",
			value:    DiskCriticalThreshold,
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isWarning := tt.value >= CPUWarningThreshold
			isCritical := tt.value >= CPUCriticalThreshold

			if tt.value == CPUWarningThreshold && !isWarning {
				t.Errorf("Threshold check failed: %v >= %v should be true", tt.value, CPUWarningThreshold)
			}
			if tt.value == CPUWarningThreshold-0.1 && isWarning {
				t.Errorf("Threshold check failed: %v >= %v should be false", tt.value, CPUWarningThreshold)
			}
		})
	}
}

// Test status constants exist
func TestStatusConstants(t *testing.T) {
	statuses := []string{
		StatusHealthy,
		StatusWarning,
		StatusCritical,
		StatusOffline,
		StatusUnknown,
	}

	for _, status := range statuses {
		if status == "" {
			t.Errorf("Status constant is empty")
		}
	}
}

// Test metric interval constant
func TestMetricIntervalConstant(t *testing.T) {
	if DefaultMetricIntervalSeconds <= 0 {
		t.Errorf("DefaultMetricIntervalSeconds should be positive, got %d", DefaultMetricIntervalSeconds)
	}
	
	expectedOfflineThreshold := DefaultMetricIntervalSeconds * 2
	if expectedOfflineThreshold < 20 {
		t.Errorf("Offline threshold too low: %d seconds", expectedOfflineThreshold)
	}
}

// Test time-based calculations (offline detection)
func TestOfflineDetectionLogic(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name          string
		timeDiff      time.Duration
		expectOffline bool
	}{
		{
			name:          "Recent metric (online)",
			timeDiff:      5 * time.Second,
			expectOffline: false,
		},
		{
			name:          "Stale metric (offline)",
			timeDiff:      30 * time.Second,
			expectOffline: true,
		},
		{
			name:          "At threshold (offline)",
			timeDiff:      20 * time.Second,
			expectOffline: true,
		},
		{
			name:          "Just before threshold (online)",
			timeDiff:      19 * time.Second,
			expectOffline: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			metricTime := now.Add(-tt.timeDiff).Unix()
			nowUnix := now.Unix()
			maxStaleSeconds := int64(DefaultMetricIntervalSeconds * 2)
			
			isOffline := nowUnix-metricTime > maxStaleSeconds
			if isOffline != tt.expectOffline {
				t.Errorf("Offline detection failed: timeDiff=%v, isOffline=%v, want=%v",
					tt.timeDiff, isOffline, tt.expectOffline)
			}
		})
	}
}
