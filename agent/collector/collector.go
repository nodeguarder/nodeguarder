package collector

import (
	"runtime"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
	"sort"
)

// Metrics represents system telemetry data
type Metrics struct {
	CPUPercent   float64 `json:"cpu_percent"`
	MemTotalMB   uint64  `json:"mem_total_mb"`
	MemUsedMB    uint64  `json:"mem_used_mb"`
	DiskTotalGB  uint64  `json:"disk_total_gb"`
	DiskUsedGB   uint64  `json:"disk_used_gb"`
	LoadAvg1     float64 `json:"load_avg_1"`
	LoadAvg5     float64 `json:"load_avg_5"`
	LoadAvg15    float64 `json:"load_avg_15"`
	ProcessCount int           `json:"process_count"`
	Uptime       uint64        `json:"uptime"`
	Processes    []ProcessInfo `json:"processes"`
}

// ProcessInfo represents a running process
type ProcessInfo struct {
	PID    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
	User   string  `json:"user"`
}

// SystemInfo represents static system information
type SystemInfo struct {
	Hostname      string `json:"hostname"`
	OSName        string `json:"os_name"`
	OSVersion     string `json:"os_version"`
	AgentVersion  string `json:"agent_version"`
	KernelVersion string `json:"kernel_version"`
	Platform      string `json:"platform"`
}

// Collect gathers all system metrics
func Collect() (*Metrics, error) {
	metrics := &Metrics{}

	// CPU usage
	cpuPercentages, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercentages) > 0 {
		metrics.CPUPercent = cpuPercentages[0]
	}

	// Memory
	if vmem, err := mem.VirtualMemory(); err == nil {
		metrics.MemTotalMB = vmem.Total / 1024 / 1024
		metrics.MemUsedMB = vmem.Used / 1024 / 1024
	}

	// Disk usage (root partition)
	if diskUsage, err := disk.Usage("/"); err == nil {
		metrics.DiskTotalGB = diskUsage.Total / 1024 / 1024 / 1024
		metrics.DiskUsedGB = diskUsage.Used / 1024 / 1024 / 1024
	}

	// Load average (Linux/Unix only)
	if runtime.GOOS == "linux" {
		if loadAvg, err := load.Avg(); err == nil {
			metrics.LoadAvg1 = loadAvg.Load1
			metrics.LoadAvg5 = loadAvg.Load5
			metrics.LoadAvg15 = loadAvg.Load15
		}
	}

	// Process count
	if processes, err := process.Pids(); err == nil {
		metrics.ProcessCount = len(processes)
	}

	// Uptime
	if uptime, err := host.Uptime(); err == nil {
		metrics.Uptime = uptime
	}

	// Top Processes
	metrics.Processes = collectTopProcesses()

	return metrics, nil
}

// collectTopProcesses gathers top 5 processes by CPU and Memory
func collectTopProcesses() []ProcessInfo {
	procs, err := process.Processes()
	if err != nil {
		return []ProcessInfo{}
	}

	var parsedProcs []ProcessInfo
	for _, p := range procs {
		// Skip if process is gone
		if exists, _ := process.PidExists(p.Pid); !exists {
			continue
		}

		// Get details (ignoring errors for restricted processes)
		name, _ := p.Name()
		cpuPercent, _ := p.CPUPercent()
		memPercent, _ := p.MemoryPercent()
		user, _ := p.Username()

		parsedProcs = append(parsedProcs, ProcessInfo{
			PID:    p.Pid,
			Name:   name,
			CPU:    cpuPercent,
			Memory: float64(memPercent),
			User:   user,
		})
	}

	// Sort by CPU
	sort.Slice(parsedProcs, func(i, j int) bool {
		return parsedProcs[i].CPU > parsedProcs[j].CPU
	})

	// Take top 5
	top := []ProcessInfo{}
	count := 0
	for _, p := range parsedProcs {
		if count >= 5 {
			break
		}
		top = append(top, p)
		count++
	}

	return top
}

// GetSystemInfo gathers static system information
func GetSystemInfo(agentVersion string) (*SystemInfo, error) {
	info := &SystemInfo{
		AgentVersion: agentVersion,
		Platform:     runtime.GOOS + "/" + runtime.GOARCH,
	}

	// Host information
	if hostInfo, err := host.Info(); err == nil {
		info.Hostname = hostInfo.Hostname
		info.OSName = hostInfo.OS
		info.OSVersion = hostInfo.PlatformVersion
		info.KernelVersion = hostInfo.KernelVersion
	}

	return info, nil
}
