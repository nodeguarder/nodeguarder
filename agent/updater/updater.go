package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"runtime"
	"time"
)

// CheckForUpdate checks if a newer version is available
func CheckForUpdate(dashboardURL, currentVersion string) (bool, string, error) {
	url := fmt.Sprintf("%s/api/v1/agent/version", dashboardURL)
	client := &http.Client{Timeout: 10 * time.Second}
	
	resp, err := client.Get(url)
	if err != nil {
		return false, "", fmt.Errorf("failed to check version: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return false, "", fmt.Errorf("server returned status %d", resp.StatusCode)
	}

	var result struct {
		Version string `json:"version"`
		Latest  bool   `json:"latest"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, "", fmt.Errorf("failed to decode response: %w", err)
	}

	if result.Version != currentVersion {
		return true, result.Version, nil
	}

	return false, "", nil
}

// ApplyUpdate downloads and applies the update
func ApplyUpdate(dashboardURL, version string) error {
	// Determine architecture
	arch := runtime.GOARCH
	// Map common archs if needed, though Go's runtime.GOARCH usually matches
	
	downloadURL := fmt.Sprintf("%s/api/v1/agent/download/linux/%s", dashboardURL, arch)
	
	// Get current executable path
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Create temp file
	tmpFile, err := os.CreateTemp("", "nodeguarder-agent-update-*")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	// Download new binary
	resp, err := http.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("failed to download update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		return fmt.Errorf("failed to write update: %w", err)
	}
	tmpFile.Close() // Close so we can execute/move it

	// Make executable
	if err := os.Chmod(tmpFile.Name(), 0755); err != nil {
		return fmt.Errorf("failed to chmod: %w", err)
	}

	// Replace binary (atomic rename)
	if err := os.Rename(tmpFile.Name(), exePath); err != nil {
		return fmt.Errorf("failed to replace binary: %w", err)
	}

	// Restart service
	// We assume systemd manages the service. Exiting with success should trigger restart if Restart=always
	// But to be sure, we can try to exec ourselves or just exit. A clean exit is best for systemd.
	return nil
}
