# Health Status Calculation Package

**Purpose:** Dynamic health status determination for monitored servers based on real-time metrics and events.

**Status:** Production-ready  
**Version:** 1.0.0  
**Package:** `github.com/yourusername/health-dashboard-backend/health`

---

## Overview

The health calculator continuously evaluates server health based on:
- **CPU usage** (warning >80%, critical >95%)
- **Memory usage** (warning >80%, critical >95%)
- **Disk usage** (warning >80%, critical >95%)
- **Offline detection** (no metrics for >20 seconds = offline)
- **Drift events** (configuration changes = warning status)

Health status is automatically updated whenever metrics arrive from agents, providing real-time visibility into infrastructure health.

---

## Architecture

### Health Status States

```
HEALTHY  ← All metrics below warning threshold, no events
   ↓
WARNING  ← Any metric 80-95%, OR drift event detected
   ↓
CRITICAL ← Any metric ≥95%
   ↓
OFFLINE  ← No metrics received in 20 seconds (2x 10s interval)
   ↓
UNKNOWN  ← No metrics available yet
```

### Threshold Constants

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU    | 80%     | 95%      |
| Memory | 80%     | 95%      |
| Disk   | 80%     | 95%      |

**Note:** Thresholds are configurable in `calculator.go` constants section.

### Integration Points

1. **Metric Arrival** → `agent.go` calls `health.UpdateServerHealth(serverID)`
2. **Event Arrival** → Drift events automatically trigger status recalculation
3. **API Queries** → `GetServers()` returns current health_status for each server
4. **Offline Detection** → Status computed from `last_seen` timestamp

---

## Public API

### Calculate Health Status

```go
// CalculateHealth computes health based on latest metrics
// Returns: "healthy", "warning", "critical", "offline", or "unknown"
status, err := health.CalculateHealth(serverID)
```

**Parameters:**
- `serverID` (string): Server identifier

**Returns:**
- `status` (string): Current health status
- `error`: Any database errors

**Usage:**
```go
status, err := health.CalculateHealth("server-abc123")
if err != nil {
    log.Printf("Error calculating health: %v", err)
}
log.Printf("Server status: %s", status)  // "healthy", "warning", etc.
```

---

### Update Server Health

```go
// UpdateServerHealth calculates and persists health status
err := health.UpdateServerHealth(serverID)
```

**Purpose:** Calculate health and update database `servers.health_status`

**Usage (in agent.go):**
```go
// After inserting metrics
_, err := database.DB.Exec("INSERT INTO metrics ...")
if err == nil {
    // Update server health based on new metrics
    health.UpdateServerHealth(req.ServerID)
}
```

---

### Get Current Health Status

```go
// GetServerHealth retrieves current health status from database
status, err := health.GetServerHealth(serverID)
```

**Returns:** Cached health status without recalculation

**Usage:**
```go
status, err := health.GetServerHealth("server-id")
// Returns: "healthy", "warning", "critical", "offline", "unknown"
```

---

### Get Detailed Health Metrics

```go
// GetHealthMetricsForServer returns detailed metrics for frontend display
metrics, err := health.GetHealthMetricsForServer(serverID)
```

**Returns:** `*HealthMetrics` struct with:
- `CPUPercent` (float64): Current CPU usage percentage
- `MemoryPercent` (float64): Current memory usage percentage
- `DiskPercent` (float64): Current disk usage percentage
- `IsOffline` (bool): Whether server is offline
- `HasDriftEvent` (bool): Recent drift detected
- `HealthStatus` (string): Overall health status
- `LastMetricTime` (int64): Unix timestamp of latest metric

**Usage:**
```go
hm, err := health.GetHealthMetricsForServer("server-id")
if err == nil {
    fmt.Printf("CPU: %.1f%%, Memory: %.1f%%, Status: %s\n",
        hm.CPUPercent, hm.MemoryPercent, hm.HealthStatus)
}
```

---

## Integration with Agent Handler

### In `handlers/agent.go` - AgentPushMetrics()

