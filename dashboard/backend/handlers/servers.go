package handlers

import (
	"database/sql"
    "fmt"
    "os"
    "path/filepath"
    "time"

	"github.com/gofiber/fiber/v2"
	"github.com/yourusername/health-dashboard-backend/database"
	"github.com/yourusername/health-dashboard-backend/health"
	"github.com/yourusername/health-dashboard-backend/models"
)

// GetServers returns all servers
func GetServers(c *fiber.Ctx) error {
	rows, err := database.DB.Query(`
		SELECT id, hostname, COALESCE(os_name, ''), COALESCE(os_version, ''), COALESCE(agent_version, ''), first_seen, last_seen, COALESCE(health_status, 'unknown'), COALESCE(drift_checksum, ''), drift_changed
		FROM servers
		ORDER BY hostname
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}
	defer rows.Close()

	servers := []models.Server{}
	for rows.Next() {
		var s models.Server
		var driftChanged int
		err := rows.Scan(&s.ID, &s.Hostname, &s.OSName, &s.OSVersion, &s.AgentVersion, 
			&s.FirstSeen, &s.LastSeen, &s.HealthStatus, &s.DriftChecksum, &driftChanged)
		if err != nil {
			continue
		}
		s.DriftChanged = driftChanged == 1
		servers = append(servers, s)
	}

	return c.JSON(servers)
}

// GetServer returns a specific server
func GetServer(c *fiber.Ctx) error {
	serverID := c.Params("id")

	var s models.Server
	var driftChanged int
	err := database.DB.QueryRow(`
		SELECT id, hostname, COALESCE(os_name, ''), COALESCE(os_version, ''), COALESCE(agent_version, ''), first_seen, last_seen, COALESCE(health_status, 'unknown'), COALESCE(drift_checksum, ''), drift_changed, log_request_pending, COALESCE(log_request_time, 0), COALESCE(log_file_path, ''), COALESCE(log_file_time, 0)
		FROM servers
		WHERE id = ?
	`, serverID).Scan(&s.ID, &s.Hostname, &s.OSName, &s.OSVersion, &s.AgentVersion,
		&s.FirstSeen, &s.LastSeen, &s.HealthStatus, &s.DriftChecksum, &driftChanged, &s.LogRequestPending, &s.LogRequestTime, &s.LogFilePath, &s.LogFileTime)

	if err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "Server not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}

	s.DriftChanged = driftChanged == 1
	return c.JSON(s)
}

// DeleteServer removes a server and all its data
func DeleteServer(c *fiber.Ctx) error {
	serverID := c.Params("id")

	// Start a transaction would be ideal, but for sqlite we can just do sequential deletes
	// Delete associated events
	_, err := database.DB.Exec("DELETE FROM events WHERE server_id = ?", serverID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete events"})
	}

	// Delete associated metrics
	_, err = database.DB.Exec("DELETE FROM metrics WHERE server_id = ?", serverID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete metrics"})
	}

	// Delete the server itself
	result, err := database.DB.Exec("DELETE FROM servers WHERE id = ?", serverID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Server not found"})
	}

	return c.JSON(fiber.Map{"status": "deleted"})
}

// DeleteServerEvents removes all events for a server
func DeleteServerEvents(c *fiber.Ctx) error {
	serverID := c.Params("id")

	_, err := database.DB.Exec("DELETE FROM events WHERE server_id = ?", serverID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete events"})
	}

	return c.JSON(fiber.Map{"status": "events deleted"})
}

// DeleteEvent removes a single event by ID
func DeleteEvent(c *fiber.Ctx) error {
	eventID := c.Params("id")

	result, err := database.DB.Exec("DELETE FROM events WHERE id = ?", eventID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete event"})
	}

    rows, _ := result.RowsAffected()
    if rows == 0 {
        return c.Status(404).JSON(fiber.Map{"error": "Event not found"})
    }

	return c.JSON(fiber.Map{"status": "event deleted"})
}

// CleanupDatabase removes orphaned data
func CleanupDatabase(c *fiber.Ctx) error {
	// Clean orphaned events
	res1, err := database.DB.Exec("DELETE FROM events WHERE server_id NOT IN (SELECT id FROM servers)")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to clean events"})
	}
	eventsDeleted, _ := res1.RowsAffected()

	// Clean orphaned metrics
	res2, err := database.DB.Exec("DELETE FROM metrics WHERE server_id NOT IN (SELECT id FROM servers)")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to clean metrics"})
	}
	metricsDeleted, _ := res2.RowsAffected()

	return c.JSON(fiber.Map{
		"status": "cleanup_complete",
		"events_deleted": eventsDeleted,
		"metrics_deleted": metricsDeleted,
	})
}

// GetServerMetrics returns metrics for a server
func GetServerMetrics(c *fiber.Ctx) error {
	serverID := c.Params("id")
	
	// Get metrics for the last 24 hours
	rows, err := database.DB.Query(`
		SELECT id, server_id, timestamp, cpu_percent, mem_total_mb, mem_used_mb, 
			disk_total_gb, disk_used_gb, load_avg_1, load_avg_5, load_avg_15, process_count, uptime
		FROM metrics
		WHERE server_id = ? AND timestamp > strftime('%s', 'now', '-24 hours')
		ORDER BY timestamp DESC
	`, serverID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}
	defer rows.Close()

	metrics := []models.Metric{}
	for rows.Next() {
		var m models.Metric
		err := rows.Scan(&m.ID, &m.ServerID, &m.Timestamp, &m.CPUPercent, &m.MemTotalMB,
			&m.MemUsedMB, &m.DiskTotalGB, &m.DiskUsedGB, &m.LoadAvg1, &m.LoadAvg5,
			&m.LoadAvg15, &m.ProcessCount, &m.Uptime)
		if err != nil {
			continue
		}
		metrics = append(metrics, m)
	}

	return c.JSON(metrics)
}

// GetServerEvents returns events for a server
func GetServerEvents(c *fiber.Ctx) error {
	serverID := c.Params("id")

	rows, err := database.DB.Query(`
		SELECT id, server_id, timestamp, event_type, severity, message, details
		FROM events
		WHERE server_id = ?
		ORDER BY timestamp DESC
		LIMIT 100
	`, serverID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}
	defer rows.Close()

	events := []models.Event{}
	for rows.Next() {
		var e models.Event
		err := rows.Scan(&e.ID, &e.ServerID, &e.Timestamp, &e.EventType, &e.Severity, &e.Message, &e.Details)
		if err != nil {
			continue
		}
		events = append(events, e)
	}

	return c.JSON(events)
}

// GetAllEvents returns recent events across all servers
func GetAllEvents(c *fiber.Ctx) error {
	// Get last 50 events from all servers, ordered by timestamp
	rows, err := database.DB.Query(`
		SELECT id, server_id, timestamp, event_type, severity, message, details
		FROM events
		ORDER BY timestamp DESC
		LIMIT 50
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Database error"})
	}
	defer rows.Close()

	events := []models.Event{}
	for rows.Next() {
		var e models.Event
		err := rows.Scan(&e.ID, &e.ServerID, &e.Timestamp, &e.EventType, &e.Severity, &e.Message, &e.Details)
		if err != nil {
			continue
		}
		events = append(events, e)
	}

	return c.JSON(events)
}

