## v1.0.30

- **Fix:** Portal DB migration `VersionMismatch(9)` — reverted `009_request_metrics.sql` to original content (restored `was_cached` column); column drop moved to new `016_drop_was_cached.sql` to preserve checksum integrity for existing databases

## Installation

### Agent (Windows)
1. Download **NodeGuarder-Setup-{VERSION}.msi**
2. Run the installer
3. Point your AI apps to `http://127.0.0.1:51820/v1`

### Enterprise Portal (Linux / Windows / macOS)
1. Download **ng-portal-bundle-{VERSION}.zip**
2. Unzip the zip file
3. In the unzipped folder follow **INSTRUCTIONS.txt**
***

**Disclaimer:** This software is provided "AS IS" without warranty of any kind. See the [LICENSE](https://github.com/nodeguarder/nodeguarder/blob/main/LICENSE) file for details.
