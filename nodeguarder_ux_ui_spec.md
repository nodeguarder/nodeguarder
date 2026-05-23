# NodeGuarder Local: UX/UI Design Specification
**Version:** 2.0
**Status:** Design Reference for Current Agent UI
**Note:** The current agent UI tabs differ from this spec (implemented tabs: Connectivity, Protection, Security Activity, Enterprise Management, Advanced). This document serves as the canonical design reference for future iterations.

**Enterprise Portal UI:** The React admin portal (at `enterprise-portal/frontend/`) implements the Section 2 Admin Portal UI spec with pages for Dashboard, Agents, Policies, Audit Logs, Users, and Enrollment Codes. See `nodeguarder_enterprise_portal.md` for portal architecture.

---

## 1. Agent Tray UI (Desktop Application)

### 1.A. System Tray Icon
- **Icon Design:** Lock + shield icon (green = local mode, blue = enterprise enrolled, red = error/revoked).
- **Tooltip:** Hovering shows: "NodeGuarder Local v1.0.0 | http://localhost:51820 | Local Mode" or "Enterprise Enrolled | Last sync: 5 min ago".
- **Right-Click Context Menu:**
  - ✓ Copy API URL (copies `http://localhost:8080` to clipboard)
  - ✓ Copy Bearer Token (copies `user-generated-token-xxxxx` to clipboard)
  - ✓ How to Configure IDE (opens Settings panel to Connectivity tab with flow diagram)
  - ✓ Settings (opens settings panel)
  - ✓ View Logs (opens local audit log viewer)
  - ✓ Exit NodeGuarder (graceful shutdown, saves state)

---

### 1.B. Settings Panel (Popup Window)
- **Window Size:** 500px × 600px, always-on-top, centered on screen.
- **Sections:**

#### Tab 1: Status
- **Display:**
  - `Mode: [Local Mode] [Switch to Enterprise] [Enterprise Enrolled]` (radio buttons).
  - `Port: 8080 (auto-discovered)` (read-only).
  - `API Endpoint: http://localhost:8080/v1` (copy button).
  - `Bearer Token: ••••••••••••••••` (masked, copy button).
  - `Agent UUID: a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6` (read-only).
- **Health Status:**
  - `Model Status: ✓ DeBERTa-v3 loaded (GPU)` or `⚠ CPU-only mode`.
  - `Hardware: NVIDIA RTX 2070 (DirectML) ACTIVE` or `CPU ACTIVE` (dynamic, updated every 800ms).
  - `Admin Platform Connection: ✓ Connected (sync: 2 min ago)` or `✗ Disconnected (24h offline, local-only)`.

#### Tab 2: Enterprise Enrollment
- **If Local Mode:**
  - Button: "Enroll with Admin Platform"
  - Input field: "Enrollment Code (ENV-XXXX-YYYY-ZZZZ)"
  - Button: "Validate & Enroll"
  - Status message: (empty initially)
  - **On Success:** "✓ Enrolled! Policy last synced: {timestamp}. Logs pushed every 5 min."
  - **On Failure:** "✗ Invalid code or Admin Platform unreachable. Try again."
- **If Enrolled:**
  - Display: `Admin: {admin_name} | Org: {org_name}`
  - Display: `Policy: Enforce Redaction (No Allow button)`
  - Display: `Last Policy Sync: 2 hours ago`
  - Button: "Disconnect (Unenroll)" (red, confirmation required: "Logs will revert to local storage.")

#### Tab 3: Detection & Rules
- **Slider:** `Detection Sensitivity: [Low] [Medium] [High]` (default: High).
- **Checkbox:** `☑ Enable Semantic Check (Gemma 4)` (enabled by default).
- **Local Allowlist:**
  - Display existing rules: e.g., `[DELETE] Allow: example_* (regex)`
  - Input: "Add allowlist pattern (regex)"
  - Button: "Add Rule"
  - Note: "(Admin policies override local allowlists if 'Enforce Redaction' is active.)"

