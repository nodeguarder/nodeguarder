# NodeGuarder Features

This document outlines the core features of the NodeGuarder Agent and Dashboard, detailing how data is collected, transmitted, and represented.

## 1. Core Architecture

The system consists of a lightweight Go-based **Agent** installed on Linux nodes and a centralized **Dashboard** (Backend + Frontend).

*   **Communication**: The Agent pushes data to the Backend over HTTP(S) via REST API.
*   **Security**: Each agent is authenticated using a unique `Server ID` + `API Secret` (HMAC/Bcrypt verified).
*   **Heartbeat**: The Agent sends a metric payload every **60 seconds** (default). The backend uses this to determine "Online" status.

## 2. Server Health Monitoring

The system monitors key resource metrics to ensure node stability.

### Metrics Collected
*   **CPU Usage**: Percentage utilization.
*   **Memory Usage**: Total/Used MB and percentage.
*   **Disk Usage**: Total/Used GB and percentage.
*   **Load Average**: 1, 5, and 15-minute load averages.
*   **Uptime**: System uptime in seconds.
*   **Top Processes**: Top 5 processes by CPU usage, including PID, user, and memory usage.

### Health Calculation
Health status is calculated dynamically by the backend:

*   **Healthy**: All metrics below warning thresholds.
*   **Warning**: 
    *   Exceeds configured Warning Threshold (default: 80% for CPU/RAM/Disk).
    *   *AND* Sustained for the configured **Sustain Duration** (default: 30s) to rule out transient spikes.
    *   *OR* Recent Drift Detected
*   **Critical**: 
    *   Exceeds configured Critical Threshold (default: 95% for CPU/RAM/Disk).
*   **Offline**: 
    *   No heartbeat received for the configured **Offline Timeout** (default: 120 seconds).
    *   A background "Watchdog" process checks this every 60s and updates the status automatically.

### UI Representation
*   **Node Health**: Displays "Healthy", "Warning", "Critical", or "Offline" with color codes (Green/Yellow/Red/Gray).
*   **Graphs**: Historical trends for CPU, RAM, and Load are plotted on the server detail page.

### Offline Resilience
*   **Metric Queueing**: If the agent loses connectivity to the dashboard (e.g., network partition), it queues metrics and events locally in memory/disk-backed queue (using SQLite).
*   **Automatic Replay**: Upon reconnection, queued data is flushed to the dashboard, ensuring no data loss during transient outages.

## 3. Centralized Configuration

All agents can be managed centrally from the dashboard, eliminating the need to manually update local configuration files.

### Features
*   **Dynamic Updates**: Agents periodically fetch configuration updates (default: every 5 minutes).
*   **Global Settings**:
    *   **Health Thresholds**: Adjustable Warning/Critical percentages for CPU, Memory, and Disk.
    *   **Health Toggle**: Ability to globally enable/disable health monitoring.
    *   **Sustain Duration**: Configurable time window (seconds) that high resource usage must persist before triggering an alert.
    *   **Offline Timeout**: Configurable time before a server is marked offline.
    *   **Cron Timeouts**: Set a global default timeout or specific per-job overrides to detect hung processes.
    *   **Drift Ignore**: List of file glob patterns to ignore.
        *   Matches against **filename** (e.g., `*.tmp` ignores all .tmp files in any subdirectory).
        *   Matches against **relative path** (e.g., `kubernetes/*` ignores files in that directory).
    *   **Cron Ignore**: Map of cron commands to exit codes that should be ignored (preventing false positive alerts).

## 4. Cron Job Monitoring

The agent uses **eBPF (Extended Berkeley Packet Filter)** to perform "Zero Touch" monitoring of cron jobs. It hooks directly into the kernel to detect job execution and exit codes without requiring any modification to the crontabs or wrapper scripts.

### How it Works
1.  **Zero Touch Detection**: 
    *   The agent uses eBPF CO-RE (Compile Once - Run Everywhere) to safely hook into the kernel.
    *   **Requirement**: Linux Kernel **5.8+** is recommended for full Zero Touch support.
    *   It detects `sched_process_exit` events to capture the **exact exit code** of every command execution directly.
2.  **Log-Based Fallback**: On older kernels (pre-5.8) or if eBPF loading fails, the agent seamlessly falls back to legacy log parsing (`journalctl` / `syslog`) to detect start/finish events (though exit codes may be less precise without the wrapper).
3.  **Long-Running Job Detection**: 
    *   Tracks the duration of active cron jobs (using PID tracking).
    *   Alerts if a job exceeds the **Default Timeout** or a specific **Timeout Override**.
4.  **Failure Detection**: If a job sends an exit code != 0, it is flagged (unless configured to be ignored).

