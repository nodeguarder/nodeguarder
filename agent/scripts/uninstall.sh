#!/bin/bash
set -e

echo "Uninstalling NodeGuarder Agent..."

if systemctl is-active --quiet nodeguarder-agent; then
    echo "Stopping service..."
    systemctl stop nodeguarder-agent
fi

if systemctl is-enabled --quiet nodeguarder-agent; then
    echo "Disabling service..."
    systemctl disable nodeguarder-agent
fi

if [ -f /etc/systemd/system/nodeguarder-agent.service ]; then
    echo "Removing service file..."
    rm /etc/systemd/system/nodeguarder-agent.service
    systemctl daemon-reload
fi

if [ -d /opt/nodeguarder-agent ]; then
    echo "Removing agent files..."
    rm -rf /opt/nodeguarder-agent
fi

echo "Uninstallation complete."
# Self-delete this script if it resides in the install directory (though we just deleted the dir, so this implies it was copied elsewhere or failed)
# If running from /opt/nodeguarder-agent/uninstall.sh, the file is already gone (deleted by rm -rf /opt/nodeguarder-agent above).