#### Tab 4: Advanced
- **Model Health Status** (moved from Connectivity tab):
  - `DeBERTa-v3 (Prompt Injection) — 184M parameters, ~704MB`
  - `Hardware: NVIDIA RTX 2070 (DirectML) ACTIVE` or `CPU ACTIVE`
  - `Model Status: Loaded / Downloading / Error`
- **Auto-Update ATR Threat Rules:** Toggle switch (on by default). Disables the weekly background update of 419 detection patterns from the ATR community registry.
- **System Diagnostics:**
  - Semantic Model: DeBERTa-v3 ONNX (status dot: green if loaded, gray otherwise)
  - Model Status: live text
  - Inference Engine: ONNX Runtime 1.24.2
  - Hardware: GPU/CPU live indicator
  - ATR Rules: "419 patterns loaded" with AUTO/MANUAL badge
- **Data & Maintenance:**
  - Button: "Export Local Audit Logs" (CSV, last 30 days)
  - Button: "Clear Cache & Restart" (for troubleshooting).

---

### 1.C. Detection/HITL Notification Modal
- **Timing:** Appears when secret flagged.
- **Window Size:** 600px × 250px, modal (blocks IDE interaction), auto-centered.
- **Design:**
  - **Header (Red Banner):** "⚠ Sensitive Data Detected in Your Prompt"
  - **Body:**
    - `Flagged Content Type: AWS API Key`
    - `Preview: AKIA[REDACTED]...` (first 10 chars + ellipsis, never show full secret).
    - `Severity: CRITICAL | Detection Method: Regex + Semantic Check`
  - **Action Buttons (Bottom):**
    - `[Redact]` (green, primary) — Replace secret with `[REDACTED_AWS_KEY]`, send prompt.
    - `[Allow]` (orange, secondary, disabled if enterprise policy active) — Send original, log "USER_ALLOWED".
    - `[Block]` (red) — Cancel entire request.
  - **Countdown Timer (Bottom):** `Timeout in: 14s` (Red if <5s left).
  - **Auto-Action:** If timeout (15s), default action = `[Redact]` (log "AUTO_REDACTED").
  - **Enterprise Mode (If Enforced Redaction):** Only show `[Redact]` button. Hide `[Allow]`. Display banner: "Admin has enforced redaction. Allow button disabled."

---

### 1.D. Update Notification
- **Type:** Toast notification (bottom-right corner).
- **Message:** "NodeGuarder v1.1.0 available. [Install Now] [Remind Later] [Skip]"
- **Auto-Dismiss:** After 10 seconds if "Remind Later" clicked.
- **On "Install Now":** Progress bar shows download + restart prompt.

---

## 2. Admin Portal UI (Web Application, React)

### 2.A. Navigation & Layout
- **Left Sidebar (Persistent):**
  - Logo + "NodeGuarder Enterprise"
  - `Dashboard` (home icon)
  - `Agents` (server icon)
  - `Policies` (shield icon)
  - `Audit Logs` (document icon)
  - `Compliance Reports` (chart icon)
  - `Teams & Settings` (gear icon)
  - `Help & Docs` (question icon)
- **Top Navigation:**
  - Org name: "Acme Corp"
  - User profile dropdown (Admin | SecurityOps | Auditor role)
  - License status: "License valid until Dec 31, 2025" or `[EXPIRED] [Renew License]` (red banner)

---

### 2.B. Dashboard (Homepage)
- **Layout:** Grid of cards (4 columns, responsive).
- **Card 1: Agent Summary**
  - `Total Agents: 47`
  - `Online Now: 45` (green)
  - `Offline (>24h): 2` (red)
  - `Policy Compliant: 46` (green checkmark)
  - Link: "View All Agents →"
- **Card 2: Recent Redactions (Today)**
  - `Total Flagged: 1,234`
  - `Redacted: 1,190 (96%)`
  - `Allowed: 44 (4%)`
  - Link: "View Audit Logs →"
- **Card 3: Policy Status**
  - `Active Policies: 3`
  - `Last Updated: 2 hours ago`
  - `Agents with Custom Rules: 12`
  - Link: "Manage Policies →"
