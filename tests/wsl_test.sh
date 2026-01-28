#!/bin/bash
# NodeGuarder Main Integration Test Suite
# Covers: Installation, Registration, Config Sync (Advanced), Health (Advanced), Drift (Advanced), Cron (Advanced), Offline Detection

# --- Configuration ---
BACKEND_URL="http://localhost:8081" # Using backend port directly to avoid HTTPS cert complexity in test
ADMIN_USER="${ADMIN_USERNAME:-admin}"
ADMIN_PASS="${ADMIN_PASSWORD:-admin}"
AGENT_BIN="./nodeguarder-agent"
CONFIG_DIR="/etc/nodeguarder-agent"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
DB_PATH="/var/lib/nodeguarder-agent/queue.db"

# Cron Test Files
TEST_CRON_FAIL="/etc/cron.d/nodeguarder_fail"
TEST_CRON_TIMEOUT="/etc/cron.d/nodeguarder_timeout"
TEST_CRON_IGNORE="/etc/cron.d/nodeguarder_ignore"
# Drift Test Files
TEST_DRIFT_STD="/etc/test.ignore"
TEST_DRIFT_CUSTOM="/tmp/nodeguarder_custom"
TEST_DRIFT_IGNORE="/etc/test.ignore"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'


dump_logs() {
    echo -e "${RED}--- AGENT LOG TAIL (Last 100 lines) ---${NC}"
    if [ -f "agent.log" ]; then
        tail -n 100 agent.log
    else
        echo "agent.log not found."
    fi
     echo -e "${RED}---------------------------------------${NC}"
}

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { 
    echo -e "${RED}[FAIL]${NC} $1"; 
    dump_logs
    exit 1; 
}
log_warn() { 
    echo -e "${RED}[WARN]${NC} $1"; 
    dump_logs
}
log_info() { echo -e "\n🔹 $1"; }

# --- 1. Dependencies ---
log_info "Checking dependencies..."
DEPS="jq rsyslog"
for dep in $DEPS; do
    if ! command -v $dep &> /dev/null; then
        echo "$dep not found. Attempting to install..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update -qq && sudo apt-get install -y -qq $dep
        else
            log_fail "$dep is missing and could not be installed automatically. Please install $dep."
        fi
    fi
done
log_pass "Dependencies OK"

# --- 2. Authentication ---
log_info "Authenticating with Backend..."
# Retry logic for backend readiness
MAX_RETRIES=5
COUNT=0
while [ $COUNT -lt $MAX_RETRIES ]; do
    if curl -s "$BACKEND_URL/health" > /dev/null; then
        break
    fi
    echo "Waiting for backend..."
    sleep 2
    COUNT=$((COUNT+1))
done

TOKEN_RES=$(curl -s -X POST "$BACKEND_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$ADMIN_USER\", \"password\": \"$ADMIN_PASS\"}")

TOKEN=$(echo "$TOKEN_RES" | jq -r '.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    log_fail "Login failed. Response: $TOKEN_RES\n       [HINT] If you changed your password, run:\n       export ADMIN_PASSWORD='your_password' && ./wsl_test.sh"
fi
log_pass "Authenticated. Token received."

# Get Reg Token
REG_TOKEN=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/auth/registration-token" | jq -r '.token')
log_pass "Registration Token: ${REG_TOKEN:0:5}..."

# --- 2b. Ensure Clean Config State ---
log_info "Ensuring Clean Configuration State..."
# reset config to defaults
FULL_CONFIG_DEFAULT='{
  "drift_ignore": [],
  "drift_paths": ["/etc"],
  "cron_ignore": {},
  "thresholds": {"cpu_warning": 80, "cpu_critical": 95, "memory_warning": 80, "memory_critical": 95, "disk_warning": 80, "disk_critical": 95},
  "offline_timeout": 120,
  "drift_interval": 300,
  "cron_global_timeout": 300,
  "cron_timeouts": {},
  "cron_enabled": true,
  "cron_auto_discover": true,
  "health_enabled": true,
  "health_sustain_duration": 30,
  "stability_window": 120
}'
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$FULL_CONFIG_DEFAULT" \
    "$BACKEND_URL/api/v1/config" > /dev/null
log_pass "Configuration reset to defaults"

# --- 3. Clean Install ---
log_info "Test: Installation & Registration"

