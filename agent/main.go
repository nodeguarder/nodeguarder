package main

import (
	"flag"
	"fmt"
	"errors"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
	"io"

	"gopkg.in/natefinch/lumberjack.v2"

	"github.com/yourusername/nodeguarder/api"
	"github.com/yourusername/nodeguarder/collector"
	"github.com/yourusername/nodeguarder/config"
	"github.com/yourusername/nodeguarder/cron"
	"github.com/yourusername/nodeguarder/drift"
    "github.com/yourusername/nodeguarder/ebpf"
	"github.com/yourusername/nodeguarder/queue"
	"github.com/yourusername/nodeguarder/updater"
)

var Version = "1.0.1"

func main() {
	// Command line flags
	var (
		configPath   = flag.String("config", config.DefaultConfigPath, "Path to configuration file")
		installFlag  = flag.Bool("install", false, "Install the agent as a systemd service")
		dashboardURL = flag.String("dashboard-url", "", "Dashboard URL (required for install)")
	)
	flag.Parse()

	// Handle install command
	if *installFlag {
		if err := install(*dashboardURL, *configPath); err != nil {
			log.Fatalf("Installation failed: %v", err)
		}
		fmt.Println("✅ Agent installed successfully!")
		fmt.Println("Run: sudo systemctl start nodeguarder-agent")
		return
	}

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Configure logging
	logFile := &lumberjack.Logger{
		Filename:   "/var/log/nodeguarder/agent.log", // Standard Linux log path
		MaxSize:    10, // megabytes
		MaxBackups: 3,
		MaxAge:     28, // days
		Compress:   true,
	}

	// Write to both stdout and file
	mw := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(mw)

	log.Printf("Starting NodeGuarder Agent v%s", Version)
	log.Printf("Server ID: %s", cfg.ServerID)
	log.Printf("Dashboard: %s", cfg.DashboardURL)

	// Create API client
	apiClient := api.NewClient(cfg.DashboardURL, cfg.ServerID, cfg.APISecret, cfg.DisableSSLVerify)

	// Initialize resilience queue
	queuePath := filepath.Join(filepath.Dir(*configPath), "queue.db")
	q, err := queue.NewQueue(queuePath, 1000) // Max 1000 items
	if err != nil {
		log.Printf("Warning: Failed to initialize resilience queue: %v", err)
		log.Println("Continuing without offline resilience...")
	} else {
		apiClient.SetQueue(q)
		defer q.Close()
		log.Println("✓ Resilience queue initialized")
	}

	// Register with dashboard
	if err := registerAgent(apiClient, cfg.RegistrationToken); err != nil {
		log.Printf("Warning: Failed to register with dashboard: %v", err)
		log.Printf("Will retry on next interval...")
	} else {
		log.Println("✅ Registered with dashboard")
	}

	// Initialize drift detector
	driftPaths := cfg.DriftPaths
	if len(driftPaths) == 0 {
		driftPaths = []string{"/etc"}
	}
	driftDetector := drift.New(driftPaths)

	// Initialize cron monitor
	cronMonitor := cron.New(cfg.CronLogPath)

    // Initialize eBPF Monitor (Zero Touch)
    // We try to load the BPF program. If it fails (old kernel/permissions), we continue without it.
    // In that case, we rely on standard log parsing (no exit codes).
    bpfLoader, err := ebpf.InitBPF()
    if err != nil {
        log.Printf("⚠️  eBPF Initialization Failed: %v", err)
        log.Println("    (Zero Touch Cron Failure Detection disabled. Ensure standard cron logs are available)")
    } else {
        log.Println("✅ eBPF Monitor Loaded (Zero Touch Exit Code Detection Enabled)")
        defer bpfLoader.Close()
        
        // Connect BPF events to Cron Monitor
        bpfLoader.SetEventHandler(func(e ebpf.ProcessExitEvent) {
             // We prioritize matching by PID for accurate command linking
             // We pass both Global PIDs and Namespace PIDs
             cronMonitor.UpdateJobStatusByPID(int32(e.Pid), int32(e.ParentPid), int32(e.NsPid), int32(e.NsParentPid), int(e.ExitCode))
        })
    }

	// Start monitoring loop
	ticker := time.NewTicker(time.Duration(cfg.Interval) * time.Second)
	defer ticker.Stop()

    // Drift check ticker
    driftInterval := 5 * time.Minute
    if cfg.DriftInterval > 0 {
        driftInterval = time.Duration(cfg.DriftInterval) * time.Second
    }
    // Fallback Legacy Heuristic logic (if not set by dashboard yet)
    if cfg.DriftInterval == 0 && cfg.Interval < 60 {
        driftInterval = time.Duration(cfg.Interval) * time.Second
    }

    driftTicker := time.NewTicker(driftInterval)
    defer driftTicker.Stop()

	// Queue flush ticker (every 30 seconds)
	queueFlushTicker := time.NewTicker(30 * time.Second)
	defer queueFlushTicker.Stop()

	// Update check & Cleanup ticker (every 1 hour)
	updateTicker := time.NewTicker(1 * time.Hour)
	defer updateTicker.Stop()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Initialize last alert times
	lastAlertTime := make(map[string]time.Time)
    
    // Initialize sustain start times (for health alert debouncing)
    sustainStartTime := make(map[string]time.Time)

	log.Printf("Monitoring started (interval: %ds)", cfg.Interval)

	for {
		select {
		case <-ticker.C:
			// Refresh configuration
            oldDriftInterval := cfg.DriftInterval
			if err := refreshConfig(apiClient, driftDetector, cronMonitor, cfg); err != nil {
				log.Printf("Warning: Failed to refresh config: %v", err)
			} else {
                // Check if drift interval changed
                if cfg.DriftInterval != oldDriftInterval {
                     newDriftInterval := 5 * time.Minute
                     if cfg.DriftInterval > 0 {
                        newDriftInterval = time.Duration(cfg.DriftInterval) * time.Second
                     } else if cfg.Interval < 60 {
                         // Fallback logic for when config is reset to 0 but interval is short
                         newDriftInterval = time.Duration(cfg.Interval) * time.Second
                     }
                     driftTicker.Reset(newDriftInterval)
                     log.Printf("Drift interval updated to %s", newDriftInterval)
                }
            }

            // NOTE: Drift check removed from here to reduce I/O load. 
            // It now runs on its own 5m ticker.

			if err := collectAndSend(apiClient, driftDetector, cronMonitor, cfg, lastAlertTime, sustainStartTime, false); err != nil {
				log.Printf("Error: %v", err)

				// Check if unauthorized (server deleted agent?)
				if errors.Is(err, api.ErrUnauthorized) {
					log.Println("⚠️  Server rejected credentials (node might be deleted). Attempting re-registration...")
					if err := registerAgent(apiClient, cfg.RegistrationToken); err != nil {
						log.Printf("❌ Re-registration failed: %v", err)
					} else {
						log.Println("✅ Re-registration successful! Resuming monitoring...")
					}
				}
			}

        case <-driftTicker.C:
            // Run Drift Check separately
			if err := collectAndSend(apiClient, driftDetector, cronMonitor, cfg, lastAlertTime, sustainStartTime, true); err != nil {
                 log.Printf("Error sending drift events: %v", err)
            }

		case <-queueFlushTicker.C:
			// Try to flush queued items periodically
			if q != nil && !q.IsConnected() {
				sent, failed, err := apiClient.FlushQueue()
				if err != nil {
					log.Printf("Queue flush attempt: %d sent, %d failed - error: %v", sent, failed, err)
				} else if sent > 0 {
					log.Printf("✓ Queue flush: %d sent successfully, %d failed", sent, failed)
				}
			}

		case <-updateTicker.C:
            // Cleanup stale cron jobs
            cronMonitor.Cleanup()

			// Check for updates
			log.Println("Checking for updates...")
			hasUpdate, newVersion, err := updater.CheckForUpdate(cfg.DashboardURL, Version)
			if err != nil {
				log.Printf("Failed to check for updates: %v", err)
			} else if hasUpdate {
				log.Printf("🚀 New version available: %s. Upgrading...", newVersion)
				if err := updater.ApplyUpdate(cfg.DashboardURL, newVersion); err != nil {
					log.Printf("❌ Failed to apply update: %v", err)
				} else {
					log.Println("✅ Update applied successfully! Exiting to restart...")
					return
				}
			}

		case sig := <-sigChan:
			log.Printf("Received signal %v, shutting down...", sig)
			return
		}
	}
}

