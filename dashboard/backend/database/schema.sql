-- Create servers table
CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    os_name TEXT,
    os_version TEXT,
    agent_version TEXT,
    api_secret_hash TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    health_status TEXT DEFAULT 'unknown',
    drift_checksum TEXT,
    drift_changed INTEGER DEFAULT 0,
    seen_cron_jobs TEXT,
    log_request_pending BOOLEAN DEFAULT 0,
    log_file_path TEXT,
    log_file_time INTEGER,
    pending_uninstall BOOLEAN DEFAULT 0
);

-- Create metrics table
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cpu_percent REAL,
    mem_total_mb INTEGER,
    mem_used_mb INTEGER,
    disk_total_gb INTEGER,
    disk_used_gb INTEGER,
    load_avg_1 REAL,
    load_avg_5 REAL,
    load_avg_15 REAL,
    process_count INTEGER,
    processes TEXT,
    uptime INTEGER,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_server_time ON metrics(server_id, timestamp DESC);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT DEFAULT 'info',
    message TEXT NOT NULL,
    details TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_server_time ON events(server_id, timestamp DESC);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    password_changed BOOLEAN DEFAULT 0
);

-- Default admin user is now managed by the application at startup via ADMIN_PASSWORD env var

-- Create settings table for global configuration
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- CONFIG: Alert Settings (Single Row, ID=1)
CREATE TABLE IF NOT EXISTS alert_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure singleton
    slack_webhook_url TEXT,
    teams_webhook_url TEXT,
    discord_webhook_url TEXT,
    email_recipients TEXT,
    smtp_server TEXT,
    smtp_port INTEGER,
    smtp_user TEXT,
    smtp_password TEXT,
    alerts_enabled BOOLEAN DEFAULT 0,
    notify_on_warning BOOLEAN DEFAULT 0
);