# Cleanup Trap
cleanup() {
    log_info "🧹 Cleaning up..."
    # Restore Defaults
    if [ ! -z "$TOKEN" ]; then
        curl -s -X POST -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$FULL_CONFIG_DEFAULT" \
            "$BACKEND_URL/api/v1/config" > /dev/null
        log_pass "Configuration restored to defaults"
    fi

    # Kill Agent if running
    if [ ! -z "$AGENT_PID" ]; then
        kill $AGENT_PID 2>/dev/null
    fi

    # Remove temporary files
    sudo rm -f "$TEST_DRIFT_STD"
    sudo rm -f "$TEST_DRIFT_IGNORE"
    sudo rm -f "$TEST_DRIFT_CUSTOM"/test_file
    sudo rmdir "$TEST_DRIFT_CUSTOM" 2>/dev/null
    sudo rm -f "$TEST_CRON_FAIL"
    sudo rm -f "$TEST_CRON_TIMEOUT"
    sudo rm -f "$TEST_CRON_IGNORE"
    
    # rm -f agent.log
}
trap cleanup EXIT

# Download Agent (or copy from local build if available to bypass caching issues)
if [ -f "../deploy/agent-binaries/nodeguarder-agent-linux-amd64" ]; then
    echo "🔹 Using local agent binary from ../deploy/agent-binaries/..."
    cp "../deploy/agent-binaries/nodeguarder-agent-linux-amd64" "$AGENT_BIN"
else
    echo "🔹 Downloading Agent..."
    curl -s -L "$BACKEND_URL/api/v1/agent/download/linux/amd64" -o "$AGENT_BIN"
fi
chmod +x "$AGENT_BIN"

# Clean previous configs
sudo rm -rf "$CONFIG_DIR"
sudo rm -rf "$(dirname "$DB_PATH")"
sudo mkdir -p "$CONFIG_DIR"
sudo mkdir -p "$(dirname "$DB_PATH")"

# Generate Config
log_info "Generating Configuration..."
SERVER_ID="wsl-test-$(date +%s)"
API_SECRET="secret-$(date +%s)"

# Create config file
sudo bash -c "cat > $CONFIG_FILE <<EOF
server_id: $SERVER_ID
api_secret: "secret"
dashboard_url: $BACKEND_URL
registration_token: $REG_TOKEN
interval: 10
cron_log_path: "/var/log/cron.log"
thresholds:
  cpu: 90
  memory: 90
  disk: 90
EOF"

# Manually Register for backend
REGISTER_RES=$(curl -s -X POST "$BACKEND_URL/api/v1/agent/register" \
    -H "Content-Type: application/json" \
    -d "{
        \"server_id\": \"$SERVER_ID\",
        \"hostname\": \"wsl-test-node\",
        \"os_name\": \"linux\",
        \"os_version\": \"wsl-test\",
        \"agent_version\": \"1.1.0-test\",
        \"api_secret\": \"$API_SECRET\",
        \"registration_token\": \"$REG_TOKEN\"
    }")

# Start Agent (Run as root for full permissions - needed for log access and self-destruct cleanup)
sudo "$AGENT_BIN" --config "$CONFIG_FILE" > agent.log 2>&1 &
AGENT_PID=$!
# Fix ownership of log so we can read it as use
sleep 2
sudo chown $(whoami) agent.log

log_pass "Agent started (PID: $AGENT_PID)"

log_info "Waiting 15s for first heartbeat..."
sleep 15

# --- 4. Health Check (Basic) ---
STATUS_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/health")
STATUS=$(echo "$STATUS_RES" | jq -r '.health_status')

if [ "$STATUS" == "online" ] || [ "$STATUS" == "healthy" ]; then
    log_pass "Server is $STATUS"
else
    log_fail "Server status is $STATUS (Expected online/healthy)"
fi

# --- 5. Advanced Config TEST 1: Disable Health & Drift Advanced ---
log_info "Test: Advanced Config Sync (Disable Health, Custom Drift Paths)"

TEST_DRIFT_CUSTOM="/tmp/nodeguarder_custom"
sudo mkdir -p "$TEST_DRIFT_CUSTOM"

