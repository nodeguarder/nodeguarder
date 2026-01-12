package cron

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Monitor tracks cron jobs and detects failures
type Monitor struct {
    mu sync.RWMutex
	lastCheckTime int64
	lastSeenJobs  map[string]*JobRecord
	ignores       map[string][]int
	globalTimeout int
	timeouts      map[string]int
	logPath       string
	fileOffsets   map[string]int64
	enabled       bool
	autoDiscover  bool
    orphanedExits map[int32]orphanExit
}

// Config holds the configuration for the cron monitor
type Config struct {
	CronIgnore        map[string][]int
	CronGlobalTimeout int
	CronTimeouts      map[string]int
	CronEnabled       bool
	CronAutoDiscover  bool
}

// JobRecord tracks the state of a specific cron job
type JobRecord struct {
	Command      string
	LastExecTime int64
	ActivePID    int32
	StartTime    int64
	LastExitCode int
	LastErrorMsg string
	FailureCount int
	LastDuration int64
    AlertSent    bool
}

// CronEvent represents a notable cron job event (failure or long running)
type CronEvent struct {
	Timestamp    int64
	ExitCode     int
	ErrorMessage string
	JobCommand   string
	Type         string
}

// New creates a new cron monitor
func New(logPath string) *Monitor {
	if logPath == "" {
		logPath = "/var/log/syslog"
	}
	return &Monitor{
		lastCheckTime: time.Now().Unix(),
		lastSeenJobs:  make(map[string]*JobRecord),
		ignores:       make(map[string][]int),
		fileOffsets:   make(map[string]int64),
		logPath:       logPath,
		enabled:       true, // Default to true until config loaded
		autoDiscover:  true, // Default to true
	}
}

// SetEnabled enables or disables the monitor
func (m *Monitor) SetEnabled(enabled bool) {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.enabled != enabled {
        log.Printf("Cron Monitor status changed: %v -> %v", m.enabled, enabled)
    }
    m.enabled = enabled
}

// SetIgnore updates the list of ignored exit codes per job
func (m *Monitor) SetIgnore(ignores map[string][]int) {
    m.mu.Lock()
    defer m.mu.Unlock()
	m.ignores = ignores
}

// SetTimeouts updates the timeout configurations
func (m *Monitor) SetTimeouts(global int, overrides map[string]int) {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.globalTimeout != global {

    }
	m.globalTimeout = global
	m.timeouts = overrides
}

// SetConfig updates the monitor's configuration from a Config struct
func (m *Monitor) SetConfig(cfg Config) {
    m.mu.Lock()
    defer m.mu.Unlock()
	m.ignores = cfg.CronIgnore
	m.globalTimeout = cfg.CronGlobalTimeout
	m.timeouts = cfg.CronTimeouts
	m.enabled = cfg.CronEnabled
	m.autoDiscover = cfg.CronAutoDiscover
}

// Check scans system logs for cron events since the last check
func (m *Monitor) Check() ([]CronEvent, error) {
    if !m.enabled {
        return []CronEvent{}, nil
    }

	var events []CronEvent
	currentTime := time.Now().Unix()

	// If a custom log path is configured (not the default syslog), use it directly
	// Otherwise, try journalctl first, then fall back to default syslog
	var entries []string
	var err error

	if m.logPath != "/var/log/syslog" {
		entries, err = m.getCronEntriesFromSyslog(m.lastCheckTime)
		if err != nil {
			return nil, fmt.Errorf("failed to read cron events from custom log %s: %w", m.logPath, err)
		}
	} else {
		// Try journalctl first (systemd)
		entries, err = m.getCronEntriesFromJournal(m.lastCheckTime)
		if err != nil {
			// log.Printf("Warning: Failed to read cron from journalctl, trying syslog: %v", err)
			entries, err = m.getCronEntriesFromSyslog(m.lastCheckTime)
			if err != nil {
				return nil, fmt.Errorf("failed to read cron events: %w", err)
			}
		}
	}

	// Process each entry
    m.mu.Lock()
    defer m.mu.Unlock()
    
	for _, entry := range entries {
		event := m.processCronEntry(entry)
		if event != nil {
			events = append(events, *event)
		}
	}

	// Check for long running jobs
	longRunningEvents := m.checkLongRunningJobs()
	events = append(events, longRunningEvents...)

    // Check for BPF-detected failures (Zero Touch)
    bpfEvents := m.checkBPFFailures()
    events = append(events, bpfEvents...)

	m.lastCheckTime = currentTime

	return events, nil
}

