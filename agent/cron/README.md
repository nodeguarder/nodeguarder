# Cron Job Monitoring

The NodeGuarder agent monitors cron job execution and detects failures automatically. This guide explains how it works and how to use it.

## Features

- **Automatic failure detection**: Monitors system logs for failed cron jobs
- **Exit code tracking**: Records the exit code of each cron job
- **Error messages**: Captures error details from cron logs
- **Multiple log sources**: Tries `journalctl` first, falls back to `/var/log/syslog`
- **Event generation**: Sends cron failure events to the dashboard

## How It Works

### Log Parsing

The cron monitor reads system logs to find cron job executions:

1. **journalctl** (systemd systems):
   ```bash
   journalctl --unit=cron.service --since=<timestamp>
   ```

2. **Syslog** (traditional systems):
   ```
   /var/log/syslog or /var/log/messages
   ```

### Failure Detection

The monitor looks for patterns indicating failed cron jobs:

```
CRON[12345]: (root) CMD (/usr/local/bin/backup.sh) (FAILED exit code 1)
CRON: (user) FAILED: (exit code 127)
```

### Event Flow

```
Agent (every interval)
    ↓
cronMonitor.Check()
    ↓
Read system logs since last check
    ↓
Parse CRON entries
    ↓
Extract failures
    ↓
Generate CronEvent
    ↓
Include in PushEvents() to dashboard
```

## Event Format

Failed cron jobs send events with this structure:

```json
{
  "type": "cron",
  "severity": "error",
  "message": "Cron job failed: /usr/local/bin/backup.sh (exit code: 1)",
  "timestamp": 1701234567,
  "details": "{\"exit_code\": 1, \"error\": \"...\"}"
}
```

## Tracking

The monitor maintains internal state:

- **lastCheckTime**: Unix timestamp of last check (to avoid reprocessing logs)
- **lastSeenJobs**: Map of `command → JobRecord` tracking:
  - Last execution time
  - Last exit code
  - Failure count
  - Last error message

## Configuration

The cron monitor runs automatically as part of the collection interval. No additional configuration is required.

### Log Retention Requirements

For cron monitoring to work effectively:

- **journalctl**: Default retention (usually sufficient)
- **syslog**: Default `/var/log/syslog` should be readable
  - Note: May require elevated permissions to read on some systems

## Limitations

- **Systemd cron units**: Only detects failures if logged to `cron.service` unit
- **Log rotation**: Entries older than log retention period are not monitored
- **Future cron jobs**: Cannot predict or alert on missing expected cron runs (MVP limitation)
- **Permissions**: Agent needs permission to read system logs

## Future Enhancements

1. **Missing job detection**: Alert when expected cron job hasn't run in X hours
2. **Custom monitored paths**: Allow agent config to specify which cron logs to watch
3. **Crontab parsing**: Directly parse crontab files to know expected jobs
4. **Job duration tracking**: Alert if cron job takes unusually long to execute

## Debugging

To test cron monitoring locally:

```bash
# View cron logs that the agent would see
journalctl --unit=cron.service -n 50

# Or
tail -f /var/log/syslog | grep CRON

# Force a cron failure for testing
(exit 1) # This would fail if in a cron job

# Check agent logs
sudo journalctl -u nodeguarder-agent -f
```

## API Integration

The cron monitor integrates with the dashboard through existing event endpoints:

- Events are batched with drift detection events
- Sent via `POST /api/v1/agent/events`
- Dashboard stores events in `events` table with `event_type='cron'`
- Frontend can display cron failures in event log or dedicated cron jobs view

## Example Dashboard Response

Query cron failures for a server:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://dashboard.local:8443/api/v1/servers/{id}/events?type=cron
```

Returns:

```json
[
  {
    "id": 1,
    "server_id": "uuid",
    "timestamp": 1701234567,
    "event_type": "cron",
    "severity": "error",
    "message": "Cron job failed: /usr/local/bin/backup.sh (exit code: 1)",
    "details": "{\"exit_code\": 1, \"error\": \"connection timeout\"}"
  }
]
```
