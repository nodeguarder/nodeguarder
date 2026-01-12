# Uninstalling NodeGuarder Agent

To manually uninstall the NodeGuarder Agent, follow these steps:

1.  **Stop the Service**
    ```bash
    sudo systemctl stop nodeguarder-agent
    ```

2.  **Disable the Service**
    ```bash
    sudo systemctl disable nodeguarder-agent
    ```

3.  **Remove the Service File**
    ```bash
    sudo rm /etc/systemd/system/nodeguarder-agent.service
    ```

4.  **Reload Systemd Daemon**
    ```bash
    sudo systemctl daemon-reload
    ```

5.  **Remove Agent Files**
    ```bash
    sudo rm -rf /opt/nodeguarder-agent
    ```

The agent is now completely removed from your system.