// checkBPFFailures generates events for jobs that failed according to eBPF capture
func (m *Monitor) checkBPFFailures() []CronEvent {
    var events []CronEvent
    // now := time.Now().Unix()

    for cmd, record := range m.lastSeenJobs {
        if record.LastExitCode != 0 && !record.AlertSent {
            // Check ignores
            ignored := false
            if codes, ok := m.ignores[cmd]; ok {
                // log.Printf("DEBUG: Checking ignore for %s (Code %d) vs %v", cmd, record.LastExitCode, codes)
				for _, code := range codes {
					if code == record.LastExitCode {
						ignored = true

                        break
					}
				}
			} else {
                 // log.Printf("DEBUG: No ignore rules for %s", cmd)
            }
            
            if !ignored {
                events = append(events, CronEvent{
                    JobCommand:   cmd,
                    ExitCode:     record.LastExitCode,
                    ErrorMessage: record.LastErrorMsg, // Set by UpdateJobStatusByPID
                    Timestamp:    record.LastExecTime,
                    Type:         "cron_error", // Standard cron error
                })
            }
            // Mark as sent so we don't spam
            record.AlertSent = true
        }
    }
    return events
}

// getCronEntriesFromJournal reads cron events from journalctl
func (m *Monitor) getCronEntriesFromJournal(since int64) ([]string, error) {
	sinceStr := fmt.Sprintf("@%d", since)

	cmd := exec.Command("journalctl", "--unit=cron.service", "--since="+sinceStr, "--no-pager", "-o", "short-precise")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var entries []string
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "CRON") || strings.Contains(line, "cron") {
			entries = append(entries, line)
		}
	}

	return entries, nil
}

// getCronEntriesFromSyslog reads cron events from /var/log/syslog
func (m *Monitor) getCronEntriesFromSyslog(since int64) ([]string, error) {
	file, err := os.Open(m.logPath)
	if err != nil {
		// Try /var/log/messages for older systems
		file, err = os.Open("/var/log/messages")
		if err != nil {
			return nil, err
		}
	}
	defer file.Close()

	// Get file info for size check
	fi, err := file.Stat()
	if err != nil {
		return nil, err
	}

	// Determine start position
	var startPos int64 = 0
	if offset, ok := m.fileOffsets[m.logPath]; ok {
		// Log rotation detection: if current size is less than last offset, start from 0
		if fi.Size() >= offset {
			startPos = offset
		}
	}

	// Seek to start position
	if _, err := file.Seek(startPos, 0); err != nil {
		return nil, err
	}

	var entries []string
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "CRON") || strings.Contains(line, "cron") {
			entries = append(entries, line)
		}
	}

    // Update offset (account for read bytes, close enough approximation with Size or Tell)
    // Using current file size is safest after full read
    m.fileOffsets[m.logPath] = fi.Size()

	return entries, nil
}

// Pre-compiled regex patterns
var (
	userPattern = regexp.MustCompile(`\((.*?)\)`)
	cmdPattern  = regexp.MustCompile(`CMD \((.*?)\)`)
	exitPattern = regexp.MustCompile(`exit code (\d+)`)
	pidPattern  = regexp.MustCompile(`CRON\[(\d+)\]:`)
)

