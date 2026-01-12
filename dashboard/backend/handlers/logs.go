package handlers

import (
	"os"

	"github.com/gofiber/fiber/v2"
)

// DownloadBackendLogs serves the backend log file
func DownloadBackendLogs(c *fiber.Ctx) error {
	logPath := "/data/backend.log"

	// Check if file exists
	if _, err := os.Stat(logPath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Log file not found. It may have not been created yet.",
		})
	}

	return c.Download(logPath, "backend.log")
}
