#![windows_subsystem = "windows"]

#[cfg(any(feature = "agent", feature = "gui"))]
mod config;
#[cfg(feature = "agent")]
mod proxy;
#[cfg(feature = "agent")]
mod detector;
#[cfg(feature = "agent")]
mod model;
#[cfg(feature = "agent")]
mod ui;
#[cfg(feature = "agent")]
mod audit;
#[cfg(feature = "agent")]
mod discovery;
#[cfg(any(feature = "agent", feature = "enterprise"))]
mod metrics;
#[cfg(feature = "agent")]
mod cache;
#[cfg(feature = "enterprise")]
mod grpc;
#[cfg(feature = "gui")]
mod sync;
#[cfg(feature = "agent")]
mod crypto;
#[cfg(feature = "agent")]
mod scrubber;
#[cfg(feature = "agent")]
mod provisioning;
#[cfg(all(feature = "agent", windows))]
mod ocr;
#[cfg(feature = "enterprise")]
mod portal;

#[cfg(feature = "gui")]
use std::sync::{Arc, Mutex, RwLock};
#[cfg(feature = "gui")]
use std::thread;
#[cfg(feature = "gui")]
use tokio::net::TcpListener;
#[cfg(feature = "gui")]
use tokio::runtime::Runtime;
#[cfg(feature = "gui")]
use tracing::{info, error};
#[cfg(feature = "agent")]
use proxy::AppState;
#[cfg(feature = "agent")]
use ui::UiEvent;
#[cfg(feature = "gui")]
use tao::event_loop::{EventLoopBuilder, ControlFlow};
#[cfg(feature = "gui")]
use arboard::Clipboard;

fn main() {
    // Write logs to file (no console window for end users)
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::PathBuf::from(&appdata).join("NodeGuarder").join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let file_appender = tracing_appender::rolling::never(&log_dir, "nodeguarder.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    tracing_subscriber::fmt().with_writer(non_blocking).with_ansi(false).init();

    // Check for portal mode (--portal flag)
    let is_portal = std::env::args().any(|a| a == "--portal");

    #[cfg(feature = "enterprise")]
    if is_portal {
        run_portal();
        return;
    }

    #[cfg(not(feature = "enterprise"))]
    if is_portal {
        eprintln!("Portal mode requires the 'enterprise' feature. Build with: cargo build --features enterprise");
        std::process::exit(1);
    }

    #[cfg(feature = "gui")]
    run_agent();

    #[cfg(not(feature = "gui"))]
    if !is_portal {
        eprintln!("This build does not include GUI support. Use --portal for headless server mode.");
        std::process::exit(1);
    }
}

#[cfg(feature = "gui")]
fn set_autostart(enabled: bool) {
    let exe_path = std::env::current_exe().unwrap_or_default();
    if enabled {
        let _ = std::process::Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                   "/v", "NodeGuarder", "/t", "REG_SZ",
                   "/d", &exe_path.to_string_lossy(), "/f"])
            .status();
    } else {
        let _ = std::process::Command::new("reg")
            .args(["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                   "/v", "NodeGuarder", "/f"])
            .status();
    }
}

/// Return the path used for the single-instance lock file.
#[cfg(feature = "gui")]
fn lock_path() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(&appdata).join("NodeGuarder").join("agent.lock")
}

/// Check and acquire a process-exclusive lock file to prevent multiple instances.
/// On Windows, uses OpenProcess via raw FFI to detect stale locks so that a
/// crashed instance doesn't permanently block restarts.
#[cfg(feature = "gui")]
fn acquire_lock() -> Result<(), String> {
    use std::io::Write;
    use std::fs;

    let lock_path = lock_path();
    if let Some(parent) = lock_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create lock dir: {}", e))?;
    }

    // If a lock file already exists, check whether the owning PID is still alive.
    if lock_path.exists() {
        if let Ok(content) = fs::read_to_string(&lock_path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                #[cfg(windows)]
                {
                    extern "system" {
                        fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void;
                        fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
                    }
                    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
                    unsafe {
                        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                        if !handle.is_null() {
                            CloseHandle(handle);
                            return Err("Another instance is already running".to_string());
                        }
                    }
                }
                #[cfg(not(windows))]
                {
                    if std::path::Path::new(&format!("/proc/{}", pid)).exists() {
                        return Err("Another instance is already running".to_string());
                    }
                }
            }
        }
        // Stale lock – remove it.
        let _ = fs::remove_file(&lock_path);
    }

    // Write our PID.
    let mut f = fs::File::create(&lock_path).map_err(|e| format!("Cannot create lock file: {}", e))?;
    write!(f, "{}", std::process::id()).map_err(|e| format!("Cannot write lock file: {}", e))?;
    f.flush().map_err(|e| format!("Cannot flush lock file: {}", e))?;
    Ok(())
}