// processCronEntry analyzes a cron log entry and returns an event if it's a failure
func (m *Monitor) processCronEntry(entry string) *CronEvent {
	// Pattern: "CRON[12345]: (user) CMD (command)"
	// Pattern: "CRON[12345]: (user) FAILED exit code (exit_code) or similar"

    // Parse Timestamp from Log Entry (Start of line)
    // Format: 2026-01-04T12:52:00.687173+01:00 hostname CRON...
    // We just take the first whitespace-separated token
    parts := strings.Fields(entry)
    if len(parts) > 0 {
        tsStr := parts[0]
        // RFC3339 is standard for rsyslog precise format, but let's try generic RFC3339
        parsedTime, err := time.Parse(time.RFC3339, tsStr)
        if err == nil {
             // Check if Too Old (e.g. > 2 minutes ago)
             // We use a small buffer effectively to allow for processing lag, but filter out historical replays
             if time.Since(parsedTime) > 2*time.Minute {
                 // log.Printf("DEBUG: Ignoring old log entry from %s", tsStr)
                 return nil
             }
        }
    }

	// Check for failed cron jobs
	if strings.Contains(entry, "FAILED") || strings.Contains(entry, "(FAILED)") {
		event := &CronEvent{
			Timestamp:    time.Now().Unix(),
			ExitCode:     1,
			ErrorMessage: entry,
		}

		// Extract User
		user := "root" // default
		if matches := userPattern.FindStringSubmatch(entry); len(matches) > 1 {
			user = matches[1]
		}

		// Try to extract command from log
		if matches := cmdPattern.FindStringSubmatch(entry); len(matches) > 1 {
			event.JobCommand = matches[1]
		}

		// Try to extract exit code
		if matches := exitPattern.FindStringSubmatch(entry); len(matches) > 1 {
			fmt.Sscanf(matches[1], "%d", &event.ExitCode)
		}

		// Check if we should ignore this failure
		if event.JobCommand != "" {
			if codes, ok := m.ignores[event.JobCommand]; ok {
				for _, code := range codes {
					if code == event.ExitCode {
						return nil // Ignored
					}
				}
			}
		}

		// Enrich Error Message with Exit Code Meaning and User
		desc := getExitCodeDescription(event.ExitCode)
		event.ErrorMessage = fmt.Sprintf("Cron job failed: %s (User: %s) - %s (%d)", 
			event.JobCommand, user, desc, event.ExitCode)
		
		return event
	}

	// Check for successful execution (or start of execution)
	if strings.Contains(entry, "CMD") && !strings.Contains(entry, "FAILED") {

		// This is a start of execution
		// Extract PID
		var pid int32
		if matches := pidPattern.FindStringSubmatch(entry); len(matches) > 1 {
			fmt.Sscanf(matches[1], "%d", &pid)
        } else {

        }

		event := &CronEvent{
			Timestamp: time.Now().Unix(),
			ExitCode:  0,
		}

		var cmd string
		if matches := cmdPattern.FindStringSubmatch(entry); len(matches) > 1 {
			cmd = matches[1]
		}
		event.JobCommand = cmd

		// If command is empty, skip
		if cmd == "" {
			return nil
		}

		// If Auto-Discovery is disabled, ONLY track if it is in timeouts or ignores (Allowlist)
		if !m.autoDiscover {
			_, hasTimeout := m.timeouts[cmd]
			_, hasIgnore := m.ignores[cmd]
			if !hasTimeout && !hasIgnore {
				return nil
			}
		}

			// Update Job Record
			if record, exists := m.lastSeenJobs[cmd]; exists {
                record.LastExecTime = event.Timestamp
                record.ActivePID = pid
                record.StartTime = event.Timestamp
                
                // Check if we have an orphaned exit for this PID (Direct Match or NS Match)
                orphan, ok := m.orphanedExits[pid]
                // OR Check if we have an orphaned exit where ParentPid == pid (Fork Match)
                if !ok {
                   for opid, o := range m.orphanedExits {
                       if o.ParentPid == pid || (o.NsPid != 0 && o.NsPid == pid) || (o.NsParentPid != 0 && o.NsParentPid == pid) {
                           orphan = o
                           ok = true
                           delete(m.orphanedExits, opid) 
                           break
                       }
                   }
                } else {
                    delete(m.orphanedExits, pid)
                }

                if ok {

                    record.LastExitCode = orphan.ExitCode
                     if orphan.ExitCode != 0 {
                        record.FailureCount++
                        record.LastErrorMsg = fmt.Sprintf("Cron job failed: %s - Process exited with code %d (captured via eBPF)", cmd, orphan.ExitCode)
                        record.AlertSent = false // Ensure we alert
                     }
                     record.ActivePID = 0 // Validated as finished
                }
                
			} else {
                // New job seen
                rec := &JobRecord{
                    Command:      event.JobCommand,
                    LastExecTime: event.Timestamp,
                    ActivePID:    pid,
                    StartTime:    event.Timestamp,
                    AlertSent:    false,
                }
                // Check orphans
                orphan, ok := m.orphanedExits[pid]
                 if !ok {
                   for opid, o := range m.orphanedExits {
                       if o.ParentPid == pid || (o.NsPid != 0 && o.NsPid == pid) || (o.NsParentPid != 0 && o.NsParentPid == pid) {
                           orphan = o
                           ok = true
                           delete(m.orphanedExits, opid)
                           break
                       }
                   }
                } else {
                    delete(m.orphanedExits, pid)
                }

                if ok {

                    rec.LastExitCode = orphan.ExitCode
                    if orphan.ExitCode != 0 {
                        rec.FailureCount = 1
                        rec.LastErrorMsg = fmt.Sprintf("Cron job failed: %s - Process exited with code %d (captured via eBPF)", event.JobCommand, orphan.ExitCode)
                    }
                    rec.ActivePID = 0
                }
                m.lastSeenJobs[event.JobCommand] = rec
            }
		}
        return nil // Start event doesn't trigger API event
	}