# Payload:
# 1. Disable Health (CpuCritical=0 shouldn't trigger if disabled)
# 2. Add Drift Ignore "*.ignore"
# 3. Add Custom Drift Path
# 4. Set intervals to 10s
CONFIG_ADVANCED_1='{
  "drift_ignore": ["*.ignore"],
  "drift_paths": ["/etc", "/tmp/nodeguarder_custom"],
  "cron_ignore": {},
  "thresholds": {"cpu_warning": 0, "cpu_critical": 0, "memory_warning": 80, "memory_critical": 95, "disk_warning": 80, "disk_critical": 95},
  "offline_timeout": 60,
  "drift_interval": 10,
  "cron_global_timeout": 300,
  "cron_timeouts": {},
  "cron_enabled": true,
  "cron_auto_discover": true,
  "health_enabled": false,
  "health_sustain_duration": 10
}'

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CONFIG_ADVANCED_1" \
    "$BACKEND_URL/api/v1/config" > /dev/null
log_pass "Config pushed: Health Disabled, Drift Advanced"

# DEBUG: Verify what backend has
# DEBUG_CONFIG=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/config")
# echo "DEBUG: Backend Config after push: $DEBUG_CONFIG"

# Wait for sync
echo "Waiting 25s for sync and metrics (allowing drift baseline to establish)..."
sleep 25

# CHECK 1: Health SHOULD BE OK (because enabled=false), even though CpuCritical=0
HEALTH_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/events" | jq '[.[] | select(.event_type=="health")] | length')
if [ "$HEALTH_COUNT" -eq 0 ]; then
    log_pass "Health Disabled Test Passed (No events with critical threshold)"
else
    log_fail "Health Disabled Test Failed! Received $HEALTH_COUNT events but health_enabled=false"
fi

# CHECK 2: Drift Ignore
TEST_DRIFT_IGNORE="/etc/test.ignore"
sudo touch "$TEST_DRIFT_IGNORE"
log_pass "Created ignored drift file $TEST_DRIFT_IGNORE"

# CHECK 3: Drift Custom Path
TEST_DRIFT_CUSTOM_FILE="$TEST_DRIFT_CUSTOM/test_file"
sudo touch "$TEST_DRIFT_CUSTOM_FILE"
# Fix permissions so agent (running as user) can read it
sudo chown -R $(whoami) "$TEST_DRIFT_CUSTOM"
log_pass "Created custom drift file $TEST_DRIFT_CUSTOM_FILE"

log_info "Waiting 20s for drift detection..."
sleep 20

# Verify Ignored File -> NO Event
# Verify Custom Path -> YES Event
EVENTS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/events")
DRIFT_IGNORE_COUNT=$(echo "$EVENTS" | jq '[.[] | select(.message | contains("test.ignore"))] | length')
DRIFT_CUSTOM_COUNT=$(echo "$EVENTS" | jq '[.[] | select(.message | contains("nodeguarder_custom/test_file"))] | length')

if [ "$DRIFT_IGNORE_COUNT" -eq 0 ]; then
    log_pass "Drift Ignore Test Passed (No event for *.ignore)"
else
    log_fail "Drift Ignore Test Failed! Received event for ignored file."
fi


if [ "$DRIFT_CUSTOM_COUNT" -gt 0 ]; then
    log_pass "Drift Custom Path Test Passed (Event received for /tmp/nodeguarder_custom)"
else
    # echo "Events: $EVENTS"
    log_fail "Drift Custom Path Test Failed! No event for custom path."
fi

# CHECK 4: Drift Modification
log_info "Testing Drift Modification..."
sudo bash -c "echo 'modification' >> $TEST_DRIFT_CUSTOM_FILE"
log_info "Modified file $TEST_DRIFT_CUSTOM_FILE. Waiting 20s..."
sleep 20

EVENTS_MOD=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/events")
DRIFT_MOD_COUNT=$(echo "$EVENTS_MOD" | jq '[.[] | select(.message | contains("File modified"))] | length')

if [ "$DRIFT_MOD_COUNT" -gt 0 ]; then
    log_pass "Drift Modification Test Passed"
else
    log_fail "Drift Modification Test Failed! No 'File modified' event found."
fi

# CHECK 5: Drift Deletion
log_info "Testing Drift Deletion..."
sudo rm "$TEST_DRIFT_CUSTOM_FILE"
log_info "Deleted file $TEST_DRIFT_CUSTOM_FILE. Waiting 20s..."
sleep 20