#[cfg(feature = "gui")]
fn run_agent() {
    // Enforce single instance before anything else.
    if let Err(msg) = acquire_lock() {
        eprintln!("{}", msg);
        std::process::exit(0);
    }

    let config = config::load_or_create_config();
    crate::model::check_for_atr_updates(config.disable_atr_auto_update);
    if config.auto_start {
        set_autostart(true);
    }

    info!("Starting NodeGuarder Local Agent MVP...");

    let config_lock = Arc::new(RwLock::new(config.clone()));
    let config_lock_backend = Arc::clone(&config_lock);
    let config_lock_ui = Arc::clone(&config_lock);
    let config_lock_sync = Arc::clone(&config_lock);

    // 1. Initialize the Tokio Runtime and get a handle for the UI thread
    let rt = Runtime::new().expect("Failed to create tokio runtime");
    let rt_handle = rt.handle().clone();

    // Shared bound port (updated by backend once it finds a free one)
    let bound_port = Arc::new(Mutex::new(config.bind_port));
    let bound_port_backend = Arc::clone(&bound_port);
    let bound_port_ui = Arc::clone(&bound_port);

    let mut clipboard = Clipboard::new().expect("Failed to initialize clipboard");

    let event_loop = EventLoopBuilder::<UiEvent>::with_user_event().build();
    let ui_proxy = event_loop.create_proxy();
    let ui_proxy_sync = ui_proxy.clone();

    let sync_engine = Arc::new(crate::sync::SyncEngine::new(config_lock_sync, ui_proxy_sync));
    let sync_engine_ui = Arc::clone(&sync_engine);

    let ui_proxy_clone = ui_proxy.clone();
    
    // Hit modal channel (bypasses tao EventLoopProxy which is unreliable on Windows)
    let (hit_sender, hit_receiver) = crossbeam_channel::unbounded::<UiEvent>();
    
    // 2. Start the Backend and Sync Engine in the runtime
    thread::spawn(move || {
        rt.block_on(async move {
            // Start Sync Engine in same runtime
            let se = Arc::clone(&sync_engine);
            tokio::spawn(async move {
                se.run().await;
            });
            
            run_backend(ui_proxy_clone, hit_sender, config_lock_backend, bound_port_backend, sync_engine).await;
        });
    });

    // Support multiple windows concurrently
    let mut windows: Vec<(tao::window::WindowId, (tao::window::Window, wry::WebView))> = Vec::new();
    let (tray_icon, tray_ids) = ui::tray::build_tray();

    event_loop.run(move |event, event_loop_window_target, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Ok(event) = tray_icon::menu::MenuEvent::receiver().try_recv() {
            let id = event.id();
            if *id == tray_ids.exit {
                let _ = ui_proxy.send_event(UiEvent::ExitApp);
            } else if *id == tray_ids.settings {
                let _ = ui_proxy.send_event(UiEvent::OpenSettings);
            }
        }

        // Double-click tray icon opens settings
        if let Ok(tray_event) = tray_icon::TrayIconEvent::receiver().try_recv() {
            if matches!(tray_event, tray_icon::TrayIconEvent::DoubleClick { .. }) {
                let _ = ui_proxy.send_event(UiEvent::OpenSettings);
            }
        }

        // Poll hit modal channel (from backend thread, bypasses tao proxy)
        while let Ok(hit_event) = hit_receiver.try_recv() {
            match hit_event {
                UiEvent::TriggerHitModal(hit) => {
                    let webview_pair = ui::windows::spawn_hit_modal(event_loop_window_target, hit, ui_proxy.clone());
                    windows.push((webview_pair.0.id(), webview_pair));
                }
                _ => {}
            }
        }

        match event {
            tao::event::Event::UserEvent(ui_event) => {
                match ui_event {
                    UiEvent::TriggerHitModal(hit) => {
                        info!("HITL Modal triggered...");
                        let webview_pair = ui::windows::spawn_hit_modal(event_loop_window_target, hit, ui_proxy.clone());
                        windows.push((webview_pair.0.id(), webview_pair));
                    }
                    UiEvent::OpenSettings => {
                        info!("Opening Settings Panel...");
                        let current_config = config_lock_ui.read().unwrap().clone();
                        let port = *bound_port_ui.lock().unwrap();
                        
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            ui::windows::spawn_settings_window(
                                event_loop_window_target, 
                                ui_proxy.clone(),
                                &current_config,
                                port,
                            )
                        }));
                        match result {
                            Ok(webview_pair) => windows.push((webview_pair.0.id(), webview_pair)),
                            Err(e) => {
                                let msg = if let Some(s) = e.downcast_ref::<&str>() {
                                    s.to_string()
                                } else if let Some(s) = e.downcast_ref::<String>() {
                                    s.clone()
                                } else {
                                    format!("{:?}", e)
                                };
                                error!("Settings window creation failed: {}", msg);
                            }
                        }
                    }
                    UiEvent::CopyToClipboard(text) => {
                        let _ = clipboard.set_text(text);
                    }
                    UiEvent::AddAllowlistRule(rule) => {
                        if config::add_allowlist_rule(&rule) {
                            let mut cfg = config_lock_ui.write().unwrap();
                            if !cfg.allowlists_regex.contains(&rule) {
                                cfg.allowlists_regex.push(rule);
                            }
                            info!("Added allowlist rule: {}", cfg.allowlists_regex.last().unwrap());
                        }
                    }
                    UiEvent::RemoveAllowlistRule(rule) => {
                        if config::remove_allowlist_rule(&rule) {
                            let mut cfg = config_lock_ui.write().unwrap();
                            cfg.allowlists_regex.retain(|r| r != &rule);
                            info!("Removed allowlist rule: {}", rule);
                        }
                    }
                    UiEvent::EnrollAgent { admin_url, code } => {
                        let sync = Arc::clone(&sync_engine_ui);
                        rt_handle.spawn(async move {
                            if let Err(e) = sync.enroll(admin_url, code).await {
                                error!("Enrollment error: {}", e);
                            }
                        });
                    }
                    UiEvent::DisconnectAgent => {
                        let sync = Arc::clone(&sync_engine_ui);
                        rt_handle.spawn(async move {
                            sync.disconnect().await;
                        });
                    }
                    UiEvent::DisconnectWithPassword(password) => {
                        #[cfg(feature = "enterprise")]
                        {
                            let hash = config_lock_ui.read().unwrap().disconnect_password_hash.clone();
                            if let Some(hash) = hash {
                                if bcrypt::verify(&password, &hash).unwrap_or(false) {
                                    let sync = Arc::clone(&sync_engine_ui);
                                    rt_handle.spawn(async move {
                                        sync.disconnect().await;
                                    });
                                } else {
                                    let script = "if(typeof showToast === 'function') showToast('Incorrect disconnect password.', 3000);";
                                    for (_, (_, webview)) in windows.iter() {
                                        let _ = webview.evaluate_script(script);
                                    }
                                }
                            }
                        }
                        #[cfg(not(feature = "enterprise"))]
                        {
                            let sync = Arc::clone(&sync_engine_ui);
                            rt_handle.spawn(async move {
                                sync.disconnect().await;
                            });
                        }
                    }
                    UiEvent::UpdateConfigInUI(json) => {
                        let script = format!("if(window.updateConfig) {{ window.updateConfig({}); }}", json);
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                        let port = *bound_port_ui.lock().unwrap();
                        let enrolled = config_lock_ui.read().unwrap().enrolled_admin.is_some();
                        let connected = sync_engine_ui.is_connected();
                        crate::ui::tray::update_tray_tooltip(&tray_icon, port, enrolled, connected, false);
                    }
                    UiEvent::UpdateLogsInUI(json) => {
                        let script = format!("if(window.updateLogs) {{ window.updateLogs({}); }}", json);
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                    }
                    UiEvent::ToggleOcr(enabled) => {
                        let mut cfg = config_lock_ui.write().unwrap();
                        cfg.enable_ocr = enabled;
                        config::save_config(&cfg);
                        info!("OCR Scanning toggled: {}", enabled);
                    }
                    UiEvent::ToggleDetection { category, enabled } => {
                        let mut cfg = config_lock_ui.write().unwrap();
                        match category.as_str() {
                            "api_keys" => cfg.detect_api_keys = enabled,
                            "db_credentials" => cfg.detect_db_credentials = enabled,
                            "pii" => cfg.detect_pii = enabled,
                            "injection" => cfg.detect_injection = enabled,
                            "code_execution" => cfg.detect_code_execution = enabled,
                            "social_engineering" => cfg.detect_social_engineering = enabled,
                            "skill_compromise" => cfg.detect_skill_compromise = enabled,
                            "excessive_autonomy" => cfg.detect_excessive_autonomy = enabled,
                            "model_abuse" => cfg.detect_model_abuse = enabled,
                            "data_poisoning" => cfg.detect_data_poisoning = enabled,
                            _ => {}
                        }
                        config::save_config(&cfg);
                        info!("Detection category toggled: {} = {}", category, enabled);
                    }
                    UiEvent::CloseWindow(id) => {
                        windows.retain(|(win_id, _)| *win_id != id);
                    }
                    UiEvent::DragWindow(id) => {
                        for (win_id, (window, _)) in windows.iter() {
                            if *win_id == id {
                                let _ = window.drag_window();
                                break;
                            }
                        }
                    }
                    UiEvent::UpdateTray => {
                        let port = *bound_port_ui.lock().unwrap();
                        let enrolled = config_lock_ui.read().unwrap().enrolled_admin.is_some();
                        let connected = sync_engine_ui.is_connected();
                        crate::ui::tray::update_tray_tooltip(&tray_icon, port, enrolled, connected, false);
                    }
                    UiEvent::ExportLogs => {
                        info!("Exporting logs...");
                        let logs = audit::read_logs();
                        let mut csv = String::from("Timestamp,Content Type,Action,Detection Method,Preview\n");
                        for log in logs {
                            csv.push_str(&format!("{},{},{},{},\"{}\"\n", 
                                log.timestamp, log.content_type, log.action_taken,
                                log.detection_method,
                                log.preview.replace("\"", "\"\"")));
                        }
                        
                        let path = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
                        let dest = std::path::PathBuf::from(path).join("Downloads").join("nodeguarder_logs.csv");
                        if let Ok(_) = std::fs::write(&dest, csv) {
                            let msg = format!("Logs exported to your Downloads folder: {}", dest.display().to_string().replace("\\", "\\\\"));
                            let script = format!("showToast('{}', 5000);", msg.replace("'", "\\'"));
                            for (_, (_, webview)) in windows.iter() {
                                let _ = webview.evaluate_script(&script);
                            }
                        }
                    }
                    UiEvent::ExitApp => {
                        let _ = std::fs::remove_file(lock_path());
                        *control_flow = ControlFlow::Exit;
                    }
                    UiEvent::UpdateUpstreamUrl(url) => {
                        let mut cfg = config_lock_ui.write().unwrap();
                        cfg.upstream_url = url.clone();
                        // Keep routes in sync: update the catch-all route
                        let url_for_route = url.clone();
                        if let Some(route) = cfg.upstream_routes.iter_mut().find(|r| r.match_pattern == "*") {
                            route.url = url_for_route;
                        }
                        config::save_config(&cfg);
                        info!("Upstream URL updated to: {}", url);
                        let json = serde_json::json!({"upstream_url": &url}).to_string();
                        let script = format!("if(window.updateConfig) {{ window.updateConfig({}); }}", json);
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                    }
                    UiEvent::UpdateUpstreamApiKey(key) => {
                        let mut cfg = config_lock_ui.write().unwrap();
                        // Empty string means "no auth" (local model). Store None for clean serialization.
                        let new_key = if key.is_empty() { None } else { Some(key.clone()) };
                        cfg.upstream_api_key = new_key.clone();
                        // Keep old fields in sync for backward compat: update the catch-all route
                        if let Some(route) = cfg.upstream_routes.iter_mut().find(|r| r.match_pattern == "*") {
                            route.api_key = new_key;
                        }
                        config::save_config(&cfg);
                        info!("Upstream API key updated (set: {})", !key.is_empty());
                    }
                    UiEvent::UpdateUpstreamRoutes(routes) => {
                        let mut cfg = config_lock_ui.write().unwrap();
                        // Extract catch-all values before mutating cfg
                        let catch_all_data = routes.iter().find(|r| r.match_pattern == "*")
                            .map(|r| (r.url.clone(), r.api_key.clone()));
                        cfg.upstream_routes = routes;
                        if let Some((url, api_key)) = catch_all_data {
                            cfg.upstream_url = url;
                            cfg.upstream_api_key = api_key;
                        }
                        config::save_config(&cfg);
                        info!("Upstream routes updated ({} routes)", cfg.upstream_routes.len());
                    }
                    UiEvent::ToggleAtrAutoUpdate(disabled) => {
                        let mut cfg = config_lock_ui.write().unwrap();
                        cfg.disable_atr_auto_update = disabled;
                        config::save_config(&cfg);
                        info!("ATR auto-update disabled: {}", disabled);
                        let json = serde_json::json!({"disable_atr_auto_update": disabled}).to_string();
                        let script = format!("if(window.updateConfig) {{ window.updateConfig({}); }}", json);
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                    }
                    UiEvent::ToggleAutoStart(enabled) => {
                        let mut cfg = config_lock_ui.write().unwrap();
                        cfg.auto_start = enabled;
                        config::save_config(&cfg);
                        info!("Auto-start on boot: {}", enabled);
                        let json = serde_json::json!({"auto_start": enabled}).to_string();
                        let script = format!("if(window.updateConfig) {{ window.updateConfig({}); }}", json);
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                        std::thread::spawn(move || {
                            set_autostart(enabled);
                        });
                    }
                    UiEvent::UpdateModelStatus(status) => {
                        let script = format!("if(window.updateStatus) {{ window.updateStatus('{}'); }}", status.replace("'", "\\'"));
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                    }
                    UiEvent::UpdateHardwareStatus(hw) => {
                        let script = format!("if(window.updateHardware) {{ window.updateHardware('{}'); }}", hw.replace("'", "\\'"));
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                    }
                    UiEvent::ScanEnvironment => {
                        let rt = rt_handle.clone();
                        let uuid = config_lock_ui.read().unwrap().uuid.clone();
                        let port = *bound_port_ui.lock().unwrap();
                        let proxy = ui_proxy.clone();
                        rt.spawn(async move {
                            let report = crate::discovery::compile_report(&uuid, port).await;
                            let json = serde_json::to_string(&report).unwrap_or_else(|_| "null".to_string());
                            let _ = proxy.send_event(UiEvent::UpdateDiscoveryData(json));
                        });
                    }
                    UiEvent::CheckUpstream(url) => {
                        let rt = rt_handle.clone();
                        let proxy = ui_proxy.clone();
                        rt.spawn(async move {
                            let base = url.trim_end_matches('/');
                            let reachable = crate::discovery::is_http_server(base).await;
                            let models = if reachable {
                                crate::discovery::fetch_models(base).await
                            } else {
                                vec![]
                            };
                            let result = serde_json::json!({
                                "url": url,
                                "reachable": reachable,
                                "models": models,
                            });
                            let _ = proxy.send_event(UiEvent::UpdateUpstreamStatus(result.to_string()));
                        });
                    }
                    UiEvent::UpdateDiscoveryData(json) => {
                        let script = format!("if(window.updateDiscovery) {{ window.updateDiscovery({}); }}", json);
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                    }
                    UiEvent::UpdateUpstreamStatus(json) => {
                        let script = format!("if(window.updateUpstreamStatus) {{ window.updateUpstreamStatus({}); }}", json);
                        for (_, (_, webview)) in windows.iter() {
                            let _ = webview.evaluate_script(&script);
                        }
                    }

                }
            }
            tao::event::Event::WindowEvent { event: tao::event::WindowEvent::CloseRequested, window_id, .. } => {
                windows.retain(|(id, _)| *id != window_id);
            }
            _ => {}
        }
    });
}