func getExitCodeDescription(code int) string {
	switch code {
	case 1:
		return "General Error"
	case 2:
		return "Misuse of Shell Builtin"
	case 126:
		return "Command Invoked Cannot Execute"
	case 127:
		return "Command Not Found"
	case 128:
		return "Invalid Exit Argument"
	case 130:
		return "Script Terminated by Control-C"
	case 137:
		return "Killed (OOM/Manual)"
	case 139:
		return "Segmentation Fault"
	case 143:
		return "Terminated by SIGTERM"
	default:
		if code > 128 {
			return fmt.Sprintf("Signal %d", code-128)
		}
		return "Unknown Error"
	}
}

// UpdateJobStatus updates tracking for a specific job
func (m *Monitor) UpdateJobStatus(command string, exitCode int, errorMsg string) {
    m.mu.Lock()
    defer m.mu.Unlock()

	if record, exists := m.lastSeenJobs[command]; exists {
		record.LastExecTime = time.Now().Unix()
		record.LastExitCode = exitCode
		record.LastErrorMsg = errorMsg

		if exitCode != 0 {
			record.FailureCount++
		} else {
			record.FailureCount = 0
		}
	} else {
		m.lastSeenJobs[command] = &JobRecord{
			Command:       command,
			LastExecTime:  time.Now().Unix(),
			LastExitCode:  exitCode,
			LastErrorMsg:  errorMsg,
			FailureCount:  0,
		}

		if exitCode != 0 {
			m.lastSeenJobs[command].FailureCount = 1
		}
	}
}

// orphanExit represents a BPF exit event that arrived before the start log
type orphanExit struct {
    ExitCode    int
    ParentPid   int32
    NsPid       int32
    NsParentPid int32
    Timestamp   int64
}

// UpdateJobStatusByPID updates a job's status by matching its ActivePID
func (m *Monitor) UpdateJobStatusByPID(pid int32, parentPid int32, nsPid int32, nsParentPid int32, exitCode int) {
    m.mu.Lock()
    defer m.mu.Unlock()



    found := false
    for _, record := range m.lastSeenJobs {
        // Match Global PIDs OR Namespace PIDs
        matchGlobal := (record.ActivePID == pid) || (record.ActivePID != 0 && record.ActivePID == parentPid)
        matchNs := (nsPid != 0 && record.ActivePID == nsPid) || (nsParentPid != 0 && record.ActivePID != 0 && record.ActivePID == nsParentPid)

        if matchGlobal || matchNs {
            found = true

            record.LastExecTime = time.Now().Unix()
            record.LastExitCode = exitCode
            record.LastDuration = record.LastExecTime - record.StartTime
            record.ActivePID = 0 
            record.AlertSent = false 
            
            if exitCode != 0 {
                record.FailureCount++
                record.LastErrorMsg = fmt.Sprintf("Process exited with code %d (captured via eBPF)", exitCode)
            } else {
                record.FailureCount = 0
                record.LastErrorMsg = ""
            }
            break
        }
    }
    
    if !found {
        if m.orphanedExits == nil {
             m.orphanedExits = make(map[int32]orphanExit)
        }
        
        // We key by BOTH Global PID and Namespace PID to allow lookup by either
        orphan := orphanExit{
            ExitCode:    exitCode,
            ParentPid:   parentPid,
            NsPid:       nsPid,
            NsParentPid: nsParentPid,
            Timestamp:   time.Now().Unix(),
        }
        
        // Store by Global PID
        m.orphanedExits[pid] = orphan
        // Store by NS PID if different
        if nsPid != 0 && nsPid != pid {
             m.orphanedExits[nsPid] = orphan

        } else {

        }
        
        // Cleanup old orphans
        now := time.Now().Unix()
        for p, orphan := range m.orphanedExits {
            if now - orphan.Timestamp > 60 { // TTL 60s
                delete(m.orphanedExits, p)
            }
        }
    }
}