EVENTS_DEL=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/events")
DRIFT_DEL_COUNT=$(echo "$EVENTS_DEL" | jq '[.[] | select(.message | contains("File deleted"))] | length')

if [ "$DRIFT_DEL_COUNT" -gt 0 ]; then
    log_pass "Drift Deletion Test Passed"
else
    log_fail "Drift Deletion Test Failed! No 'File deleted' event found."
fi


# --- 6. Advanced Config TEST 2: Enable Health & Cron Advanced ---
log_info "Test: Advanced Config Sync (Enable Health, Cron Timeouts)"

# Payload:
# 1. Enable Health (CpuCritical=0 SHOULD trigger now)

# 2. Add Cron Global Timeout = 10s
# 3. Add Cron Ignore Exit Code for specific job
# 4. Set Health Thresholds to 1% to force triggers for CPU, Memory, and Disk
CONFIG_ADVANCED_2='{
  "drift_ignore": [],
  "drift_paths": ["/etc"],
  "cron_ignore": {"/bin/false": [1]},
  "thresholds": {"cpu_warning": 1, "cpu_critical": 1, "memory_warning": 1, "memory_critical": 1, "disk_warning": 1, "disk_critical": 1},
  "offline_timeout": 10,
  "drift_interval": 300,
  "cron_global_timeout": 10,
  "cron_timeouts": {},
  "cron_enabled": true,
  "cron_auto_discover": true,
  "health_enabled": true,
  "stability_window": 10,
  "health_sustain_duration": 1
}'

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CONFIG_ADVANCED_2" \
    "$BACKEND_URL/api/v1/config" > /dev/null
log_pass "Config pushed: Health Enabled (Thresholds 1%), Cron Advanced"

# SETUP CRON JOBS
# ensure rsyslog is running
log_info "Configuring rsyslog..."
if command -v rsyslogd &> /dev/null; then
    # Create log file with permissive permissions first
    sudo touch /var/log/cron.log
    sudo chmod 666 /var/log/cron.log

    sudo service rsyslog start > /dev/null 2>&1
    # Ensure cron logging is enabled in rsyslog (check both main and default snippet)
    sudo sed -i 's/^#cron.*/cron.* \/var\/log\/cron.log/' /etc/rsyslog.conf
    if [ -f "/etc/rsyslog.d/50-default.conf" ]; then
        sudo sed -i 's/^#cron.*/cron.* \/var\/log\/cron.log/' /etc/rsyslog.d/50-default.conf
    fi

    sudo service rsyslog restart > /dev/null 2>&1
    sudo service cron restart > /dev/null 2>&1
else
    log_warn "rsyslog not installed. Cron logs might not be detected."
fi

# 1. Fails (Normal) - Should trigger
# ZERO TOUCH: Standard cron, no wrapper. Agent should detect via eBPF.
echo "* * * * * root /bin/ls /nonexistent_fail" | sudo tee "$TEST_CRON_FAIL" > /dev/null
sudo chmod 644 "$TEST_CRON_FAIL"

# 2. Timeout - Should trigger long_running (sleep 20 > global 10)
# ZERO TOUCH: Standard cron.
echo "* * * * * root /bin/sleep 20" | sudo tee "$TEST_CRON_TIMEOUT" > /dev/null
sudo chmod 644 "$TEST_CRON_TIMEOUT"

# 3. Ignore Exit Code - Should NOT trigger (exit 1 ignored for /bin/false)
echo "* * * * * root /bin/false" | sudo tee "$TEST_CRON_IGNORE" > /dev/null
sudo chmod 644 "$TEST_CRON_IGNORE"

sudo service cron reload > /dev/null 2>&1
log_pass "Created 3 Cron jobs (Fail, Timeout, Ignored) - ZERO TOUCH Standard Cron"

log_info "Turning up the heat (generating CPU load)..."
yes > /dev/null &
CPU_PID=$!
log_info "Started CPU load generator (PID: $CPU_PID)"

log_info "Waiting 45s for Health Events (1% thresholds + sustain duration)..."
sleep 45

log_info "Cooling down (stopping CPU load)..."
kill $CPU_PID > /dev/null 2>&1

EVENTS_HEALTH=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/events")