**Current Flow:**
```go
func AgentPushMetrics(c *fiber.Ctx) error {
    // Parse and validate request
    // Insert metrics into database
    database.DB.Exec("INSERT INTO metrics ...")
    
    // Update last_seen
    database.DB.Exec("UPDATE servers SET last_seen = ? WHERE id = ?", ...)
    
    return c.JSON(fiber.Map{"status": "ok"})
}
```

**With Health Calculation:**
```go
import "github.com/yourusername/health-dashboard-backend/health"

func AgentPushMetrics(c *fiber.Ctx) error {
    // ... existing code ...
    
    // Insert metrics
    _, err := database.DB.Exec(
        "INSERT INTO metrics (server_id, timestamp, ...) VALUES (...)",
        req.ServerID, req.Timestamp, ...
    )
    if err == nil {
        // Calculate and update health status after successful metric insert
        health.UpdateServerHealth(req.ServerID)
    }
    
    // Update last_seen
    database.DB.Exec("UPDATE servers SET last_seen = ? WHERE id = ?", ...)
    
    return c.JSON(fiber.Map{"status": "ok"})
}
```

### In `handlers/servers.go` - GetServers()

Status is already returned in the Server struct:
```go
func GetServers(c *fiber.Ctx) error {
    rows, err := database.DB.Query(`
        SELECT id, hostname, ..., health_status, ...
        FROM servers
    `)
    // Health status included in response automatically
}
```

---

## Decision Logic

### Metric-Based Thresholds

The calculator evaluates metrics in this order:

1. **Get Latest Metric** for server
   - If no metrics: return "unknown"

2. **Calculate Percentages**
   - Memory %: `(used / total) × 100`
   - Disk %: `(used / total) × 100`

3. **Evaluate Thresholds**
   ```
   if any_metric >= 95%  → CRITICAL
   elif any_metric >= 80% → WARNING
   elif drift_event       → WARNING
   else                   → HEALTHY
   ```

4. **Check Offline Status**
   - If no metric in last 20 seconds → OFFLINE
   - (Takes precedence over metric-based status)

### Example Calculations

**Scenario 1: CPU Spike**
```
CPU: 85%  (80% ≤ 85% < 95%)  → WARNING
Memory: 60%
Disk: 75%
→ Status: WARNING
```

**Scenario 2: Memory Critical**
```
CPU: 50%
Memory: 97%  (≥ 95%)          → CRITICAL
Disk: 65%
→ Status: CRITICAL
```

**Scenario 3: Drift Detected**
```
CPU: 50%
Memory: 60%
Disk: 75%
Drift Event: Yes              → WARNING
→ Status: WARNING
```

**Scenario 4: Offline**
```
Last metric: 35 seconds ago   (> 20 second threshold)
→ Status: OFFLINE (regardless of metric values)
```

---

## Testing

### Unit Tests

Run health calculator tests:
```bash
cd dashboard/backend
go test ./health -v
```

**Test Coverage:**
- ✅ Threshold evaluation (all combinations)
- ✅ Metric percentage calculations
- ✅ Offline detection logic
- ✅ Status constant definitions
- ✅ Time-based calculations

### Manual Testing

**Test 1: CPU Warning**
```bash
# Insert metric with CPU = 85%
sqlite3 data/health.db <<EOF
INSERT INTO metrics (server_id, timestamp, cpu_percent, mem_total_mb, mem_used_mb, disk_total_gb, disk_used_gb)
VALUES ('test-server', strftime('%s', 'now'), 85.0, 8000, 4000, 500, 250);
UPDATE servers SET last_seen = strftime('%s', 'now') WHERE id = 'test-server';
EOF

# Verify status updated
sqlite3 data/health.db "SELECT health_status FROM servers WHERE id = 'test-server';"
# Should show: warning
```

**Test 2: Memory Critical**
```bash
# 97% memory usage
INSERT INTO metrics (server_id, timestamp, cpu_percent, mem_total_mb, mem_used_mb, disk_total_gb, disk_used_gb)
VALUES ('test-server', strftime('%s', 'now'), 50.0, 8000, 7760, 500, 250);
```