// GetTrackedJobs returns all currently tracked cron jobs
func (m *Monitor) GetTrackedJobs() map[string]*JobRecord {
    m.mu.RLock()
    defer m.mu.RUnlock()
	return m.lastSeenJobs
}

// Cleanup removes stale jobs that haven't run in 7 days
func (m *Monitor) Cleanup() {
    m.mu.Lock()
    defer m.mu.Unlock()
    now := time.Now().Unix()
    retention := int64(7 * 24 * 60 * 60) // 7 days (covers weekly jobs and weekends)

    for cmd, record := range m.lastSeenJobs {
        if now - record.LastExecTime > retention {
             delete(m.lastSeenJobs, cmd)
        }
    }
}

// checkLongRunningJobs checks if active jobs have exceeded their timeout
func (m *Monitor) checkLongRunningJobs() []CronEvent {
	var events []CronEvent
	now := time.Now().Unix()

	for cmd, record := range m.lastSeenJobs {
        // Determine Timeout
        timeout := m.globalTimeout
        if t, ok := m.timeouts[cmd]; ok {
            timeout = t
        }

		if record.ActivePID > 0 {
			// Check if process is still running
			// NOTE: We disable PidExists check because in containerized environments (like WSL),
            // record.ActivePID is the Namespace PID, which may not exist or be different in the Host Namespace where the Agent runs.
            // We rely on BPF exit events to clear the ActivePID.
			/*
			exists, err := process.PidExists(record.ActivePID)
			if err != nil || !exists {
                // log.Printf("DEBUG: Process %d for %s gone (Exists: %v, Err: %v)", record.ActivePID, cmd, exists, err)
				// Process is gone, mark as finished
				record.LastDuration = now - record.StartTime
				record.ActivePID = 0
                record.AlertSent = false
				continue
			}
			*/

			// Calculate Duration
			duration := now - record.StartTime
			
			// Check Timeout
			if timeout > 0 && duration > int64(timeout) {
                // Only alert once per job execution
                if !record.AlertSent {
                    // Generate Event
                    events = append(events, CronEvent{
                        JobCommand:   cmd,
                        ExitCode:     -1, // Special code for timeout/long running
                        ErrorMessage: fmt.Sprintf("Long running cron job detected: %s (PID: %d) running for %ds (Timeout: %ds)", cmd, record.ActivePID, duration, timeout),
                        Timestamp:    now,
                        Type:         "long_running",
                    })
                    record.AlertSent = true
                }
			}
		} else {
            // Check if it finished RECENTLY (since last check) and WAS long running
            if record.LastExecTime > m.lastCheckTime {
                 // It finished in this interval. Check final duration.
                 if timeout > 0 && record.LastDuration > int64(timeout) {
                      // We might have missed the "active" check, or it finished just slightly over.
                      // Since ActivePID is 0, AlertSent was reset to false in UpdateJobStatusByPID.
                      // So we treat this as a "Long Running (Finished)" event.
                      events = append(events, CronEvent{
                        JobCommand:   cmd,
                        ExitCode:     -1, 
                        ErrorMessage: fmt.Sprintf("Long running cron job detected (Finished): %s ran for %ds (Timeout: %ds)", cmd, record.LastDuration, timeout),
                        Timestamp:    record.LastExecTime,
                        Type:         "long_running",
                    })
                    // No need to set AlertSent as it's finished and won't match "LastExecTime > lastCheckTime" next loop (lastCheckTime updates)
                 }
            }
        }
	}
	return events
}