#[cfg(feature = "enterprise")]
fn run_portal() {
    use std::sync::Arc;
    use tokio::runtime::Runtime;
    use tracing::info;

    let rt = Runtime::new().expect("Failed to create tokio runtime");

    rt.block_on(async {
        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL must be set in environment");
        let rest_addr = std::env::var("REST_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:3000".to_string());
        let grpc_addr = std::env::var("GRPC_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:50051".to_string());
        let admin_grpc_url = std::env::var("ADMIN_GRPC_URL")
            .expect("ADMIN_GRPC_URL must be set in environment");

        let pool = crate::portal::db::create_pool(&database_url).await;
        crate::portal::db::run_migrations(&pool).await;

        if let Ok(admin_password) = std::env::var("ADMIN_PASSWORD") {
            if !admin_password.is_empty() {
                crate::portal::db::update_admin_password(&pool, &admin_password).await;
            }
        }

        let data_dir = std::path::Path::new("data");
        let mtls_store = crate::portal::mtls::MtlsStore::load_or_create(data_dir);

        let state = Arc::new(crate::portal::handlers::AppState {
            pool: pool.clone(),
            grpc_admin_url: admin_grpc_url.clone(),
        });

        use axum::Router;
        use axum::http::{Method, header};
        use tower_http::cors::CorsLayer;
        use tower_http::trace::TraceLayer;

        let allowed_origin = std::env::var("ALLOWED_ORIGIN")
            .unwrap_or_else(|_| "http://localhost:5173".to_string());

        let app = Router::new()
            .nest("/", crate::portal::handlers::auth::routes())
            .nest("/", crate::portal::handlers::agents::routes())
            .nest("/", crate::portal::handlers::policies::routes())
            .nest("/", crate::portal::handlers::audit_logs::routes())
            .nest("/", crate::portal::handlers::compliance::routes())
            .nest("/", crate::portal::handlers::dashboard::routes())
            .nest("/", crate::portal::handlers::users::routes())
            .nest("/", crate::portal::handlers::enrollment_codes::routes())
            .nest("/", crate::portal::handlers::health::routes())
            .nest("/", crate::portal::handlers::environment::routes())
            .nest("/", crate::portal::handlers::groups::routes())
            .nest("/", crate::portal::handlers::onboarding::routes())
            .nest("/", crate::portal::handlers::organization::routes())
            .nest("/", crate::portal::handlers::metrics::routes())
            .layer(CorsLayer::new()
                .allow_origin(allowed_origin.parse::<axum::http::HeaderValue>().unwrap_or_else(|_| {
                    axum::http::HeaderValue::from_str("http://localhost:5173").unwrap()
                }))
                .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::PUT, Method::DELETE])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
            )
            .layer(TraceLayer::new_for_http())
            .with_state(state);

        let grpc_pool = pool.clone();
        let grpc_admin_url_clone = admin_grpc_url.clone();
        tokio::spawn(async move {
            info!("Starting gRPC server on {} (admin URL: {})", grpc_addr, grpc_admin_url_clone);
            if let Err(e) = crate::portal::grpc::start_grpc_server(grpc_pool, grpc_addr, mtls_store, admin_grpc_url).await {
                tracing::error!("gRPC server error: {}", e);
            }
        });

        info!("Starting REST API server on {}", rest_addr);
        let listener = tokio::net::TcpListener::bind(&rest_addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });
}