- **Card 4: Compliance**
  - `90-Day Audit Trail: ✓ Complete`
  - `GDPR Compliant: ✓`
  - Link: "Export Compliance Report →"
- **Bottom: Activity Timeline**
  - "2 hours ago: Policy updated by alice@acme.com"
  - "4 hours ago: Agent 'dev-laptop-123' revoked"
  - "8 hours ago: Enrollment code 'ENV-XXXX-YYYY' used (5 agents)"

---

### 2.C. Agents Management
- **Layout:** Table (sortable, filterable).
- **Columns:**
  - `Hostname` (sortable, link to agent detail page)
  - `Agent UUID` (truncated, copy button)
  - `IP Address` (last seen)
  - `Status` (Online/Offline, green/red dot)
  - `Policy` (Enforced | Permissive | Custom)
  - `Last Sync` (2 min ago, 5 hours ago, etc.)
  - `Flags (24h)` (1,234 flagged content)
  - `Actions` (dropdown: View Logs | Revoke | Update Policy)
- **Filters (Top):**
  - Search: by hostname, UUID, IP
  - Status: [Online] [Offline] [All]
  - Policy: [All] [Enforced] [Permissive] [Custom]
- **Bulk Actions:**
  - Checkbox to select multiple agents
  - Button: "Push Policy to Selected" (dropdown: which policy)
  - Button: "Revoke Selected" (confirmation required)

#### Agent Detail View (Modal or Side Panel)
- **Header:** Agent name + status + UUID
- **Sections:**
  - Metadata (hostname, IP, OS, agent version, Gemma 4 status)
  - Current Policy (enforced/permissive/custom, last updated)
  - 24h Activity (flagged content counts by type: AWS keys, GitHub tokens, PII, DB creds)
  - Local Allowlist (rules agent has configured locally)
  - Recent Logs (last 10 flagged prompts, sortable)

---

### 2.D. Policy Management
- **Layout:** Cards for each policy (create, edit, clone, delete).
- **Policy Card Display:**
  - Title: "Enforce Redaction (Production)"
  - Description: "All prod agents must auto-redact, no user override."
  - Applied to: "47 agents"
  - Last Updated: "2 hours ago by alice@acme.com"
  - Button: "Edit Policy"
  - Button: "View Applied Agents"

#### Policy Editor (Modal)
- **Fields:**
  - Policy Name: (text input)
  - Description: (text area)
  - **Enforcement Mode:**
    - ○ Permissive (users can Redact/Allow/Block; local allowlists work)
    - ○ Enforced (users can only Redact/Block; no Allow button; local allowlists ignored)
  - **Custom Regex Rules:**
    - Table: Existing patterns (AWS, GitHub, DB, etc., with severity badges)
    - Button: "Add Custom Pattern"
    - Input: Regex + Severity (Low/Med/High) + Delete button
  - **Allowlist Rules (if Permissive):**
    - Table: Patterns to skip (e.g., `example_*`)
    - Button: "Add Allowlist Pattern"
  - **Target Agents:**
    - Dropdown: "All Agents" | "By Policy" | "Custom (regex)"
    - If custom: Input hostname regex pattern (e.g., `prod-*`)
  - **Buttons:** `[Save Policy]` `[Preview Changes]` `[Cancel]`

#### Policy Deployment Confirmation
- Modal: "Deploy policy 'Enforce Redaction' to 47 agents?"
- Checkbox: "Send notification to admins once deployed"
- Button: `[Deploy Now]` `[Schedule (date/time)]` `[Cancel]`
- Status bar: "Deploying to 47 agents... 45/47 deployed ✓"

---

