use crate::audit;
use crate::ui::events::{DetectionHit, InterventionDecision, UiEvent};
use http::Request;
use std::sync::{Arc, Mutex};
use tao::{
    dpi::PhysicalPosition,
    event_loop::{EventLoopProxy, EventLoopWindowTarget},
    platform::windows::WindowBuilderExtWindows,
    window::{UserAttentionType, Window, WindowBuilder},
};
use wry::{WebView, WebViewBuilder};

/// Escape HTML special characters to prevent XSS in the HITL modal.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&#39;")
}

pub fn spawn_hit_modal(
    event_loop: &EventLoopWindowTarget<UiEvent>,
    hit: DetectionHit,
    proxy: EventLoopProxy<UiEvent>,
) -> (Window, WebView) {
    let window = WindowBuilder::new()
        .with_title("NodeGuarder Intervention")
        .with_inner_size(tao::dpi::LogicalSize::new(640.0, 340.0))
        .with_decorations(false) // Borderless modal
        .with_visible(false)
        .with_window_icon(Some(crate::ui::tray::load_window_icon()))
        .with_taskbar_icon(Some(crate::ui::tray::load_window_icon()))
        .build(event_loop)
        .unwrap();

    if let Some(monitor) = event_loop.primary_monitor() {
        let screen = monitor.size();
        let win = window.outer_size();
        let x = (screen.width as i32 - win.width as i32 - 20).max(0);
        let y = (screen.height as i32 - win.height as i32 - 80).max(0);
        window.set_outer_position(PhysicalPosition::new(x, y));
    }

    let window_id = window.id();
    let proxy_close = proxy.clone();

    let tx = Arc::new(Mutex::new(Some(hit.redaction_resolver)));
    let tx_clone = Arc::clone(&tx);

    let logo_base64 = crate::ui::tray::load_icon_base64();
    
    let (severity_color, severity_badge) = match hit.severity.as_str() {
        "CRITICAL" => ("var(--accent-red)", "CRITICAL"),
        "HIGH" => ("var(--accent-orange)", "HIGH"),
        _ => ("#fbbf24", hit.severity.as_str()),
    };

    let html = format!(
        r#"
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');
            :root {{ 
                --bg: #0b0f1a; --card: #161b2c; --text: #f1f5f9; --text-muted: #94a3b8; 
                --accent-red: #ef4444; --accent-green: #10b981; --accent-orange: #f59e0b; --border: #2d364f; 
            }}
            body {{ 
                margin: 0; padding: 0; font-family: 'Outfit', sans-serif; background-color: var(--bg); color: var(--text); 
                user-select: none; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; height: 100vh; 
                display: flex; flex-direction: column; 
            }}
            .title-bar {{
                height: 42px; background: #1e293b; display: flex; align-items: center; 
                padding: 0 16px; border-bottom: 1px solid var(--border); border-radius: 11px 11px 0 0;
                font-weight: 700; font-size: 11px; letter-spacing: 0.1em; color: var(--accent-orange);
                gap: 10px; flex-shrink: 0;
            }}
            .content {{ padding: 20px; flex-grow: 1; display: flex; flex-direction: column; gap: 10px; }}
            .preview-box {{ 
                background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; 
                padding: 14px; font-size: 13px; color: #cbd5e1; word-break: break-all; font-family: 'Fira Code', monospace;
                max-height: 100px; overflow-y: auto;
            }}
            /* Custom Scrollbar */
            ::-webkit-scrollbar {{ width: 6px; }}
            ::-webkit-scrollbar-thumb {{ background: var(--border); border-radius: 10px; }}
            
            .footer {{ 
                flex-shrink: 0; padding: 15px 20px; background: #1e293b; display: flex; justify-content: space-between; 
                align-items: center; border-top: 1px solid var(--border); border-radius: 0 0 11px 11px;
            }}
            .buttons {{ display: flex; gap: 12px; }}
            button {{ 
                border: none; padding: 14px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; 
                transition: all 0.2s; font-size: 14px;
            }}
            button:hover {{ transform: translateY(-1px); opacity: 0.9; }}
            .btn-redact {{ background-color: var(--accent-green); color: #fff; }}
            .btn-allow {{ background-color: transparent; border: 1px solid var(--accent-orange); color: var(--accent-orange); }}
            .btn-block {{ background-color: var(--accent-red); color: #fff; }}
            .timeout {{ font-size: 12px; color: var(--text-muted); font-weight: 600; }}
            
            .enforce-banner {{
                background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); border-radius: 6px;
                padding: 8px 12px; font-size: 11px; color: var(--accent-red); margin-top: 5px; display: none; font-weight: 600;
            }}
        </style>
    </head>
    <body>
        <div class="title-bar">
            <img src="data:image/png;base64,{logo_base64}" width="14" height="14">
            SENSITIVE DATA INTERCEPTION
        </div>
        <div class="content">
            <div style="font-size: 13px; font-weight: 600;">
                Flagged Content Type: <span style="color: {severity_color};">{content_type}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
                Severity: <span style="color: {severity_color}; font-weight: 700;">{severity_badge}</span> | Detection Method: Regex + Semantic Check
            </div>
            <div class="preview-box">{preview_text}</div>
            <div id="enforceBanner" class="enforce-banner">
                Admin has enforced redaction. Allow button disabled.
            </div>
        </div>
        <div class="footer">
            <div class="timeout" id="timeoutText">Timeout in <span id="timer" style="color:#fff">15</span>s</div>
            <div class="buttons">
                <button class="btn-block" onclick="handleClick('BLOCK')">BLOCK</button>
                <button id="btnAllow" class="btn-allow" onclick="handleClick('ALLOW')">ALLOW</button>
                <button class="btn-redact" id="btnRedact" onclick="handleClick('REDACT')">REDACT</button>
            </div>
        </div>
        <script>
            let time = 15;
            let enforce = {enforce_redaction};
            let hasRedact = {has_redact};
            
            if (enforce) {{
                document.getElementById('enforceBanner').style.display = 'block';
            }}
            if (!hasRedact) {{
                document.getElementById('btnRedact').style.display = 'none';
            }}

            function handleClick(action) {{
                clearInterval(timer);
                window.ipc.postMessage(action);
            }}

            let timer = setInterval(() => {{
                if(time > 0) {{
                    time--;
                    const timerEl = document.getElementById('timer');
                    timerEl.innerText = time;
                    if(time < 5) {{
                        timerEl.style.color = 'var(--accent-red)';
                    }}
                }}
                if(time === 0) {{
                    clearInterval(timer);
                    window.ipc.postMessage(hasRedact ? 'REDACT' : 'BLOCK');
                }}
            }}, 1000);
        </script>
    </body>
    </html>
    "#,
        logo_base64 = logo_base64,
        content_type = hit.content_type,
        severity_color = severity_color,
        severity_badge = severity_badge,
        preview_text = html_escape(&hit.flagged_text),
        enforce_redaction = hit.enforce_redaction,
        has_redact = hit.has_redact,
    );

    let webview = WebViewBuilder::new()
        .with_html(html)
        .with_background_color((11, 15, 26, 255))
        .with_ipc_handler(move |msg: Request<String>| {
            let body = msg.body().to_string();
            tracing::info!("HITL IPC received: {}", body);
            if let Some(sender) = tx_clone.lock().unwrap().take() {
                let decision = match body.as_str() {
                    "BLOCK" => InterventionDecision::Block,
                    "ALLOW" => InterventionDecision::Allow,
                    _ => InterventionDecision::Redact,
                };
                let _ = sender.send(decision);
                let _ = proxy_close.send_event(UiEvent::CloseWindow(window_id));
            }
        })
        .build(&window)
        .unwrap();
    window.set_visible(true);
    window.set_focus();
    window.request_user_attention(Some(UserAttentionType::Critical));
    (window, webview)
}

pub fn spawn_settings_window(
    event_loop: &EventLoopWindowTarget<UiEvent>,
    proxy: EventLoopProxy<UiEvent>,
    config: &crate::config::AppConfig,
    port: u16,
) -> (Window, WebView) {
    let window = WindowBuilder::new()
        .with_title("NodeGuarder Settings")
        .with_inner_size(tao::dpi::LogicalSize::new(900.0, 650.0))
        .with_decorations(false)
        .with_skip_taskbar(false)
        .with_visible(false)
        .with_window_icon(Some(crate::ui::tray::load_window_icon()))
        .with_taskbar_icon(Some(crate::ui::tray::load_window_icon()))
        .build(event_loop)
        .expect("settings: WindowBuilder::build failed");

    let window_id = window.id();
    let logo_base64 = crate::ui::tray::load_icon_base64();

    let model_status = crate::model::model_status().read().expect("settings: model_status lock poisoned").clone();
    let status_str = match model_status {
        crate::model::ModelStatus::Loaded => "Semantic model loaded".to_string(),
        crate::model::ModelStatus::Downloading { progress, message } => format!("{} {}%", message, progress),
        crate::model::ModelStatus::Disabled(msg) => msg,
        crate::model::ModelStatus::Error(_) => "Limited: Regex-only mode".to_string(),
        _ => "Initializing...".to_string(),
    };

    // Preparation for JSON data
    let allowlist_json = serde_json::to_string(&config.allowlists_regex).unwrap();
    let logs_json = serde_json::to_string(&audit::read_logs()).unwrap();
    let enrolled = config.enrolled_admin.is_some();

    let html = format!(
        r#"
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
            :root {{
                --bg: #0b0f1a; --card: #161b2c; --accent: #6366f1; --accent-hover: #818cf8;
                --text: #f1f5f9; --text-muted: #94a3b8; --border: #2d364f; --danger: #ef4444;
                --title-bar: #1e293b;
            }}
            * {{ box-sizing: border-box; }}
            body {{
                margin: 0; padding: 0; font-family: 'Outfit', sans-serif; background-color: var(--bg); color: var(--text);
                display: flex; flex-direction: column; height: 100vh; overflow: hidden;
                border: 1px solid var(--border); border-radius: 12px;
            }}
            
            /* Custom Scrollbar */
            ::-webkit-scrollbar {{ width: 8px; }}
            ::-webkit-scrollbar-track {{ background: transparent; }}
            ::-webkit-scrollbar-thumb {{ background: var(--border); border-radius: 10px; border: 2px solid var(--bg); }}
            ::-webkit-scrollbar-thumb:hover {{ background: var(--text-muted); }}

            /* Title Bar */
            .title-bar {{
                height: 48px; background: var(--title-bar); display: flex; align-items: center; 
                justify-content: space-between; padding: 0 16px; flex-shrink: 0;
                border-bottom: 1px solid var(--border); border-radius: 12px 12px 0 0;
                user-select: none;
            }}
            .title-bar-drag {{ flex-grow: 1; height: 100%; display: flex; align-items: center; cursor: default; }}
            .title-bar-controls {{ display: flex; gap: 8px; align-items: center; }}
            .control-btn {{
                width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; 
                justify-content: center; cursor: pointer; transition: all 0.2s; color: var(--text-muted);
            }}
            .control-btn:hover {{ background: rgba(255,255,255,0.05); color: #fff; }}
            .control-btn.close:hover {{ background: var(--danger); color: #fff; }}

            .sidebar-layout {{ display: flex; flex-grow: 1; overflow: hidden; }}
            .sidebar {{
                width: 240px; background-color: rgba(0,0,0,0.15); border-right: 1px solid var(--border);
                display: flex; flex-direction: column; padding: 20px 0; flex-shrink: 0;
            }}
            .nav-item {{
                padding: 14px 28px; cursor: pointer; color: var(--text-muted); transition: all 0.2s; font-weight: 600; 
                border-left: 3px solid transparent; font-size: 14px; display: flex; align-items: center; gap: 12px;
            }}
            .nav-item:hover {{ background-color: rgba(255,255,255,0.05); color: var(--text); }}
            .nav-item.active {{ background-color: rgba(99, 102, 241, 0.1); color: var(--accent); border-left-color: var(--accent); }}
            
            .main {{ flex-grow: 1; padding: 40px; overflow-y: auto; position: relative; }}
            .tab-content {{ display: none; }}
            .tab-content.active {{ display: block; animation: fadeIn 0.3s ease-out; }}
            @keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(10px); }} to {{ opacity: 1; transform: translateY(0); }} }}

            h1 {{ margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #fff; }}
            p.desc {{ color: var(--text-muted); font-size: 14px; margin-bottom: 30px; line-height: 1.5; }}
            
            .card {{ background-color: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: border-color 0.2s; }}
            .card:hover {{ border-color: var(--accent); }}
            .card-title {{ font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; font-size: 16px; color: #fff; }}
            
            .label {{ display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }}
            .value-row {{ display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.3); padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 16px; }}
            .value {{ font-family: 'Fira Code', monospace; font-size: 12px; flex-grow: 1; word-break: break-all; color: #cbd5e1; }}
            
            button.action {{
                background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 6px; 
                font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;
            }}
            button.action:hover {{ background: var(--accent-hover); transform: translateY(-1px); }}
            button.action.danger {{ background: #dc2626; }}
            button.action.danger:hover {{ background: #ef4444; }}
            button.action.small {{ padding: 6px 10px; font-size: 11px; }}
            
            .lock-banner {{ background: rgba(99, 102, 241, 0.1); border: 1px solid var(--accent); padding: 12px 16px; border-radius: 8px; color: var(--accent); font-size: 13px; margin-bottom: 20px; font-weight: 600; display: flex; align-items: center; gap: 10px; }}

            /* Custom Modal */
            .modal-overlay {{
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7);
                display: none; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px);
            }}
            .modal-card {{
                background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px;
                max-width: 400px; width: 90%; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
                transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }}
            .modal-overlay.active {{ display: flex; }}
            .modal-overlay.active .modal-card {{ transform: scale(1); }}
            
            .modal-title {{ font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #fff; }}
            .modal-body {{ font-size: 14px; color: var(--text-muted); margin-bottom: 30px; line-height: 1.6; }}
            .modal-buttons {{ display: flex; gap: 12px; justify-content: center; }}
            
            button.ghost {{ background: transparent; border: 1px solid var(--border); color: var(--text-muted); }}
            button.ghost:hover {{ border-color: #fff; color: #fff; }}

            table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
            th {{ text-align: left; padding: 14px; color: var(--text-muted); border-bottom: 1px solid var(--border); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }}
            td {{ padding: 14px; border-bottom: 1px solid rgba(255,255,255,0.03); color: #e2e8f0; }}
            
            .badge {{ font-size: 10px; padding: 3px 10px; border-radius: 99px; font-weight: 700; text-transform: uppercase; }}
            .badge-redact {{ background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid #10b981; }}
            .badge-not-installed {{ background: rgba(100, 116, 139, 0.1); color: #64748b; border: 1px solid #64748b; }}
            .badge-manual {{ background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid #94a3b8; }}
            .badge-allow {{ background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid #f59e0b; }}
            .badge-block {{ background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; }}
            
            .rule-input-group {{ display: flex; gap: 10px; margin-bottom: 20px; }}
            input.rule-input {{ background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: white; flex-grow: 1; font-family: monospace; font-size: 13px; }}
            
            /* Enterprise Specific */
            .enroll-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
            .status-indicator {{ display: flex; align-items: center; gap: 8px; font-size: 13px; }}
            .dot {{ width: 8px; height: 8px; border-radius: 50%; }}
            .dot-online {{ background-color: #10b981; box-shadow: 0 0 8px #10b981; }}
            .dot-offline {{ background-color: #94a3b8; }}

            /* Switch Styles */
            .switch-row {{ display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }}
            .switch {{ position: relative; display: inline-block; width: 44px; height: 24px; }}
            .switch input {{ opacity: 0; width: 0; height: 0; }}
            .slider {{
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: #2d364f; transition: .4s; border-radius: 24px;
            }}
            .slider:before {{
                position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
                background-color: white; transition: .4s; border-radius: 50%;
            }}
            input:checked + .slider {{ background-color: var(--accent); }}
            input:checked + .slider:before {{ transform: translateX(20px); }}

            /* Toast */
            #toast {{
                position: fixed; bottom: 24px; right: 24px; z-index: 2000;
                background: var(--card); border: 1px solid var(--border); border-radius: 10px;
                padding: 14px 20px; max-width: 360px;
                box-shadow: 0 12px 24px -8px rgba(0,0,0,0.6);
                transform: translateY(20px); opacity: 0; pointer-events: none;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 10px;
            }}
            #toast.show {{ transform: translateY(0); opacity: 1; pointer-events: auto; }}
            #toast .toast-icon {{ width: 20px; height: 20px; flex-shrink: 0; }}

            /* Advanced Tab - Diagnostics */
            .diag-row {{
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
            }}
            .diag-row:last-child {{ border-bottom: none; }}
            .diag-label {{ font-size: 13px; color: var(--text-muted); }}
            .diag-value {{ font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 8px; }}

            /* Advanced Tab - Model Badge */
            .model-badge {{
                display: flex; align-items: center; gap: 14px;
                background: rgba(0,0,0,0.3); padding: 14px 18px; border-radius: 10px;
                border: 1px solid var(--border);
            }}
            .model-icon {{ font-size: 28px; }}
            .model-name {{ font-weight: 700; font-size: 14px; color: #fff; }}
            .model-detail {{ font-size: 12px; color: var(--text-muted); margin-top: 2px; }}

            /* Advanced Tab - Maintenance rows */
            .maint-row {{
                display: flex; justify-content: space-between; align-items: center;
                padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
            }}
            .maint-row:last-child {{ border-bottom: none; padding-bottom: 0; }}
            .maint-row:first-child {{ padding-top: 0; }}
            .maint-label {{ font-weight: 600; font-size: 14px; }}
            .maint-desc {{ font-size: 12px; color: var(--text-muted); margin-top: 2px; }}
        </style>
    </head>
    <body>
        <div class="title-bar">
            <div class="title-bar-drag" onmousedown="window.ipc.postMessage('DRAG')">
                <div style="font-weight: 800; font-size: 11px; color: var(--accent); letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px;">
                    <img src="data:image/png;base64,{logo_base64}" width="16" height="16" style="filter: drop-shadow(0 0 4px var(--accent));">
                    NODEGUARDER AGENT
                </div>
            </div>
            <div class="title-bar-controls">
                <div class="control-btn close" onclick="window.ipc.postMessage('CLOSE')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </div>
            </div>
        </div>

        <div class="sidebar-layout">
            <div class="sidebar">
                <div class="nav-item active" onclick="showTab('general', this)">Connectivity</div>
                <div class="nav-item" onclick="showTab('protection', this)">Protection</div>
                <div class="nav-item" onclick="showTab('activity', this)">Security Activity</div>
                <div class="nav-item" onclick="showTab('enterprise', this)">Enterprise Management</div>
                <div class="nav-item" onclick="showTab('advanced', this)">Advanced</div>
            </div>
        
        <div class="main">
            <!-- Connectivity Tab -->
            <div id="general" class="tab-content active">
                <h1>Deployment & Connectivity</h1>
                <p class="desc">
                    NodeGuarder is an <b>OpenAI-compatible proxy</b>. Point any AI app at it and we intercept secrets before they leave your machine.
                </p>

                <div id="connLockBanner" class="lock-banner" style="display: none;">
                    <span>UPSTREAM LLM CONFIGURATION IS MANAGED BY YOUR ORGANIZATION POLICY</span>
                </div>

                <div class="card" style="border-left: 4px solid var(--accent);">
                    <div class="card-title">Connect Your AI Apps</div>
                    <div class="label">Proxy Endpoint</div>
                    <div class="value-row" style="margin-bottom: 24px;">
                        <span class="value" id="proxyBaseUrl">http://127.0.0.1:{port}/v1</span>
                        <button class="action small" onclick="copy(`http://127.0.0.1:{port}/v1`)">COPY</button>
                    </div>
                    <div class="label">Bearer Token</div>
                    <div class="value-row" style="margin-bottom: 20px;">
                        <span class="value" id="proxyApiKey">{token_escaped}</span>
                        <button class="action small" onclick="copy(document.getElementById('proxyApiKey').innerText)">COPY</button>
                    </div>
                    <p style="font-size: 12px; color: var(--text-muted);">
                        Set these as your <b>OpenAI Base URL</b> and <b>API Key</b> in any AI app, IDE plugin, or SDK.
                    </p>
                </div>

                <!-- Flow diagram -->
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0px; margin: 16px 0 8px 0; user-select: none;">
                    <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 12px 18px; text-align: center; width: 100%; box-sizing: border-box;">
                        <div style="font-size: 12px; color: #818cf8; font-weight: 700; letter-spacing: 0.05em;">YOUR IDE (Cursor / Continue.dev / Windsurf)</div>
                    </div>
                    <div style="color: var(--text-muted); font-size: 11px; padding: 4px 0;">⬇ POST /v1/chat/completions (Bearer {token_trunc})</div>
                    <div style="background: var(--card); border: 1px solid var(--accent); border-radius: 8px; padding: 14px 18px; text-align: center; width: 100%; box-sizing: border-box; box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);">
                        <div style="font-size: 12px; color: var(--accent); font-weight: 700; letter-spacing: 0.05em;">NODEGUARDER AGENT</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">scan for secrets → HITL modal → redact/allow/block</div>
                    </div>
                    <div style="color: var(--text-muted); font-size: 11px; padding: 4px 0;">⬇ cleaned request forwarded</div>
                    <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 12px 18px; text-align: center; width: 100%; box-sizing: border-box;">
                        <div style="font-size: 12px; color: #10b981; font-weight: 700; letter-spacing: 0.05em;">UPSTREAM LLM (configured below)</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title">Upstream LLM Provider</div>
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px; line-height: 1.6;">
                        NodeGuarder is a <b>middleman</b>. After scanning your prompt, it forwards the (possibly redacted) request to the URL you set here.
                    </p>
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 12px 14px; border-radius: 8px; line-height: 1.8;">
                        <b style="color: var(--text);">Common values:</b><br>
                        • <code>https://api.openai.com/v1</code> — OpenAI (default)<br>
                        • <code>http://localhost:11434/v1</code> — Local model (example Ollama)<br>
                        • <code>https://your-resource.openai.azure.com/</code> — Azure OpenAI
                    </div>
                    <div class="label">Upstream Base URL</div>
                    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                        <input type="text" id="upstreamUrlInput" class="rule-input" value="{upstream_url}" style="flex-grow: 1;">
                        <button id="saveUpstreamUrlBtn" class="action" onclick="saveUpstreamUrl()">SAVE</button>
                    </div>
                    <div id="upstreamSaved" style="display: none; font-size: 12px; color: #10b981; font-weight: 600;">Saved.</div>

                    <div class="label" style="margin-top: 24px;">Upstream API Key</div>
                    <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                        <input type="password" id="upstreamApiKeyInput" class="rule-input" value="{upstream_api_key}" placeholder="sk-... or leave empty for local models" style="flex-grow: 1;">
                        <button id="saveUpstreamKeyBtn" class="action" onclick="saveUpstreamApiKey()">SAVE</button>
                    </div>
                    <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 20px;">
                        Leave empty for Ollama / local models (no auth). Set your API key for OpenAI, Azure, GitHub Models, etc.
                    </p>
                </div>

            </div>

            <!-- Protection Tab -->
            <div id="protection" class="tab-content">
                <h1>Smart Protection</h1>
                <p class="desc">All detection categories are enabled by default. Each match is verified by AI to minimize false positives.</p>
                
                <div id="lockBanner" class="lock-banner" style="display: none;">
                    <span>ENFORCED BY ADMINISTRATOR - Settings are managed by your organization's security policy.</span>
                </div>

                <div class="card">
                    <div class="card-title">Detection Categories</div>
                    
                    <div class="switch-row" id="apiKeysRow">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">API Keys & Secrets</div>
                            <div style="font-size: 13px; color: var(--text-muted);">AWS keys, GitHub tokens, Stripe keys, Slack tokens, and other API credentials.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="apiKeysToggle" onchange="toggleDetection('api_keys', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="dbCredsRow">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Database Credentials</div>
                            <div style="font-size: 13px; color: var(--text-muted);">MongoDB, MySQL, PostgreSQL, Redis connection strings.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="dbCredsToggle" onchange="toggleDetection('db_credentials', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="piiRow">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">PII (Personal Data)</div>
                            <div style="font-size: 13px; color: var(--text-muted);">Email addresses, social security numbers, credit card numbers.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="piiToggle" onchange="toggleDetection('pii', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="injectionRow" style="border-left: 2px solid var(--accent); padding-left: 12px; margin-top: 4px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Prompt Injection & Tool Poisoning <span style="font-size: 10px; background: var(--accent); padding: 1px 6px; border-radius: 8px; vertical-align: middle;">ATR</span></div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect prompt injection, tool output poisoning, and instruction override attempts using ATR community rules.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="injectionToggle" onchange="toggleDetection('injection', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="codeExecRow" style="border-left: 2px solid var(--accent); padding-left: 12px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Shell & Code Execution <span style="font-size: 10px; background: var(--accent); padding: 1px 6px; border-radius: 8px; vertical-align: middle;">ATR</span></div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect shell metacharacter injection, eval() abuse, and remote code execution patterns.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="codeExecToggle" onchange="toggleDetection('code_execution', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="socialEngRow" style="border-left: 2px solid var(--accent); padding-left: 12px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Social Engineering <span style="font-size: 10px; background: var(--accent); padding: 1px 6px; border-radius: 8px; vertical-align: middle;">ATR</span></div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect goal hijacking, authority escalation, and consent bypass attempts.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="socialEngToggle" onchange="toggleDetection('social_engineering', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="skillCompRow" style="border-left: 2px solid var(--accent); padding-left: 12px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Malicious Skills <span style="font-size: 10px; background: var(--accent); padding: 1px 6px; border-radius: 8px; vertical-align: middle;">ATR</span></div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect supply chain attacks, skill impersonation, and hidden capabilities.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="skillCompToggle" onchange="toggleDetection('skill_compromise', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="excessAutoRow" style="border-left: 2px solid var(--accent); padding-left: 12px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Excessive Autonomy <span style="font-size: 10px; background: var(--accent); padding: 1px 6px; border-radius: 8px; vertical-align: middle;">ATR</span></div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect runaway loops, resource exhaustion, and unauthorized agent actions.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="excessAutoToggle" onchange="toggleDetection('excessive_autonomy', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="modelAbuseRow" style="border-left: 2px solid var(--accent); padding-left: 12px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Model Abuse <span style="font-size: 10px; background: var(--accent); padding: 1px 6px; border-radius: 8px; vertical-align: middle;">ATR</span></div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect model extraction, malicious fine-tuning, and security boundary violations.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="modelAbuseToggle" onchange="toggleDetection('model_abuse', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="dataPoisonRow" style="border-left: 2px solid var(--accent); padding-left: 12px;">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Data Poisoning <span style="font-size: 10px; background: var(--accent); padding: 1px 6px; border-radius: 8px; vertical-align: middle;">ATR</span></div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect training data corruption, memory manipulation, and data integrity attacks.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="dataPoisonToggle" onchange="toggleDetection('data_poisoning', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="switch-row" id="ocrRow">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Scan Images & Screenshots (OCR)</div>
                            <div style="font-size: 13px; color: var(--text-muted);">Detect sensitive text within uploaded images using native hardware acceleration.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="ocrToggle" onchange="toggleOcr(this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title">Trusted Patterns</div>
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
                        These URLs or text patterns will be allowed through without scanning. Use <code>*</code> as a wildcard: 
                        <code style="color: #818cf8;">api.example.com</code> or <code style="color: #818cf8;">my-token-*</code>
                    </p>
                    <div class="rule-input-group" id="ruleInputRow">
                        <input type="text" id="newRule" class="rule-input" placeholder="e.g. api.mycompany.com or my-app-*">
                        <button class="action" onclick="addRule()">ADD</button>
                    </div>
                    <table id="rulesTable">
                        <thead><tr><th>Pattern</th><th style="text-align: right;">Action</th></tr></thead>
                        <tbody id="rulesBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- Activity Tab -->
            <div id="activity" class="tab-content">
                <h1>Audit & Compliance</h1>
                <p class="desc">Review recent prompt interceptions and redaction events. All data remains encrypted on your machine.</p>
                
                <div class="card" style="padding: 0; overflow: hidden;">
                    <table id="logsTable">
                        <thead><tr><th>Timestamp</th><th>Source</th><th>Resolution</th><th>Preview</th></tr></thead>
                        <tbody id="logsBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- Enterprise Tab -->
            <div id="enterprise" class="tab-content">
                <h1>Enterprise Enrollment</h1>
                <p class="desc">Connect this agent to your organization's Admin Platform for fleet-wide policy management and centralized audit streams.</p>
                
                <div class="card">
                    <div class="card-title">Connection Status</div>
                    <div id="enrolledStatus" style="display: none;">
                        <div class="status-indicator" style="margin-bottom: 20px;">
                            <div class="dot dot-online"></div>
                            <span style="color: #10b981; font-weight: 700;">ENROLLED & MANAGED</span>
                        </div>
                        <div class="label">Organization ID</div>
                        <div class="value-row"><span class="value" id="orgId">--</span></div>
                        <p style="font-size: 13px; color: var(--text-muted); margin-top: 15px;">Hardware identity and mTLS certificates are managed by the platform.</p>
                        <button class="action danger" onclick="disconnect()" style="margin-top: 20px;">DISCONNECT AGENT</button>
                    </div>

                    <div id="localStatus">
                        <div class="status-indicator" style="margin-bottom: 20px;">
                            <div class="dot dot-offline"></div>
                            <span style="font-weight: 700;">STAND-ALONE LOCAL MODE</span>
                        </div>
                        <div class="label">Admin Portal gRPC URL</div>
                        <input type="text" id="adminUrl" class="rule-input" placeholder="e.g. https://admin.nodeguarder.com:50051" style="width: 100%; box-sizing: border-box; margin-bottom: 20px;">
                        
                        <div class="label">Enrollment Code</div>
                        <input type="text" id="enrollmentCode" class="rule-input" placeholder="ENV-XXXX-YYYY" style="width: 100%; box-sizing: border-box; margin-bottom: 20px;">
                        
                        <button class="action" onclick="enroll()" style="width: 100%;">VALIDATE & ENROLL AGENT</button>
                        <p style="font-size: 12px; color: var(--text-muted); text-align: center; margin-top: 15px;">Don't have a code? Contact your system administrator.</p>
                    </div>
                </div>
            </div>

            <!-- Advanced Tab -->
            <div id="advanced" class="tab-content">
                <h1>Advanced Settings</h1>
                <p class="desc">System diagnostics, model configuration, and maintenance.</p>

                <!-- Card 1: System Diagnostics -->
                <div class="card" style="border-left: 4px solid var(--accent);">
                    <div class="card-title">
                        <span>System Diagnostics</span>
                        <span class="badge badge-redact" style="font-size: 10px;">LIVE</span>
                    </div>

                    <div class="diag-row">
                        <span class="diag-label">Semantic Model</span>
                        <span class="diag-value">
                            <span class="dot dot-online" id="advModelDot"></span>
                            DeBERTa-v3 ONNX
                        </span>
                    </div>

                    <div class="diag-row">
                        <span class="diag-label">Model Status</span>
                        <span class="diag-value" id="advModelStatus">Initializing...</span>
                    </div>

                    <div class="diag-row">
                        <span class="diag-label">Inference Engine</span>
                        <span class="diag-value">ONNX Runtime 1.24.2</span>
                    </div>

                    <div class="diag-row">
                        <span class="diag-label">Hardware</span>
                        <span class="diag-value"><span id="hardwareName">CPU</span> <span class="badge badge-redact" style="font-size: 10px; margin-left: 8px;" id="hardwareBadge">ACTIVE</span></span>
                    </div>

                    <div class="diag-row">
                        <span class="diag-label">ATR Rules</span>
                        <span class="diag-value">419 patterns loaded <span id="atrBadge" class="badge {atr_badge_class}">{atr_badge_text}</span></span>
                    </div>
                </div>

                <!-- Card 2: Model Information -->
                <div class="card">
                    <div class="card-title">
                        <span>Model Information</span>
                    </div>

                    <div class="label">Current Model</div>
                    <div class="model-badge">
                        <div class="model-icon">🧠</div>
                        <div>
                            <div class="model-name">DeBERTa-v3 (Prompt Injection)</div>
                            <div class="model-detail">184M parameters &middot; ~704MB on disk &middot; CPU optimized</div>
                        </div>
                    </div>
                </div>

                <!-- Card 3: Model Health Status -->
                <div class="card">
                    <div class="card-title">Model Health Status</div>
                    <div class="value-row" style="background: rgba(16, 185, 129, 0.1); border-color: #10b981;">
                        <span id="modelStatusText" class="value" style="color: #10b981; font-weight: 700;">{status_str}</span>
                    </div>
                    <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
                        Our lightweight <b>DeBERTa-v3</b> model analyzes your prompts locally on CPU to verify context before anything leaves your machine. It does not replace the model you chat with.
                    </p>
                </div>

                <!-- Card 4: Data & Maintenance -->
                <div class="card">
                    <div class="card-title">Data & Maintenance</div>

                    <div class="maint-row">
                        <div>
                            <div class="maint-label">Audit Logs</div>
                            <div class="maint-desc">Download your complete audit history as a CSV file</div>
                        </div>
                        <button class="action ghost" onclick="window.ipc.postMessage('EXPORT_LOGS')">EXPORT CSV</button>
                    </div>

                    <div class="switch-row" id="atrAutoUpdateRow">
                        <div>
                            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Auto-Update ATR Threat Rules</div>
                            <div style="font-size: 13px; color: var(--text-muted);">Weekly background update of 419 detection patterns from the ATR community registry.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="atrAutoUpdateToggle" onchange="toggleAtrAutoUpdate(this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="maint-row">
                        <div>
                            <div class="maint-label">Reset Agent</div>
                            <div class="maint-desc">Clears model cache, audit history, and resets to defaults</div>
                        </div>
                        <button class="action danger" onclick="showResetModal()">CLEAR &amp; RESET</button>
                    </div>
                </div>

                <!-- Card 4: About -->
                <div class="card" style="border-left: 4px solid var(--accent);">
                    <div class="card-title">About NodeGuarder</div>
                    <div style="font-size: 13px; color: var(--text-muted); line-height: 1.8;">
                        Version <span style="color: var(--text); font-weight: 600;">{version}</span> &middot;
                        ONNX Runtime <span style="color: var(--text);">1.24.2</span> &middot;
                        DeBERTa-v3 semantic engine
                    </div>
                </div>
            </div>
        </div>
    </div>

        <!-- Reset Modal -->
        <div id="resetModal" class="modal-overlay">
            <div class="modal-card">
                <div class="modal-title">Clear Cache & Reset?</div>
                <div class="modal-body">
                    This will clear the model cache (~17MB), downloaded ATR rules, and your local encrypted audit history. The agent will close after reset.
                </div>
                <div class="modal-buttons">
                    <button class="action ghost" onclick="hideResetModal()">CANCEL</button>
                    <button class="action danger" onclick="confirmReset()">RESET AGENT</button>
                </div>
            </div>
        </div>

        <!-- Custom Modal Overlay -->
        <div id="disconnectModal" class="modal-overlay">
            <div class="modal-card">
                <div class="modal-title">Disconnect from Enterprise?</div>
                <div class="modal-body">
                    You are about to remove this agent from organization management. Administrative rules and redaction enforcement will be disabled.
                </div>
                <div id="disconnectPasswordRow" style="margin-bottom: 20px; display: none;">
                    <div class="label">Disconnect Password</div>
                    <input type="password" id="disconnectPasswordInput" class="rule-input" placeholder="Enter organization disconnect password" style="width: 100%; box-sizing: border-box;">
                </div>
                <div class="modal-buttons">
                    <button class="action ghost" onclick="hideModal()">CANCEL</button>
                    <button class="action danger" onclick="confirmDisconnect()">DISCONNECT</button>
                </div>
            </div>
        </div>

        <!-- Toast -->
        <div id="toast">
            <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span id="toastMessage"></span>
        </div>

        <script>
            function showToast(msg, ms) {{
                const el = document.getElementById('toast');
                const msgEl = document.getElementById('toastMessage');
                if (!el || !msgEl) return;
                msgEl.innerText = msg;
                el.classList.add('show');
                clearTimeout(el._hide);
                el._hide = setTimeout(() => el.classList.remove('show'), ms || 3000);
            }}

            let config = {{
                allowlists: {allowlist_json},
                enforce_redaction: {enforce_redaction},
                logs: {logs_json},
                enrolled: {enrolled},
                orgId: "{org_id}",
                enable_ocr: {enable_ocr},
                upstream_url: "{upstream_url}",
                upstream_api_key: "{upstream_api_key}",
                detect_api_keys: {detect_api_keys},
                detect_db_credentials: {detect_db_credentials},
                detect_pii: {detect_pii},
                detect_injection: {detect_injection},
                detect_code_execution: {detect_code_execution},
                detect_social_engineering: {detect_social_engineering},
                detect_skill_compromise: {detect_skill_compromise},
                detect_excessive_autonomy: {detect_excessive_autonomy},
                detect_model_abuse: {detect_model_abuse},
                detect_data_poisoning: {detect_data_poisoning},
                disable_atr_auto_update: {disable_atr_auto_update},
                disconnect_password_required: {disconnect_password_required},
                // Enforcement flags (updated by policy sync)
                redactionEnforced: false,
                detectionTogglesEnforced: false,
                upstreamUrlEnforced: false,
                upstreamApiKeyEnforced: false,
                bindPortEnforced: false,
                ocrEnforced: false,
                atrAutoUpdateEnforced: false,
                allowCustomAllowlists: true,
            }};

            function showTab(tabId, el) {{
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
                el.classList.add('active');
            }}

            function copy(text) {{
                window.ipc.postMessage('COPY:' + text);
            }}

            function toggleDetection(category, enabled) {{
                if (config.detectionTogglesEnforced) {{
                    var el = document.getElementById(category + 'Toggle');
                    if (el) el.checked = !enabled;
                    showToast('This setting is managed by your organization policy.', 3000);
                    return;
                }}
                let key = '';
                if (category === 'api_keys') key = 'detect_api_keys';
                else if (category === 'db_credentials') key = 'detect_db_credentials';
                else if (category === 'pii') key = 'detect_pii';
                else if (category === 'injection') key = 'detect_injection';
                else if (category === 'code_execution') key = 'detect_code_execution';
                else if (category === 'social_engineering') key = 'detect_social_engineering';
                else if (category === 'skill_compromise') key = 'detect_skill_compromise';
                else if (category === 'excessive_autonomy') key = 'detect_excessive_autonomy';
                else if (category === 'model_abuse') key = 'detect_model_abuse';
                else if (category === 'data_poisoning') key = 'detect_data_poisoning';
                if (!key) return;
                config[key] = enabled;
                window.ipc.postMessage('TOGGLE_DETECTION:' + category + ':' + enabled);
            }};

            function toggleOcr(enabled) {{
                if (config.ocrEnforced) {{
                    document.getElementById('ocrToggle').checked = !enabled;
                    showToast('This setting is managed by your organization policy.', 3000);
                    return;
                }}
                config.enable_ocr = enabled;
                window.ipc.postMessage('TOGGLE_OCR:' + enabled);
            }}

            function toggleAtrAutoUpdate(checked) {{
                if (config.atrAutoUpdateEnforced) {{
                    document.getElementById('atrAutoUpdateToggle').checked = !checked;
                    showToast('This setting is managed by your organization policy.', 3000);
                    return;
                }}
                var disabled = !checked;
                config.disable_atr_auto_update = disabled;
                window.ipc.postMessage('TOGGLE_ATR_AUTO_UPDATE:' + disabled);
            }}

            function addRule() {{
                var val = document.getElementById('newRule').value.trim();
                if (!val) return;
                if (!config.allowCustomAllowlists) {{
                    showToast('Allowlist management is restricted by your organization policy.', 3000);
                    return;
                }}
                window.ipc.postMessage('ADD_RULE:' + val);
                document.getElementById('newRule').value = '';
                config.allowlists.push(val);
                renderRules();
            }}

            function deleteRule(rule) {{
                if (!config.allowCustomAllowlists) {{
                    showToast('Allowlist management is restricted by your organization policy.', 3000);
                    return;
                }}
                window.ipc.postMessage('DEL_RULE:' + rule);
                config.allowlists = config.allowlists.filter(r => r !== rule);
                renderRules();
            }}

            function saveUpstreamUrl() {{
                if (config.upstreamUrlEnforced) {{
                    showToast('This setting is managed by your organization policy.', 3000);
                    return;
                }}
                const url = document.getElementById('upstreamUrlInput').value;
                if (!url) return;
                config.upstream_url = url;
                window.ipc.postMessage('SET_UPSTREAM_URL:' + url);
                document.getElementById('upstreamSaved').style.display = 'block';
                setTimeout(() => document.getElementById('upstreamSaved').style.display = 'none', 2000);
            }}

            function saveUpstreamApiKey() {{
                if (config.upstreamApiKeyEnforced) {{
                    showToast('This setting is managed by your organization policy.', 3000);
                    return;
                }}
                const key = document.getElementById('upstreamApiKeyInput').value;
                config.upstream_api_key = key;
                window.ipc.postMessage('SET_UPSTREAM_API_KEY:' + key);
                showToast('API key saved', 2000);
            }}

            function enroll() {{
                const url = document.getElementById('adminUrl').value;
                const code = document.getElementById('enrollmentCode').value;
                if(!url || !code) return showToast('Both URL and Code are required.', 4000);
                window.ipc.postMessage('ENROLL:' + url + '|' + code);
            }}

            function disconnect() {{
                var pwdRow = document.getElementById('disconnectPasswordRow');
                var pwdInput = document.getElementById('disconnectPasswordInput');
                if (config.disconnect_password_required) {{
                    pwdRow.style.display = 'block';
                    if (pwdInput) pwdInput.value = '';
                }} else {{
                    pwdRow.style.display = 'none';
                }}
                document.getElementById('disconnectModal').classList.add('active');
            }}

            function hideModal() {{
                document.getElementById('disconnectModal').classList.remove('active');
            }}

            function confirmDisconnect() {{
                if (config.disconnect_password_required) {{
                    var pwd = document.getElementById('disconnectPasswordInput').value;
                    if (!pwd) {{
                        showToast('Disconnect password is required.', 3000);
                        return;
                    }}
                    window.ipc.postMessage('DISCONNECT_WITH_PWD:' + pwd);
                }} else {{
                    window.ipc.postMessage('DISCONNECT');
                }}
                hideModal();
            }}

            function showResetModal() {{
                document.getElementById('resetModal').classList.add('active');
            }}

            function hideResetModal() {{
                document.getElementById('resetModal').classList.remove('active');
            }}

            function confirmReset() {{
                window.ipc.postMessage('CLEAR_CACHE');
                hideResetModal();
            }}

            function renderRules() {{
                const body = document.getElementById('rulesBody');
                body.innerHTML = '';
                if (!config.allowlists || config.allowlists.length === 0) {{
                    body.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px;">No trusted patterns configured yet. Add one above.</td></tr>';
                    return;
                }}
                config.allowlists.forEach(rule => {{
                    const tr = document.createElement('tr');
                    const canDelete = !config.enforce_redaction && config.allowCustomAllowlists;
                    tr.innerHTML = `
                        <td style="font-family: monospace; font-size: 13px;">${{rule}}</td>
                        <td style="text-align: right;">
                            ${{canDelete ? `<button class="action danger small" onclick="deleteRule('${{rule}}')">DELETE</button>` : ''}}
                        </td>
                    `;
                    body.appendChild(tr);
                }});

                if (config.enforce_redaction || !config.allowCustomAllowlists) {{
                    document.getElementById('lockBanner').style.display = 'flex';
                    document.getElementById('ruleInputRow').style.display = 'none';
                }} else {{
                    document.getElementById('lockBanner').style.display = 'none';
                    document.getElementById('ruleInputRow').style.display = 'flex';
                }}
            }}

            function renderLogs() {{
                const body = document.getElementById('logsBody');
                body.innerHTML = '';
                if (!config.logs || config.logs.length === 0) {{
                    body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px;">No security events recorded yet.</td></tr>';
                    return;
                }}
                config.logs.forEach(log => {{
                    const tr = document.createElement('tr');
                    const time = new Date(log.timestamp).toLocaleString();
                    const badgeClass = log.action_taken === 'ALLOW' ? 'badge-allow' : (log.action_taken === 'BLOCK' ? 'badge-block' : 'badge-redact');
                    tr.innerHTML = `
                        <td style="color: var(--text-muted); font-size: 11px; white-space: nowrap;">${{time}}</td>
                        <td style="font-weight: 600;">${{log.content_type}}</td>
                        <td><span class="badge ${{badgeClass}}">${{log.action_taken}}</span></td>
                        <td title="${{log.preview || ''}}">${{log.preview ? (log.preview.length > 30 ? log.preview.substring(0, 30) + '...' : log.preview) : '(empty)'}}</td>
                    `;
                    body.appendChild(tr);
                }});
            }}

            function renderEnterprise() {{
                if(config.enrolled) {{
                    document.getElementById('enrolledStatus').style.display = 'block';
                    document.getElementById('localStatus').style.display = 'none';
                    document.getElementById('orgId').innerText = config.orgId;
                }} else {{
                    document.getElementById('enrolledStatus').style.display = 'none';
                    document.getElementById('localStatus').style.display = 'block';
                }}
            }}

            function disableEl(id, disabled) {{
                var el = document.getElementById(id);
                if (el) {{
                    el.disabled = disabled;
                    el.closest('.switch-row').style.opacity = disabled ? '0.5' : '1';
                }}
            }}

            function renderEnforcement() {{
                var managed = config.enrolled;

                // All settings are managed when enrolled (Approach A)
                disableEl('apiKeysToggle', managed);
                disableEl('dbCredsToggle', managed);
                disableEl('piiToggle', managed);
                disableEl('injectionToggle', managed);
                disableEl('codeExecToggle', managed);
                disableEl('socialEngToggle', managed);
                disableEl('skillCompToggle', managed);
                disableEl('excessAutoToggle', managed);
                disableEl('modelAbuseToggle', managed);
                disableEl('dataPoisonToggle', managed);
                disableEl('ocrToggle', managed);
                disableEl('atrAutoUpdateToggle', managed);

                // Protection tab banner - show whenever enrolled
                var protBanner = document.getElementById('lockBanner');
                if (protBanner) {{
                    protBanner.style.display = managed ? 'flex' : 'none';
                }}

                // Connectivity tab - upstream URL and API key
                var upstreamRow = document.getElementById('upstreamUrlInput');
                if (upstreamRow) {{
                    upstreamRow.disabled = managed;
                    var upstreamClosest = upstreamRow.closest('.value-row') || upstreamRow.parentElement;
                    upstreamClosest.style.opacity = managed ? '0.5' : '1';
                }}
                var upstreamKeyRow = document.getElementById('upstreamApiKeyInput');
                if (upstreamKeyRow) {{
                    upstreamKeyRow.disabled = managed;
                    var keyClosest = upstreamKeyRow.closest('.value-row') || upstreamKeyRow.parentElement;
                    keyClosest.style.opacity = managed ? '0.5' : '1';
                }}
                var saveUrlBtn = document.getElementById('saveUpstreamUrlBtn');
                if (saveUrlBtn) saveUrlBtn.style.display = managed ? 'none' : '';
                var saveKeyBtn = document.getElementById('saveUpstreamKeyBtn');
                if (saveKeyBtn) saveKeyBtn.style.display = managed ? 'none' : '';

                // Connectivity tab banner - show whenever enrolled
                var connBanner = document.getElementById('connLockBanner');
                if (connBanner) {{
                    connBanner.style.display = managed ? 'flex' : 'none';
                }}

                // Trusted Patterns input - controlled by allowCustomAllowlists only (independent of enforce_redaction)
                var ruleInputRow = document.getElementById('ruleInputRow');
                if (ruleInputRow) {{
                    ruleInputRow.style.display = (config.allowCustomAllowlists && !managed) ? 'flex' : 'none';
                }}
            }}

            window.updateStatus = (status) => {{
                const statusEl = document.getElementById('modelStatusText');
                if (statusEl) statusEl.innerText = status;
                const advStatusEl = document.getElementById('advModelStatus');
                if (advStatusEl) advStatusEl.innerText = status;
                const advDot = document.getElementById('advModelDot');
                if (advDot) {{
                    advDot.className = 'dot ' + (status.includes('loaded') || status.includes('Loaded') ? 'dot-online' : 'dot-offline');
                }}
            }};

            window.updateHardware = (hw) => {{
                const hwEl = document.getElementById('hardwareName');
                if (hwEl) hwEl.innerText = hw;
                const badgeEl = document.getElementById('hardwareBadge');
                if (badgeEl) {{
                    badgeEl.className = 'badge ' + (hw.includes('CPU') ? 'badge-manual' : 'badge-redact');
                    const dotEl = document.getElementById('advModelDot');
                    if (dotEl) dotEl.className = 'dot ' + (hw.includes('CPU') ? 'dot-offline' : 'dot-online');
                }}
            }};

            window.updateConfig = (newCfg) => {{
                config = {{ ...config, ...newCfg }};
                renderRules();
                renderLogs();
                renderEnterprise();
                renderEnforcement();
                if (newCfg.upstream_url) {{
                    document.getElementById('upstreamUrlInput').value = newCfg.upstream_url;
                }}
                if (newCfg.disable_atr_auto_update !== undefined) {{
                    document.getElementById('atrAutoUpdateToggle').checked = !newCfg.disable_atr_auto_update;
                    var badge = document.getElementById('atrBadge');
                    if (badge) {{
                        badge.textContent = newCfg.disable_atr_auto_update ? 'MANUAL' : 'AUTO';
                        badge.className = 'badge ' + (newCfg.disable_atr_auto_update ? 'badge-manual' : 'badge-redact');
                    }}
                }}
                // Update detection toggle checkboxes from policy
                const toggleMap = {{
                    'detect_api_keys': 'apiKeysToggle',
                    'detect_db_credentials': 'dbCredsToggle',
                    'detect_pii': 'piiToggle',
                    'detect_injection': 'injectionToggle',
                    'detect_code_execution': 'codeExecToggle',
                    'detect_social_engineering': 'socialEngToggle',
                    'detect_skill_compromise': 'skillCompToggle',
                    'detect_excessive_autonomy': 'excessAutoToggle',
                    'detect_model_abuse': 'modelAbuseToggle',
                    'detect_data_poisoning': 'dataPoisonToggle',
                }};
                Object.keys(toggleMap).forEach(k => {{
                    if (newCfg[k] !== undefined) {{
                        var el = document.getElementById(toggleMap[k]);
                        if (el) el.checked = newCfg[k];
                    }}
                }});
                if (newCfg.enable_ocr !== undefined) {{
                    document.getElementById('ocrToggle').checked = newCfg.enable_ocr;
                }}
            }};

            window.updateLogs = (logs) => {{
                config.logs = logs;
                renderLogs();
            }};

            function fetchLogs() {{
                window.ipc.postMessage('GET_LOGS');
            }}

            var logsIntervalId = null;

            document.addEventListener('keydown', function(e) {{
                if (e.key === 'Escape') {{
                    document.querySelectorAll('.modal-overlay.active').forEach(function(m) {{
                        m.classList.remove('active');
                    }});
                }}
            }});

            window.onload = () => {{
                renderRules();
                renderLogs();
                renderEnterprise();
                renderEnforcement();
                if (logsIntervalId) clearInterval(logsIntervalId);
                logsIntervalId = setInterval(fetchLogs, 5000);
                document.getElementById('upstreamUrlInput').value = config.upstream_url;
                document.getElementById('upstreamApiKeyInput').value = config.upstream_api_key;
                document.getElementById('ocrToggle').checked = config.enable_ocr;
                document.getElementById('apiKeysToggle').checked = config.detect_api_keys;
                document.getElementById('dbCredsToggle').checked = config.detect_db_credentials;
                document.getElementById('piiToggle').checked = config.detect_pii;
                document.getElementById('injectionToggle').checked = config.detect_injection;
                document.getElementById('codeExecToggle').checked = config.detect_code_execution;
                document.getElementById('socialEngToggle').checked = config.detect_social_engineering;
                document.getElementById('skillCompToggle').checked = config.detect_skill_compromise;
                document.getElementById('excessAutoToggle').checked = config.detect_excessive_autonomy;
                document.getElementById('modelAbuseToggle').checked = config.detect_model_abuse;
                document.getElementById('dataPoisonToggle').checked = config.detect_data_poisoning;
                document.getElementById('atrAutoUpdateToggle').checked = !config.disable_atr_auto_update;
            }};
        </script>
    </body>
    </html>
    "#,
        port = port,
        version = env!("CARGO_PKG_VERSION"),
        allowlist_json = allowlist_json,
        enforce_redaction = config.enforce_redaction,
        logs_json = logs_json,
        enrolled = enrolled,
        org_id = config.enrolled_admin.clone().unwrap_or("N/A".to_string()),
        enable_ocr = config.enable_ocr,
        detect_api_keys = config.detect_api_keys,
        detect_db_credentials = config.detect_db_credentials,
        detect_pii = config.detect_pii,
        detect_injection = config.detect_injection,
        detect_code_execution = config.detect_code_execution,
        detect_social_engineering = config.detect_social_engineering,
        detect_skill_compromise = config.detect_skill_compromise,
        detect_excessive_autonomy = config.detect_excessive_autonomy,
        detect_model_abuse = config.detect_model_abuse,
        detect_data_poisoning = config.detect_data_poisoning,
        disable_atr_auto_update = config.disable_atr_auto_update,
        disconnect_password_required = config.disconnect_password_hash.is_some(),
        atr_badge_class = if config.disable_atr_auto_update { "badge-manual" } else { "badge-redact" },
        atr_badge_text = if config.disable_atr_auto_update { "MANUAL" } else { "AUTO" },
        token_escaped = html_escape(&config.bearer_token),
        logo_base64 = logo_base64,
        status_str = status_str,
        upstream_url = config.upstream_url,
        upstream_api_key = config.upstream_api_key.clone().unwrap_or_default(),
        token_trunc = {
            let t = &config.bearer_token;
            if t.len() > 14 { format!("{}...", &t[..14]) } else { t.clone() }
        },
    );

    let webview = WebViewBuilder::new()
        .with_html(html)
        .with_background_color((11, 15, 26, 255))
        .with_ipc_handler(move |msg: Request<String>| {
            let body = msg.body();
            if body.starts_with("COPY:") {
                let text = body.strip_prefix("COPY:").unwrap().to_string();
                let _ = proxy.send_event(UiEvent::CopyToClipboard(text));
            } else if body.starts_with("ADD_RULE:") {
                let rule = body.strip_prefix("ADD_RULE:").unwrap().to_string();
                let _ = proxy.send_event(UiEvent::AddAllowlistRule(rule));
            } else if body.starts_with("DEL_RULE:") {
                let rule = body.strip_prefix("DEL_RULE:").unwrap().to_string();
                let _ = proxy.send_event(UiEvent::RemoveAllowlistRule(rule));
            } else if body.starts_with("ENROLL:") {
                let payload = body.strip_prefix("ENROLL:").unwrap();
                let parts: Vec<&str> = payload.split('|').collect();
                if parts.len() == 2 {
                    let _ = proxy.send_event(UiEvent::EnrollAgent {
                        admin_url: parts[0].to_string(),
                        code: parts[1].to_string(),
                    });
                }
            } else if body == "DISCONNECT" {
                let _ = proxy.send_event(UiEvent::DisconnectAgent);
            } else if body.starts_with("DISCONNECT_WITH_PWD:") {
                let password = body.strip_prefix("DISCONNECT_WITH_PWD:").unwrap().to_string();
                let _ = proxy.send_event(UiEvent::DisconnectWithPassword(password));
            } else if body.starts_with("TOGGLE_DETECTION:") {
                let payload = body.strip_prefix("TOGGLE_DETECTION:").unwrap();
                let parts: Vec<&str> = payload.split(':').collect();
                if parts.len() == 2 {
                    let category = parts[0].to_string();
                    let enabled = parts[1] == "true";
                    let _ = proxy.send_event(UiEvent::ToggleDetection { category, enabled });
                }
            } else if body.starts_with("TOGGLE_OCR:") {
                let enabled = body.strip_prefix("TOGGLE_OCR:").unwrap() == "true";
                let _ = proxy.send_event(UiEvent::ToggleOcr(enabled));
            } else if body == "GET_LOGS" {
                let logs = audit::read_logs();
                let logs_json = serde_json::to_string(&logs).unwrap();
                let _ = proxy.send_event(UiEvent::UpdateLogsInUI(logs_json));
            } else if body == "CLOSE" {
                let _ = proxy.send_event(UiEvent::CloseWindow(window_id));
            } else if body == "EXPORT_LOGS" {
                let _ = proxy.send_event(UiEvent::ExportLogs);
            } else if body == "CLEAR_CACHE" {
                let _ = proxy.send_event(UiEvent::ClearCache);
            } else if body.starts_with("SET_UPSTREAM_URL:") {
                let url = body.strip_prefix("SET_UPSTREAM_URL:").unwrap().to_string();
                let _ = proxy.send_event(UiEvent::UpdateUpstreamUrl(url));
            } else if body.starts_with("SET_UPSTREAM_API_KEY:") {
                let key = body.strip_prefix("SET_UPSTREAM_API_KEY:").unwrap().to_string();
                let _ = proxy.send_event(UiEvent::UpdateUpstreamApiKey(key));
            } else if body.starts_with("TOGGLE_ATR_AUTO_UPDATE:") {
                let disabled = body.strip_prefix("TOGGLE_ATR_AUTO_UPDATE:").unwrap() == "true";
                let _ = proxy.send_event(UiEvent::ToggleAtrAutoUpdate(disabled));
            } else if body == "DRAG" {
                let _ = proxy.send_event(UiEvent::DragWindow(window_id));
            }
        })
        .build(&window)
        .expect("settings: WebViewBuilder::build failed");
    window.set_visible(true);

    (window, webview)
}