// refreshConfig fetches and applies dynamic configuration from the dashboard
func refreshConfig(client *api.Client, driftDetector *drift.Detector, cronMonitor *cron.Monitor, cfg *config.Config) error {
	newConfig, err := client.GetConfig()
	if err != nil {
		return err
	}


	// Update Thresholds (Mapping Critical values to Agent's single threshold for now)
	cfg.Thresholds.CPU = int(newConfig.Thresholds.CPUCritical)
	cfg.Thresholds.Memory = int(newConfig.Thresholds.MemoryCritical)
	cfg.Thresholds.Disk = int(newConfig.Thresholds.DiskCritical)

    // Update Drift Params
	driftDetector.SetIgnore(newConfig.DriftIgnore)
    driftDetector.SetPaths(newConfig.DriftPaths)
    cfg.DriftInterval = newConfig.DriftInterval
    
    // Update Health Params
    cfg.HealthEnabled = newConfig.HealthEnabled
    cfg.HealthEnabled = newConfig.HealthEnabled
    cfg.HealthSustainDuration = newConfig.HealthSustainDuration
    
	// Update Cron Monitor
    cfg.CronEnabled = newConfig.CronEnabled
    
    cronConfig := cron.Config{
        CronIgnore:        newConfig.CronIgnore,
        CronGlobalTimeout: newConfig.CronGlobalTimeout,
        CronTimeouts:      newConfig.CronTimeouts,
        CronEnabled:       newConfig.CronEnabled,
        CronAutoDiscover:  newConfig.CronAutoDiscover,
    }
    cronMonitor.SetConfig(cronConfig)

    // Check for Log Collection Request
    if newConfig.CollectLogs {
        log.Println("📥 Received request to collect logs...")
        go func() {
            zipPath, err := collector.CollectLogs()
            if err != nil {
                log.Printf("❌ Failed to collect logs: %v", err)
                return
            }
            defer os.Remove(zipPath)

            log.Printf("📤 Uploading logs (%s)...", filepath.Base(zipPath))
            if err := client.UploadLogs(zipPath); err != nil {
                log.Printf("❌ Failed to upload logs: %v", err)
            } else {
                log.Println("✅ Logs uploaded successfully!")
            }
        }()
    }

    // Check for Uninstall command
    if newConfig.Uninstall {
        go SelfDestruct()
    }
	
	return nil
}