### 2.E. Audit Logs Viewer
- **Layout:** Paginated table (100 rows per page).
- **Columns:**
  - `Timestamp` (sortable, e.g., "2024-01-15 14:23:45 UTC")
  - `Agent` (hostname link to agent detail)
  - `User` (Windows username on agent machine)
  - `Content Type` (AWS_KEY | GITHUB_TOKEN | DB_CRED | PII | EMAIL) — color-coded badges (red=critical, orange=high, yellow=medium)
  - `Severity` (CRITICAL | HIGH | MEDIUM | LOW) — text label only, no emoji
  - `Action` (REDACTED | ALLOWED | BLOCKED | AUTO_REDACTED) — text label only, no emoji
  - `Preview` (first 20 chars + `...` e.g., "AKIA2B3C4D5E6F..." — never show full secret)
- **Status Badge Styling (Professional, No Emoji):**
  - `REDACTED` — Solid green (#10B981) background, white text, label: "Redacted"
  - `ALLOWED` — Solid orange (#F59E0B) background, white text, label: "Allowed" (with note: "User Override")
  - `BLOCKED` — Solid red (#EF4444) background, white text, label: "Blocked"
  - `AUTO_REDACTED` — Solid green (#10B981) background, white text, label: "Auto-Redacted" (with note: "Timeout")
  - `POLICY_ENFORCED` — Solid blue (#0084FF) background, white text, label: "Policy Enforced"
- **Severity Indicators (No Emoji):**
  - `CRITICAL` — Red (#EF4444) left border (4px) on row
  - `HIGH` — Orange (#F59E0B) left border (4px) on row
  - `MEDIUM` — Yellow (#FBBF24) left border (4px) on row
  - `LOW` — Gray (#D1D5DB) left border (4px) on row
- **Filters (Top):**
  - Date Range (calendar picker, default: last 7 days)
  - Agent (multi-select, or search hostname)
  - Time Range (all day, business hours, custom)
  - Content Type (checkboxes: AWS, GitHub, DB, PII, etc.)
  - Action (checkboxes: REDACTED, ALLOWED, BLOCKED, AUTO_REDACTED)
  - User (text search)
  - Severity (sliders: show >= MEDIUM, etc.)
  - Policy Status (checkboxes: Policy Enforced, Local Mode, etc.)
- **Export Button:** "Export as CSV" (all filtered results, max 10,000 rows). CSV includes all JSON fields (no emoji in export).
- **Search Bar:** Full-text search (agent UUID, hostname, user, etc.). No emoji in search results.

#### Audit Log Detail Modal
- Clicking a log row opens full details (professional, structured format):
  - `Timestamp:` 2024-01-15 14:23:45.123 UTC (ISO 8601, no emoji)
  - `Agent UUID:` a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6 (copyable)
  - `Agent Hostname:` dev-laptop-001 (link to agent detail page)
  - `User:` alice.johnson (Windows username)
  - `IDE:` Cursor (text label, no icon)
  - `Content Type:` AWS API Key (with badge: "CRITICAL" severity, red left border)
  - `Detection Method:` Regex + Semantic Verification (text label, no icon)
  - `Action Taken:` Auto-Redacted (label with "Timeout Triggered: True")
  - `Redaction Applied:` Yes / No (text, no checkmark emoji)
  - `Policy Status:` "Policy Enforced: Yes" (text label, no icon)
  - `Preview (Redacted):` "AKIA[REDACTED_BY_SYSTEM]" (never expose secret, no emoji)
  - `Session ID:` sess_xyz123abc (internal tracking, copyable)
  - `Flagged Content Hash:` sha256:a1b2c3d4... (for forensics, no emoji)
  - `Button:` [View Raw JSON] (opens formatted JSON view)

---

### 2.F. Compliance Reports
- **Layout:** Downloadable templates (PDF, CSV).
- **Report Types:**
  - EU AI Act Compliance (audit trail, data governance, risk management)
  - SOC 2 Report (controls, incident logs, policy adherence)
  - Custom Report Builder (select date range, metrics, filters)
- **Pre-built Report Card:**
  - Title: "EU AI Act Compliance (Q4 2024)"
  - Date Range: "Oct 1 — Dec 31, 2024"
  - Status: "✓ Complete | Ready to Export"
  - Button: "Download (PDF)"
  - Button: "Email to stakeholders"

---

### 2.G. Teams & Settings
#### Users Tab
- Table: All org users (Admin, SecurityOps, Auditor roles).
- Columns: Name | Email | Role | Last Active | Actions (Edit/Remove)
- Button: "Invite New User" (email input, role selector).

#### License Tab
- Display: "License: NodeGuarder Enterprise Portal"
- Valid Until: "Dec 31, 2025"
- Licensed Agents: "Unlimited"
- Button: "Download License Key"
- Button: "Renew License" (opens sales contact form)
- **If Expired:** Red banner: "[EXPIRED] Contact sales to renew."

#### Enrollment Codes Tab
- Table: Active/Used codes.
- Columns: Code | Created | TTL (hours left) | Used By (agent hostname) | Status | Actions (Revoke)
- Button: "Generate New Code" (or "Generate Bulk Codes" — input: quantity)
- Note: "Codes expire after 24 hours of generation. Once used, they cannot be reused."

---

## 3. User Interaction Flows

### 3.A. First-Time Agent Setup Flow
1. User downloads `.exe` from nodeguarder.com.
2. Runs installer → agent starts, System Tray icon appears (green, local mode).
3. User right-clicks tray → "Settings" → "Status" tab.
4. Sees: "Mode: Local Mode" + "Agent UUID: a1b2c3d4-..."
5. IDE setup:
   - User opens Cursor settings.
   - Copy "API Endpoint: `http://localhost:8080/v1`" from tray context menu.
   - Copy "Bearer Token: `user-token-xxxxx`" from tray context menu.
   - Paste both into Cursor API settings.
6. Upstream LLM setup (Settings → Connectivity): User configures where NodeGuarder forwards cleaned requests:
   - OpenAI: `https://api.openai.com/v1` (default)
   - Local model (example Ollama): `http://localhost:11434/v1`
   - Azure OpenAI: `https://your-resource.openai.azure.com/`
7. Agent begins monitoring IDE traffic; user sends first prompt.
8. If no secrets detected: prompt passes through (green checkmark in tray tooltip).
9. If secret detected: modal popup → user chooses Redact/Allow/Block.

### 3.B. Enterprise Enrollment Flow
1. Company buys Admin Platform license.
2. Admin deploys Docker Compose on internal server.
3. Admin logs in to Portal (http://admin-platform.acme.com) with generated admin account.
4. Admin navigates to "Settings → Enrollment Codes" → "Generate New Code".
5. Code generated: `ENV-XXXX-YYYY-ZZZZ` (24h TTL).
6. Admin shares code with dev team (Slack, email, Wiki).
7. Developer #1 opens agent Settings → "Enterprise Enrollment" tab.
8. Pastes code → clicks "Validate & Enroll".
9. Agent validates with Admin Platform (mTLS), transitions to enrolled mode (icon turns blue).
10. Within 5 minutes, agent appears in Admin dashboard under "Agents".
11. Admin can now push policies (e.g., "Enforce Redaction") to this agent.
12. Developer receives notification in tray: "Admin policy updated: Enforce Redaction enabled."

### 3.C. Policy Enforcement Flow
1. Admin creates policy: "Enforce Redaction (Production)".
2. Admin selects target: all agents (or regex: `prod-*`).
3. Admin clicks "Deploy Now".
4. Admin Platform pushes policy to 47 agents via gRPC.
5. Each agent receives policy, verifies signature, applies immediately.
6. Agent UI updates: "Allow" button disappears from HITL modal.
7. If user tries to press "Allow" (via advanced debug mode), action is logged but rejected.
8. Admin sees in "Policy Compliance" dashboard: "47/47 agents enforced."

### 3.D. Audit Log Compliance Flow
1. Admin navigates to "Audit Logs" tab.
2. Filters: Date range (90 days), Content Type (all), Action (all redactions/violations).
3. Sees 100,000+ log entries (e.g., 95% redacted, 5% allowed by users).
4. Clicks "Export as CSV" → downloads audit trail for SOC 2 auditors.
5. Admin navigates to "Compliance Reports" → "EU AI Act Report".
6. Clicks "Download (PDF)" → report includes:
   - Audit trail (timestamp, user, agent, action, content type).
   - Data governance summary (% redacted, % allowed, policy compliance).
   - Risk mitigation metrics (secrets prevented from leaving device).

---

## 4. Design System & Accessibility

### 4.A. Color Palette
- **Primary:** Dark blue (#1F2937) — body background.
- **Accent:** Bright blue (#0084FF) — buttons, links, highlights.
- **Success:** Green (#10B981) — status, redacted action.
- **Warning:** Orange (#F59E0B) — allowed action, manual intervention.
- **Danger:** Red (#EF4444) — blocked, offline, critical severity.
- **Text:** Light gray (#F3F4F6) — on dark backgrounds; dark gray (#1F2937) on light backgrounds.

### 4.B. Typography
- **Header:** Inter Bold, 24px (page titles).
- **Subheader:** Inter SemiBold, 16px (section titles).
- **Body:** Inter Regular, 14px (default text).
- **Monospace:** Fira Code, 12px (tokens, UUIDs, regex patterns).

### 4.C. Icon & Visual Language
- **Icon Library:** Use professional, custom-designed icons (not emoji or AI-generated symbols).
- **Recommended Sources:**
  - Feather Icons (minimal, clean, 24px baseline)
  - Heroicons (professional, well-crafted by Tailwind Labs)
  - Custom designs via designer (Figma)
- **Icon Standards:**
  - Consistent stroke weight (1.5-2px for 24px icons).
  - No rounded corners (use sharp, geometric lines for enterprise feel).
  - Monochrome only (match text color: #F3F4F6 on dark, #1F2937 on light).
  - All icons paired with text labels (no icon-only buttons).
- **Prohibited Elements:**
  - ❌ Standard emoji (☑, ✓, ✗, ⚠, 🔒, 🛡️, etc.) — **do not use**.
  - ❌ AI-generated or stylized icons with gradients/shadows.
  - ❌ Emoji-like symbols (e.g., thumbs up, warning signs).
- **Examples (Correct):**
  - Status indicator: Simple circle (filled for online, outline for offline) — no emoji dot.
  - Checkmark: Clean line-drawn check (Feather: `check` icon) — not ✓ emoji.
  - Warning: Triangle outline (Feather: `alert-triangle`) — not ⚠ emoji.
  - Lock: Lock outline (Feather: `lock`) — not 🔒 emoji.
  - Success: Checkmark in green circle (custom SVG) — not ✅ emoji.
  - Error: X in red circle (custom SVG) — not ❌ emoji.

### 4.D. Accessibility
- WCAG 2.1 AA compliance.
- Keyboard navigation (Tab, Enter, Esc).
- Screen reader support (ARIA labels, alt text).
- High contrast mode support.
- No icons without text labels.

---

### 4.E. Professional Visual Hierarchy
- **Button States:**
  - **Primary (Active):** Solid accent color (#0084FF) background, white text, no emoji.
  - **Secondary:** Outlined (border: #0084FF, text: #0084FF), transparent background.
  - **Danger:** Solid red (#EF4444) background, white text (e.g., "Revoke", "Delete"), no emoji.
  - **Disabled:** Gray (#6B7280) background, muted text.
  - **Status Badge:** Small tag (4px padding, 12px height) with icon + text label (e.g., "Online" with green circle icon).
- **Spacing:** 8px baseline grid (all margins/padding multiples of 8px).
- **Font Weight Hierarchy:**
  - Critical/Urgent: SemiBold 16px (policy enforcement, license expiration).
  - Important: SemiBold 14px (section headers, status changes).
  - Standard: Regular 14px (body text).
  - Secondary: Regular 12px (metadata, timestamps).

---

## 5. Responsive Design Notes
- **Agent Tray UI:** Desktop-only (Windows). Fixed window size (500×600px settings panel).
- **Admin Portal:** Responsive (1200px+ recommended, 768px minimum mobile view).
- **Tables:** Horizontal scrolling on mobile; collapsible columns.
- **Modals:** Full-screen on mobile (<768px).

