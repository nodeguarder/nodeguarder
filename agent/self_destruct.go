package main

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// SelfDestruct initiates the agent uninstallation process
func SelfDestruct() {
	log.Println("⚠️  RECEIVED SELF-DESTRUCT COMMAND. INITIATING UNINSTALLATION in 5 seconds...")

	// Create a temporary uninstallation script
	// Use /var/lib/nodeguarder-agent instead of /tmp to avoid noexec mount issues
	tmpDir := "/var/lib/nodeguarder-agent"
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		// Fallback to current dir if data dir fails
		tmpDir = "."
	}
	scriptPath := filepath.Join(tmpDir, "agent_self_destruct.sh")

	// Same content as the uninstall.sh embedded in handlers/agent.go
	scriptContent := `#!/bin/bash
set -e

# Sleep briefly to allow agent to exit
sleep 2

echo "Self-destructing NodeGuarder Agent..."

if systemctl is-active --quiet nodeguarder-agent; then
    systemctl stop nodeguarder-agent
fi

if systemctl is-enabled --quiet nodeguarder-agent; then
    systemctl disable nodeguarder-agent
fi

rm -f /etc/systemd/system/nodeguarder-agent.service
systemctl daemon-reload

rm -rf /opt/nodeguarder-agent

# Remove logs
rm -rf /data/logs
rm -rf /var/log/nodeguarder-agent.log

# Remove Configuration and Data
rm -rf /etc/nodeguarder-agent
rm -rf /var/lib/nodeguarder-agent

echo "Agent removed."

# Self-delete
rm -- "$0"
`

	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0755); err != nil {
		log.Printf("❌ Failed to create self-destruct script: %v", err)
		return
	}

	// Launch script in background
	// We use nohup to ensure it survives the agent process termination
	cmd := exec.Command("nohup", "/bin/bash", scriptPath)
	cmd.SysProcAttr = nil // OS specific, but generic enough for Linux
    
    // Detach?
    // In Go, Start() leaves it as a child. 
    // We want to fire and forget.
	if err := cmd.Start(); err != nil {
		log.Printf("❌ Failed to launch self-destruct script: %v", err)
		return
	}

    log.Println("Acquiring Target... Goodbye.")
	time.Sleep(1 * time.Second)
	os.Exit(0)
}