// GetServerHealth returns detailed health metrics for a server
func GetServerHealth(c *fiber.Ctx) error {
	serverID := c.Params("id")

	// Get detailed health metrics
	healthMetrics, err := health.GetHealthMetricsForServer(serverID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to retrieve health metrics"})
	}

	return c.JSON(healthMetrics)
}

// RequestLogs initiates a log collection request
func RequestLogs(c *fiber.Ctx) error {
    serverID := c.Params("id")

    _, err := database.DB.Exec("UPDATE servers SET log_request_pending = 1, log_request_time = ? WHERE id = ?", time.Now().Unix(), serverID)
    if err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "Failed to update server"})
    }

    return c.JSON(fiber.Map{"status": "request_sent"})
}

// DownloadLogs serves the collected log file
func DownloadLogs(c *fiber.Ctx) error {
    serverID := c.Params("id")

    var filePath string
    err := database.DB.QueryRow("SELECT log_file_path FROM servers WHERE id = ?", serverID).Scan(&filePath)
    if err != nil {
        return c.Status(404).JSON(fiber.Map{"error": "Server not found"})
    }

    if filePath == "" {
        return c.Status(404).JSON(fiber.Map{"error": "No logs available"})
    }

    // Security check: ensure path is within /data/logs
    fullPath := filepath.Join("/data/logs", filePath)
    cleanPath := filepath.Clean(fullPath)
    if !filepath.HasPrefix(cleanPath, filepath.Clean("/data/logs")) {
         return c.Status(403).JSON(fiber.Map{"error": "Invalid file path"})
    }

    if _, err := os.Stat(cleanPath); os.IsNotExist(err) {
        return c.Status(404).JSON(fiber.Map{"error": "Log file not found on disk"})
    }

    c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s_logs.zip\"", serverID))
    return c.SendFile(cleanPath)
}
// UninstallAgent flags a server for uninstallation
func UninstallAgent(c *fiber.Ctx) error {
    serverID := c.Params("id")

    _, err := database.DB.Exec("UPDATE servers SET pending_uninstall = 1 WHERE id = ?", serverID)
    if err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "Database error"})
    }

    return c.JSON(fiber.Map{"status": "ok", "message": "Uninstall scheduled"})
}