#[cfg(feature = "gui")]
pub async fn run_backend(
    ui_proxy: tao::event_loop::EventLoopProxy<UiEvent>,
    hit_sender: crossbeam_channel::Sender<UiEvent>,
    config_lock: Arc<RwLock<config::AppConfig>>,
    bound_port: Arc<Mutex<u16>>,
    sync_engine: Arc<crate::sync::SyncEngine>,
) {
    let client = reqwest::Client::new();
    let atr_engine = Some(crate::detector::load_atr_engine());
    let metrics = Arc::new(crate::metrics::MetricsCollector::new(1000));
    let cache = Arc::new(std::sync::Mutex::new(crate::cache::ResponseCache::new(300, 1000)));
    sync_engine.set_metrics_collector(metrics.clone());
    let state = Arc::new(AppState {
        config: config_lock.clone(),
        client,
        hit_sender,
        atr_engine,
        bound_port: bound_port.clone(),
        metrics,
        cache,
    });

    let app = proxy::router(state.clone());

    // 1. Start Server in background IMMEDIATELY
    let start_port = {
        let cfg = config_lock.read().unwrap();
        cfg.bind_port
    };
    let ui_proxy_c = ui_proxy.clone();
    let bound_port_c = bound_port.clone();
    
    tokio::spawn(async move {
        let mut port = start_port;
        let listener = loop {
            let addr = format!("127.0.0.1:{}", port);
            match TcpListener::bind(&addr).await {
                Ok(l) => {
                    *bound_port_c.lock().unwrap() = port;
                    info!("SECURITY PROXY ACTIVE on {}", addr);
                    let _ = ui_proxy_c.send_event(UiEvent::UpdateTray);
                    break l;
                }
                Err(_) => {
                    port += 1;
                    if port > start_port + 20 { panic!("No ports available"); }
                }
            }
        };
        axum::serve(listener, app).await.unwrap();
    });

    // 2. Initialize Semantic Engine (Completely separate thread to prevent any potential hangs)
    #[cfg(feature = "semantic")]
    {
        thread::spawn(move || {
            info!("Initializing Semantic Engine in background thread...");
            let semantic_rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
                
            semantic_rt.block_on(async {
                // Find onnxruntime.dll next to the executable
                let exe_path = std::env::current_exe().unwrap_or_default();
                let dll_path = exe_path.parent().unwrap_or(std::path::Path::new(".")).join("onnxruntime.dll");

                match ort::init_from(&dll_path) {
                    Ok(builder) => {
                        if !builder.with_name("NodeGuarder").commit() {
                            error!("ORT environment commit failed.");
                            *crate::model::model_status().write().unwrap() = crate::model::ModelStatus::Error("ORT commit failed".to_string());
                            return;
                        }
                    }
                    Err(e) => {
                        error!("ORT init_from({:?}) failed: {}", dll_path, e);
                        *crate::model::model_status().write().unwrap() = crate::model::ModelStatus::Error(format!("ORT init failed: {}", e));
                        return;
                    }
                }
                model::start_background_download();
                
                // Keep this runtime alive for the background tasks
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                }
            });
        });
    }

    // Non-semantic build: set status immediately
    #[cfg(not(feature = "semantic"))]
    {
        crate::model::start_background_download();
    }

    // 3. Status Loop
    info!("Starting Status Loop...");
    loop {
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
        let status = crate::model::model_status().read().unwrap().clone();
        let status_str = match status {
            crate::model::ModelStatus::Loaded => "Semantic model loaded".to_string(),
            crate::model::ModelStatus::Downloading { progress, message } => {
                if message.contains("Fallback") || message.contains("Loading") {
                    message
                } else {
                    format!("{} {}%", message, progress)
                }
            }
            crate::model::ModelStatus::Disabled(msg) => format!("{}", msg),
            crate::model::ModelStatus::Error(e) => format!("Error: {}", e),
            _ => "Initializing...".to_string(),
        };
        let _ = ui_proxy.send_event(UiEvent::UpdateModelStatus(status_str));
        let hw_status = if crate::model::is_gpu_active() { "NVIDIA RTX 2070 (DirectML)".to_string() } else { "CPU".to_string() };
        let _ = ui_proxy.send_event(UiEvent::UpdateHardwareStatus(hw_status));
    }
}