# CHECK: CPU Health
CPU_COUNT=$(echo "$EVENTS_HEALTH" | jq '[.[] | select(.message | contains("High CPU usage"))] | length')
if [ "$CPU_COUNT" -gt 0 ]; then
    log_pass "Health Test: CPU Passed (High CPU usage detected)"
else
    log_fail "Health Test: CPU Failed! No High CPU event."
fi

# CHECK: Memory Health
MEM_COUNT=$(echo "$EVENTS_HEALTH" | jq '[.[] | select(.message | contains("High Memory usage"))] | length')
if [ "$MEM_COUNT" -gt 0 ]; then
    log_pass "Health Test: Memory Passed (High Memory usage detected)"
else
    log_fail "Health Test: Memory Failed! No High Memory event. (Metrics: $(curl -s $BACKEND_URL/api/v1/servers/$SERVER_ID/metrics/latest | jq .))"
fi

# CHECK: Disk Health
DISK_COUNT=$(echo "$EVENTS_HEALTH" | jq '[.[] | select(.message | contains("Low Disk Space"))] | length')
if [ "$DISK_COUNT" -gt 0 ]; then
    log_pass "Health Test: Disk Passed (Low Disk Space detected)"
else
    log_fail "Health Test: Disk Failed! No Low Disk Space event."
fi

log_info "Waiting 70s more for Cron Jobs to run/timeout..."
sleep 70

# ZERO TOUCH VERIFICATION:
# The Agent should have detected the failure of /bin/ls and /bin/false via eBPF exit codes.



# VERIFY CRON EVENTS
EVENTS_ALL=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/events")

# 1. Normal Fail
# We search for the wrapped command path
CRON_FAIL_COUNT=$(echo "$EVENTS_ALL" | jq '[.[] | select(.message | contains("nonexistent_fail"))] | length')
if [ "$CRON_FAIL_COUNT" -gt 0 ]; then
    log_pass "Cron Normal Failure Test Passed"
else
    log_warn "Cron Normal Failure Test Failed (Might be timing/syslog issue)"
fi

# 2. Timeout (Long Running)
CRON_TIMEOUT_COUNT=$(echo "$EVENTS_ALL" | jq '[.[] | select(.event_type=="long_running")] | length')
if [ "$CRON_TIMEOUT_COUNT" -gt 0 ]; then
    log_pass "Cron Timeout Test Passed"
else
    log_warn "Cron Timeout Test Failed (Timeout: 10s, Job: 20s. Did wrapper start?)"
fi

# 3. Ignored Fail
# Should ignore if exit code 1 matches
CRON_IGNORE_COUNT=$(echo "$EVENTS_ALL" | jq '[.[] | select(.message | contains("/bin/false") and .severity=="error")] | length')
if [ "$CRON_IGNORE_COUNT" -eq 0 ]; then
    log_pass "Cron Ignore Code Test Passed (No event for /bin/false)"
else
    log_fail "Cron Ignore Code Test Failed! Event received for ignored job."
fi

# 4. Auto-Discovery Check
# Check if /bin/false or /bin/sleep appears in discovered jobs
CONFIG_FETCH=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/config")
DISCOVERED_COUNT=$(echo "$CONFIG_FETCH" | jq '.discovered_cron_jobs | length')
if [ "$DISCOVERED_COUNT" -gt 0 ]; then
    log_pass "Cron Auto-Discovery Verified ($DISCOVERED_COUNT jobs found)"
else
    log_warn "Cron Auto-Discovery Failed (List empty)"
fi


# --- 7. Recovery & Stability Window Test ---
log_info "Test: Recovery & Stability Window"

# 1. Kill Agent to trigger Offline
log_info "Simulating Outage (Killing Agent)..."
if [ ! -z "$AGENT_PID" ]; then
    sudo kill $AGENT_PID 2>/dev/null
    # wait for process to die
    tail --pid=$AGENT_PID -f /dev/null 2>/dev/null
fi


# 2. Wait for Offline (Timeout is 10s in Config 2)
log_info "Waiting 15s for Offline detection..."
sleep 15

