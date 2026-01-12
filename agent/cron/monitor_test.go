package cron

import (
	"testing"
	"time"
)

func TestMonitorCreation(t *testing.T) {
	monitor := New()
	if monitor == nil {
		t.Fatal("Failed to create monitor")
	}
	if len(monitor.lastSeenJobs) != 0 {
		t.Error("Monitor should start with no tracked jobs")
	}
}

func TestJobStatusTracking(t *testing.T) {
	monitor := New()

	// Track a successful job
	monitor.UpdateJobStatus("/usr/local/bin/backup.sh", 0, "")
	if len(monitor.lastSeenJobs) != 1 {
		t.Error("Expected 1 tracked job")
	}

	record := monitor.lastSeenJobs["/usr/local/bin/backup.sh"]
	if record.LastExitCode != 0 {
		t.Error("Expected exit code 0 for successful job")
	}
	if record.FailureCount != 0 {
		t.Error("Expected failure count 0 for successful job")
	}

	// Update with failure
	monitor.UpdateJobStatus("/usr/local/bin/backup.sh", 1, "connection timeout")
	record = monitor.lastSeenJobs["/usr/local/bin/backup.sh"]
	if record.LastExitCode != 1 {
		t.Error("Expected exit code 1 for failed job")
	}
	if record.FailureCount != 1 {
		t.Error("Expected failure count 1")
	}
	if record.LastErrorMsg != "connection timeout" {
		t.Error("Expected error message to be updated")
	}

	// Update with recovery
	monitor.UpdateJobStatus("/usr/local/bin/backup.sh", 0, "")
	record = monitor.lastSeenJobs["/usr/local/bin/backup.sh"]
	if record.FailureCount != 0 {
		t.Error("Expected failure count to reset to 0")
	}
}

func TestGetTrackedJobs(t *testing.T) {
	monitor := New()

	monitor.UpdateJobStatus("job1", 0, "")
	monitor.UpdateJobStatus("job2", 1, "error")
	monitor.UpdateJobStatus("job3", 0, "")

	jobs := monitor.GetTrackedJobs()
	if len(jobs) != 3 {
		t.Errorf("Expected 3 tracked jobs, got %d", len(jobs))
	}
}

func TestProcessCronEntryFailureDetection(t *testing.T) {
	monitor := New()

	// Test failure detection
	entry := "Dec 7 10:30:45 server CRON[12345]: (root) CMD (/usr/local/bin/backup.sh) (FAILED exit code 1)"
	event := monitor.processCronEntry(entry)

	if event == nil {
		t.Fatal("Expected failure event to be generated")
	}

	if event.ExitCode != 1 {
		t.Errorf("Expected exit code 1, got %d", event.ExitCode)
	}

	if event.JobCommand != "/usr/local/bin/backup.sh" {
		t.Errorf("Expected command extraction, got %s", event.JobCommand)
	}
}

func TestProcessCronEntrySuccessIgnored(t *testing.T) {
	monitor := New()

	// Success entries should not generate events (unless tracked with prior failure)
	entry := "Dec 7 10:30:45 server CRON[12345]: (root) CMD (/usr/local/bin/cleanup.sh)"
	event := monitor.processCronEntry(entry)

	if event != nil {
		t.Error("Expected no event for successful cron execution")
	}
}

func TestTimestampGeneration(t *testing.T) {
	monitor := New()
	monitor.lastCheckTime = time.Now().Unix() - 3600 // 1 hour ago

	entry := "CRON failed /test/job (FAILED exit code 1)"
	event := monitor.processCronEntry(entry)

	if event != nil && event.Timestamp == 0 {
		t.Error("Expected timestamp to be set")
	}
}
