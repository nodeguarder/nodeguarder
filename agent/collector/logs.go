package collector

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// CollectLogs gathers system logs and agent logs into a zip file
func CollectLogs() (string, error) {
	tempDir := os.TempDir()
	timestamp := time.Now().Unix()
	baseName := fmt.Sprintf("logs_%d", timestamp)
	workDir := filepath.Join(tempDir, baseName)

	if err := os.MkdirAll(workDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(workDir) // Clean up raw files

	// 1. Collect Agent Logs (journalctl)
	agentLogPath := filepath.Join(workDir, "nodeguarder-agent.log")
	// Try standard service names
	err := runCommandToFile(agentLogPath, "journalctl", "-u", "nodeguarder-agent", "--no-pager", "--lines=5000")
	if err != nil {
		// Just write error to file if fails
		os.WriteFile(agentLogPath, []byte(fmt.Sprintf("Failed to get agent logs: %v", err)), 0644)
	}

	// 2. Collect System Logs (last 1000 lines)
	sysLogPath := filepath.Join(workDir, "syslog_tail.log")
	err = runCommandToFile(sysLogPath, "journalctl", "--no-pager", "--lines=1000")
    if err != nil {
         // Fallback to /var/log/syslog
         if _, statErr := os.Stat("/var/log/syslog"); statErr == nil {
             runCommandToFile(sysLogPath, "tail", "-n", "1000", "/var/log/syslog")
         }
    }

	// 3. Zip it
	zipPath := filepath.Join(tempDir, fmt.Sprintf("agent_logs_%d.zip", timestamp))
	err = zipFiles(zipPath, []string{agentLogPath, sysLogPath})
	if err != nil {
		return "", fmt.Errorf("failed to zip logs: %w", err)
	}

	return zipPath, nil
}

func runCommandToFile(path string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	outfile, err := os.Create(path)
	if err != nil {
		return err
	}
	defer outfile.Close()
	cmd.Stdout = outfile
	cmd.Stderr = outfile // Capture stderr too
	return cmd.Run()
}

func zipFiles(zipPath string, files []string) error {
	newZipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer newZipFile.Close()

	zipWriter := zip.NewWriter(newZipFile)
	defer zipWriter.Close()

	for _, file := range files {
		if _, err := os.Stat(file); os.IsNotExist(err) {
			continue
		}

		f, err := os.Open(file)
		if err != nil {
			return err
		}
		defer f.Close()

		w, err := zipWriter.Create(filepath.Base(file))
		if err != nil {
			return err
		}

		if _, err = io.Copy(w, f); err != nil {
			return err
		}
	}
	return nil
}