### Configuration & Discovery
*   **Web-Based Configuration**: Fully managed via the Dashboard > Configuration page.
*   **Auto-Discovery Toggle**:
    *   **Enabled (Default)**: Automatically tracks any new cron job found in logs.
    *   **Disabled (Allowlist Mode)**: Only monitors jobs explicitly defined in "Configured Jobs". Useful for reducing noise.
*   **Discovered Jobs**: The dashboard lists "seen" jobs for easy promotion to Configured Jobs.
*   **Manual Job Entry**: Ability to manually add monitors for crucial jobs that haven't run yet.
*   **Timeouts & Alerts**:
    *   **Global Max Runtime**: A switchable global safety net (e.g., alert on any job running > 300s). Can be disabled (set to 0).
    *   **Specific Overrides (Alert After)**: Precise timeout thresholds defined in **minutes** for specific scripts (e.g., `backup.sh` = 5 mins).
*   **Ignore Exit Codes**: Define specific exit codes (e.g., `1`, `42`) to ignore per-job, preventing false positive alerts for known non-critical failures.

### Server Representation
*   **Events**:
    *   **Cron Failure**: A job exited with a non-zero code (e.g., `Process exited with code 1`).
    *   **Cron Timeout**: A job ran longer than its configured limit (flagged as `long_running`).
    *   **Icons & Colors**: Distinct icons (Rose Alert for Error, Amber Clock for Timeout) help distinguish issues at a glance.
*   **Alerts**: 
    *   Displayed in the **Cron Monitor** page (specifically filtered to show only cron issues).
    *   Excluded from the **Health** page to prevent feed clutter.

## 5. Drift Detection

The agent monitors the `/etc` directory for configuration changes (Configuration Drift).

### How it Works
1.  **Checksumming**: The agent computes a Merkle-tree-like hash of the `/etc` directory contents, excluding files matching the **Drift Ignore** patterns.
2.  **Comparison**: It compares the current hash against the baseline established at startup.
3.  **Reporting**: If the hash changes, a `drift` event containing the new checksum is sent to the backend.

### Server Representation
*   **Status**: Use of the `drift_changed` flag on the server model.
*   **UI**: 
    *   "Drift Detected" warning appears on the server card.
    *   Server health status may downgrade to "Warning" until the drift is acknowledged (or resolved).

## 6. Licensing

The usage is capped by a tiered licensing system enforced by the backend.

*   **Community**: Up to 5 Servers.
*   **Standard**: Up to 20 Servers.
*   **Professional**: Up to 50 Servers.
*   **Enterprise**: Unlimited.

The license file (`license.yaml`) is digitally signed (Ed25519) to prevent tampering.

## 7. Alerting & Notifications

The system provides multi-channel alerting to notify administrators of critical events immediately.

### Channels
*   **Email**: SMTP-based email notifications (Supports STARTTLS on port 587/25).
*   **Slack**: Webhook-based integration (Rich messaging).
*   **Microsoft Teams**: Webhook integration (Adaptive Cards).
*   **Discord**: Webhook integration (Rich Embeds).

### Triggers
*   **Critical Health**: Exceeds Critical Thresholds.
*   **Offline Status**: Server stops reporting.
*   **Cron Job Failures**: Any reported cron job error (ignoring configured exceptions).
*   **Drift Detection**: Configuration changes (optional: can be configured to notify on warnings).

### Configuration
*   Managed via the **Notifications** page.
*   **Test Alerts**: Verify connectivity with a single click.
*   **Multi-Channel**: Configure any combination of channels simultaneously.

## 8. Remote Management

### Agent Log Collection
Administrators can remotely request internal logs from any connected agent for debugging purposes.
*   **On-Demand**: Triggered via the Server Detail page.
*   **Secure**: Logs are zipped and transferred securely to the dashboard.
*   **Timeout Handling**: Automatically handles unresponsive agents.

### Remote Uninstall (Self-Destruct)
Agents can be remotely uninstalled from the dashboard "Danger Zone".
*   **Mechanism**: The backend sends a self-destruct command.
*   **Cleanup**: The agent stops its service, removes its binary, deletes configuration files, and removes the systemd unit.

### Event Management
*   **Deletion**: Individual events (e.g., false positives or resolved alerts) can be deleted from the history view to keep logs clean.

## 9. Smart Installation

The installation script (`curl | bash`) is context-aware:
*   **Development Detection**: Automatically detects if running against `localhost` or private IPs.
*   **Auto-Insecure**: Appends `-k` (curl) and configures `disable_ssl_verify` automatically in dev environments, removing manual friction.
*   **Production Secure**: Enforces strict SSL verification in production environments.