**Test 3: Offline Detection**
```bash
# Don't send metrics for 25+ seconds
# Check status after 25 seconds
sqlite3 data/health.db "SELECT health_status FROM servers WHERE id = 'test-server';"
# Should show: offline
```

**Test 4: Drift Event**
```bash
# Insert drift event
INSERT INTO events (server_id, timestamp, event_type, severity, message)
VALUES ('test-server', strftime('%s', 'now'), 'drift', 'warning', 'Config changed');

# Server should change to warning status
```

---

## Database Integration

### Schema Requirements

The health calculator requires these database tables/columns:

**servers table:**
```sql
health_status TEXT DEFAULT 'unknown'  -- Status column
last_seen INTEGER NOT NULL             -- For offline detection
```

**metrics table:**
```sql
cpu_percent REAL
mem_total_mb INTEGER
mem_used_mb INTEGER
disk_total_gb INTEGER
disk_used_gb INTEGER
timestamp INTEGER NOT NULL
```

**events table (for drift detection):**
```sql
event_type TEXT NOT NULL
timestamp INTEGER NOT NULL
```

### Query Performance

- **Latest metric lookup:** O(1) with `ORDER BY timestamp DESC LIMIT 1`
- **Drift detection:** O(log n) with indexed events table
- **Health update:** O(1) single row UPDATE

---

## Configuration & Tuning

### Modify Thresholds

Edit `calculator.go` constants:
```go
const (
    CPUWarningThreshold   = 80.0   // Change for different thresholds
    CPUCriticalThreshold  = 95.0
    MemWarningThreshold   = 80.0
    MemCriticalThreshold  = 95.0
    DiskWarningThreshold  = 80.0
    DiskCriticalThreshold = 95.0
)
```

### Adjust Offline Detection

Edit metric interval:
```go
const DefaultMetricIntervalSeconds = 10

// Offline threshold = 2x interval = 20 seconds
// To change to 30 seconds: change to 15
```

---

## Logging & Monitoring

### Health Status Changes

The calculator logs:
```
✓ Health update: server-id → critical
✓ Health update: server-id → warning
✓ Health update: server-id → offline
✓ Health update: server-id → healthy
```

### Debug Output

To add detailed logging, modify `UpdateServerHealth()`:
```go
func UpdateServerHealth(serverID string) error {
    status, err := CalculateHealth(serverID)
    if err != nil {
        return err
    }
    
    log.Printf("DEBUG: Server %s health = %s", serverID, status)
    
    _, err = database.DB.Exec(
        "UPDATE servers SET health_status = ? WHERE id = ?",
        status, serverID,
    )
    
    return err
}
```

---

## Troubleshooting

### Status Always "Unknown"
- **Cause:** No metrics received yet
- **Fix:** Ensure agents are running and sending metrics

### Status Not Updating
- **Cause:** `health.UpdateServerHealth()` not called in handler
- **Fix:** Verify integration in `handlers/agent.go`

### Offline Too Sensitive
- **Cause:** Metric interval set too low or stale timeout too short
- **Fix:** Increase `DefaultMetricIntervalSeconds` or adjust offline threshold

### Thresholds Not Taking Effect
- **Cause:** Constants changed but binary not recompiled
- **Fix:** Run `go build` after changes

---

## Future Enhancements

1. **Customizable Thresholds** - Per-server threshold configuration
2. **Weighted Health** - Different weights for different metrics
3. **Historical Trending** - Health calculated from trend, not just current
4. **Predictive Alerts** - Alert before reaching critical
5. **Health History** - Track status changes over time
6. **Custom Rules** - Expression-based health evaluation

---

## Summary

| Feature | Status | Impact |
|---------|--------|--------|
| Metric-based health | ✅ Complete | HIGH |
| Offline detection | ✅ Complete | HIGH |
| Drift-triggered warnings | ✅ Complete | MEDIUM |
| Database persistence | ✅ Complete | HIGH |
| Real-time updates | ✅ Complete | HIGH |
| Frontend display | ✅ Complete | HIGH |

---

**Last Updated:** December 7, 2025  
**Maintained By:** Development Team
