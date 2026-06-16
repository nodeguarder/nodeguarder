## v1.0.28

- **Fix:** CI — pin `windows-2022` runner image (avoids `windows-latest` June 2026 redirect to untested `windows-2025-vs2026`)
- **Fix:** CI — pin `Swatinem/rust-cache@v2.7.8` (resolves cache restore failure on new Windows runner images)
- **Removed:** Response cache system — only applied to non-streaming requests (0% hit rate in practice); removed `cache.rs`, `was_cached` field from metrics, gRPC, DB schema, frontend Usage page
- **Fix:** Agent detail page now shows usage metrics — was returning 0 rows due to UUID `String` bound to native `UUID` column; parsed with `Uuid::parse_str` before binding
- **Fix:** Dashboard action counts always 0 — `action_taken` values `'REDACTED'`/`'ALLOWED'`/`'BLOCKED'` (past tense) didn't match actual `'REDACT'`/`'ALLOW'`/`'BLOCK'` values; also included `AUTO_REDACT`/`AUTO_BLOCK`
- **Fix:** Dashboard total_agents included revoked agents — added `WHERE status != 'revoked'`
- **Fix:** Compliance reports excluded `AUTO_BLOCK`/`AUTO_REDACT` events — added to SQL `IN` clauses
- **Fix:** Compliance date boundary used `<` instead of `<=` — today's records were always excluded
- **Fix:** Compliance Risk Management showed "In Progress" with 0 detections — now "Not Started" (score 0.0)
- **Fix:** Compliance Human Oversight logic inverted — measured `allowed > 0` (penalized blocking); now measures any action taken
- **Fix:** Compliance Transparency penalized blocking — now includes all actions in ratio
- **Fix:** Compliance evidence text improved — more descriptive language (e.g., "3 threats blocked" instead of "3 blocked")
- **Fix:** Token estimate now uses message content length instead of full `body.len()` — strips JSON structural overhead for more accurate counts
- **UI:** Agent window resized 900×650 → 1100×700
- **UI:** Portal compliance page — added tooltip icons on all metrics and controls; added info banner explaining page purpose
- **UI:** Portal Get Started — replaced stale `docs/ide-setup-guide.md` link with "View LLM Landscape" button
- **UI:** Portal agent detail — removed Organization UUID field (useless noise); renamed "Revoke" to "Revoke & Delete" (also deletes agent_request_metrics before deleting agent row); improved empty usage message
- **UI:** Policy editor — upstream routes section expanded by default; OCR checkbox moved to Detection Categories with description; bind port input removed

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