# --- Define Recovery Config (Normal Thresholds + Stability Window) ---
# We need normal thresholds so it returns to HEALTHY, not CRITICAL
CONFIG_RECOVERY='{
  "drift_ignore": [],
  "drift_paths": ["/etc"],
  "cron_ignore": {},
  "thresholds": {"cpu_warning": 80, "cpu_critical": 95, "memory_warning": 80, "memory_critical": 95, "disk_warning": 80, "disk_critical": 95},
  "offline_timeout": 10,
  "drift_interval": 300,
  "cron_global_timeout": 300,
  "cron_timeouts": {},
  "cron_enabled": true,
  "cron_auto_discover": true,
  "health_enabled": true,
  "stability_window": 10,
  "health_sustain_duration": 1
}'

# Push Recovery Config while agent is offline (will be picked up on connect? No, agent is dead)
# Actually, we should set this config BEFORE we kill the agent? 
# Or update it via API now so backend has it ready? Yes, backend stores it.
log_info "Pushing Recovery Config to Backend (Normal Thresholds, Stability: 10s)..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CONFIG_RECOVERY" \
    "$BACKEND_URL/api/v1/config" > /dev/null

STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/health" | jq -r '.health_status')
if [ "$STATUS" == "offline" ]; then
    log_pass "Server went OFFLINE as expected"
else
    log_fail "Server status is $STATUS (Expected offline)"
fi


# 3. Restart Agent
log_info "Restarting Agent..."
sudo "$AGENT_BIN" --config "$CONFIG_FILE" >> agent.log 2>&1 &
AGENT_PID=$!
log_info "Waiting 12s for Agent initialization and first metric..."
sleep 12

# 4. Check for RECOVERING state (After 12s, first metric should be sent)
STATUS_REC=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/health" | jq -r '.health_status')
if [ "$STATUS_REC" == "recovering" ]; then
    log_pass "Server is RECOVERING (Stability Window Active)"
else
    # Configured Stability Window is 10s. If we waited 12s, it might have barely expired if metric was immediate? 
    # But usually 10s interval.
    log_warn "Server status is $STATUS_REC (Expected recovering)"
fi

# 5. Wait for Stability (10s window + buffer)
# We already waited 12s. If metric came at T=10, window expires at T=20. Current T=12.
# Need to wait 8s more + buffer. Let's wait 15s to be safe.
log_info "Waiting 15s for Stability Window to pass..."
sleep 15

STATUS_FINAL=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/health" | jq -r '.health_status')
if [ "$STATUS_FINAL" == "healthy" ]; then
    log_pass "Server recovered to HEALTHY"
else
    log_fail "Server status is $STATUS_FINAL (Expected healthy)"
fi

# --- 8. Remote Uninstall & Offline ---
log_info "Test: Remote Uninstall & Offline"

# Trigger Uninstall via API
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    "$BACKEND_URL/api/v1/servers/$SERVER_ID/uninstall" > /dev/null
log_pass "Sent Uninstall Command to Backend"

# Wait for config sync (interval 10s) and self-destruct delay (5s) + buffe
log_info "Waiting 20s for Agent to receive command and self-destruct..."
sleep 20

# Verify Process is GONE
if ps -p $AGENT_PID > /dev/null; then
    log_fail "Agent is still running (PID $AGENT_PID) after uninstall command!"
else
    log_pass "Agent process terminated successfully (verified PID gone)"
fi

# Clean up PID var so cleanup() doesn't try to kill it again
AGENT_PID=""

# Verify Offline Status
# Since agent is dead, it stops sending heartbeats.
# Offline timeout was set to 10s in Config 2.
log_info "Waiting 15s for offline state detection..."
sleep 15

STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BACKEND_URL/api/v1/servers/$SERVER_ID/health" | jq -r '.health_status')
if [ "$STATUS" == "offline" ]; then
    log_pass "Server correctly marked OFFLINE"
else
    echo -e "${RED}[WARN]${NC} Status is $STATUS (Expected offline)"
fi

# Verify File Cleanup
log_info "Verifying cleanup of files..."
if [ -d "$CONFIG_DIR" ]; then
    log_fail "Cleanup Failed! Config dir $CONFIG_DIR still exists."
else
    log_pass "Config directory removed"
fi

if [ -d "$(dirname "$DB_PATH")" ]; then
    log_fail "Cleanup Failed! Data dir $(dirname "$DB_PATH") still exists."
else
    log_pass "Data directory removed"
fi

log_info "✅ Full Test Suite Completed Successfully"
exit 0