// registerAgent registers the agent with the dashboard
func registerAgent(client *api.Client, token string) error {
	sysInfo, err := collector.GetSystemInfo(Version)
	if err != nil {
		return fmt.Errorf("failed to get system info: %w", err)
	}

	req := api.RegisterRequest{
		ServerID:     "", // Will be set by client
		Hostname:     sysInfo.Hostname,
		OSName:       sysInfo.OSName,
		OSVersion:    sysInfo.OSVersion,
		AgentVersion:      Version,
		APISecret:         "", // Will be set by client
		RegistrationToken: token,
	}

	return client.Register(req)
}

// collectAndSend collects metrics and sends them to the dashboard
func collectAndSend(client *api.Client, driftDetector *drift.Detector, cronMonitor *cron.Monitor, cfg *config.Config, lastAlertTime map[string]time.Time, sustainStartTime map[string]time.Time, checkDrift bool) error {
	// Collect metrics
	metrics, err := collector.Collect()
	if err != nil {
		return fmt.Errorf("failed to collect metrics: %w", err)
	}

	// Convert to map for API
	metricsMap := map[string]interface{}{
		"cpu_percent":    metrics.CPUPercent,
		"mem_total_mb":   metrics.MemTotalMB,
		"mem_used_mb":    metrics.MemUsedMB,
		"disk_total_gb":  metrics.DiskTotalGB,
		"disk_used_gb":   metrics.DiskUsedGB,
		"load_avg_1":     metrics.LoadAvg1,
		"load_avg_5":     metrics.LoadAvg5,
		"load_avg_15":    metrics.LoadAvg15,
		"process_count":  metrics.ProcessCount,
		"processes":      metrics.Processes,
		"uptime":         metrics.Uptime,
	}

	// Add discovered cron jobs
	cronJobs := cronMonitor.GetTrackedJobs()
	discoveredJobs := make([]cron.JobRecord, 0, len(cronJobs))
	now := time.Now().Unix()
	for _, record := range cronJobs {
		job := *record // Copy
		// If job is currently running, calculate current duration
		if job.ActivePID > 0 && job.StartTime > 0 {
			job.LastDuration = now - job.StartTime
		}
		discoveredJobs = append(discoveredJobs, job)
	}
	metricsMap["cron_jobs"] = discoveredJobs

	// Send metrics
	if err := client.PushMetrics(metricsMap); err != nil {
		if errors.Is(err, api.ErrUnauthorized) {
			return api.ErrUnauthorized
		}
		return fmt.Errorf("failed to push metrics: %w", err)
	}

	// Collect events
	var events []api.Event

	// Check for drift (Conditional)
    if checkDrift {
        changed, summary, err := driftDetector.Check()
        if err != nil {
            log.Printf("Warning: Drift detection failed: %v", err)
        } else if changed {
            // Add drift event
            event := api.Event{
                Type:      "drift",
                Severity:  "warning",
                Message:   summary,
                Timestamp: time.Now().Unix(),
                // Details:   fmt.Sprintf(`{"checksum": "%s"}`, checksum), // Removed checksum detail
            }
            events = append(events, event)
            log.Printf("⚠️  Drift detected: %s", summary)
        }
    }

	// Check for cron failures
	cronEvents, err := cronMonitor.Check()
	if err != nil {
		log.Printf("Warning: Cron monitoring failed: %v", err)
	} else {
		for _, cronEvent := range cronEvents {
			if cronEvent.ExitCode != 0 {
                typeStr := "cron"
                if cronEvent.Type != "" {
                    typeStr = cronEvent.Type
                }
                
				event := api.Event{
					Type:      typeStr,
					Severity:  "error",
					Message:   cronEvent.ErrorMessage,
					Timestamp: cronEvent.Timestamp,
					Details:   fmt.Sprintf(`{"exit_code": %d, "error": "%s"}`, cronEvent.ExitCode, cronEvent.ErrorMessage),
				}
				events = append(events, event)
				log.Printf("⚠️  Cron job failed: %s", cronEvent.JobCommand)
			}
		}
	}

	// Check for resource thresholds
	if cfg.HealthEnabled {
		// CPU
		// CPU
		if metrics.CPUPercent > float64(cfg.Thresholds.CPU) {
			// Check sustain duration
			startTime, ok := sustainStartTime["cpu"]
			if !ok || startTime.IsZero() {
				sustainStartTime["cpu"] = time.Now()
			} else if time.Since(startTime) >= time.Duration(cfg.HealthSustainDuration)*time.Second {
				// sustained duration met
				if time.Since(lastAlertTime["cpu"]) > 1*time.Hour {
					// Find top CPU process
					var topProc string
					maxCPU := 0.0
					for _, p := range metrics.Processes {
						if p.CPU > maxCPU {
							maxCPU = p.CPU
							topProc = fmt.Sprintf("%s (cpu: %.1f%%)", p.Name, p.CPU)
						}
					}

					msg := fmt.Sprintf("High CPU usage detected: %.1f%% (Threshold: %d%%)", metrics.CPUPercent, cfg.Thresholds.CPU)
					if topProc != "" {
						msg += fmt.Sprintf(" - Top Process: %s", topProc)
					}

					event := api.Event{
						Type:      "health",
						Severity:  "warning",
						Message:   msg,
						Timestamp: time.Now().Unix(),
						Details:   fmt.Sprintf(`{"cpu_percent": %.1f, "threshold": %d}`, metrics.CPUPercent, cfg.Thresholds.CPU),
					}
					events = append(events, event)
					log.Printf("⚠️  High CPU usage: %.1f%%", metrics.CPUPercent)
					lastAlertTime["cpu"] = time.Now()
				}
			}
		} else {
			// Reset sustain timer
			delete(sustainStartTime, "cpu")
		}

		// RAM
		if metrics.MemTotalMB > 0 {
			memPercent := float64(metrics.MemUsedMB) / float64(metrics.MemTotalMB) * 100
			if memPercent > float64(cfg.Thresholds.Memory) {
				startTime, ok := sustainStartTime["memory"]
				if !ok || startTime.IsZero() {
					sustainStartTime["memory"] = time.Now()
				} else if time.Since(startTime) >= time.Duration(cfg.HealthSustainDuration)*time.Second {
					if time.Since(lastAlertTime["memory"]) > 1*time.Hour {
						// Find top memory user (reusing collection from loop)
						var topProc string
						maxMem := 0.0
						for _, p := range metrics.Processes {
							if p.Memory > maxMem {
								maxMem = p.Memory
								topProc = fmt.Sprintf("%s (mem: %.1f%%)", p.Name, p.Memory)
							}
						}

						msg := fmt.Sprintf("High Memory usage detected: %.1f%% (Threshold: %d%%)", memPercent, cfg.Thresholds.Memory)
						if topProc != "" {
							msg += fmt.Sprintf(" - Top Process: %s", topProc)
						}

						event := api.Event{
							Type:      "health",
							Severity:  "warning",
							Message:   msg,
							Timestamp: time.Now().Unix(),
							Details:   fmt.Sprintf(`{"mem_percent": %.1f, "used_mb": %d, "total_mb": %d, "threshold": %d}`, memPercent, metrics.MemUsedMB, metrics.MemTotalMB, cfg.Thresholds.Memory),
						}
						events = append(events, event)
						log.Printf("⚠️  High Memory usage: %.1f%%", memPercent)
						lastAlertTime["memory"] = time.Now()
					}
				}
			} else {
				delete(sustainStartTime, "memory")
			}
		}

		// Disk
		if metrics.DiskTotalGB > 0 {
			diskPercent := float64(metrics.DiskUsedGB) / float64(metrics.DiskTotalGB) * 100
			if diskPercent > float64(cfg.Thresholds.Disk) {
				startTime, ok := sustainStartTime["disk"]
				if !ok || startTime.IsZero() {
					sustainStartTime["disk"] = time.Now()
				} else if time.Since(startTime) >= time.Duration(cfg.HealthSustainDuration)*time.Second {
					if time.Since(lastAlertTime["disk"]) > 1*time.Hour {
						event := api.Event{
							Type:      "health",
							Severity:  "warning",
							Message:   fmt.Sprintf("Low Disk Space: %.1f%% used (Threshold: %d%%)", diskPercent, cfg.Thresholds.Disk),
							Timestamp: time.Now().Unix(),
							Details:   fmt.Sprintf(`{"disk_percent": %.1f, "used_gb": %d, "total_gb": %d, "threshold": %d}`, diskPercent, metrics.DiskUsedGB, metrics.DiskTotalGB, cfg.Thresholds.Disk),
						}
						events = append(events, event)
						log.Printf("⚠️  Low Disk Space: %.1f%%", diskPercent)
						lastAlertTime["disk"] = time.Now()
					}
				}
			} else {
				delete(sustainStartTime, "disk")
			}
		}
	}

	// Send events if any
	if len(events) > 0 {
		if err := client.PushEvents(events); err != nil {
			log.Printf("Warning: Failed to push events: %v", err)
		}
	}

	log.Printf("✓ Metrics sent (CPU: %.1f%%, RAM: %dMB/%dMB, Disk: %dGB/%dGB)",
		metrics.CPUPercent,
		metrics.MemUsedMB, metrics.MemTotalMB,
		metrics.DiskUsedGB, metrics.DiskTotalGB,
	)

	return nil
}

// install sets up the agent configuration and systemd service
func install(dashboardURL, configPath string) error {
	if dashboardURL == "" {
		return fmt.Errorf("--dashboard-url is required for installation")
	}

	// Generate configuration
	cfg := config.GenerateDefault(dashboardURL)

	// Save configuration
	if err := cfg.Save(configPath); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	fmt.Printf("✅ Configuration saved to %s\n", configPath)
	fmt.Printf("   Server ID: %s\n", cfg.ServerID)
	fmt.Printf("   API Secret: %s\n", cfg.APISecret)

	// TODO: Create systemd service file
	// This would be implemented in a separate installer module

	return nil
}
