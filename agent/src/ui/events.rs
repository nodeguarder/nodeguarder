use tokio::sync::oneshot;
use std::fmt;

#[derive(Debug, Clone)]
pub enum InterventionDecision {
    Redact,
    Allow,
    Block,
}

pub struct DetectionHit {
    pub flagged_text: String,
    pub content_type: String,
    pub severity: String,
    pub enforce_redaction: bool,
    pub has_redact: bool,
    pub redaction_resolver: oneshot::Sender<InterventionDecision>,
}

impl fmt::Debug for DetectionHit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DetectionHit")
            .field("flagged_text", &self.flagged_text)
            .field("content_type", &self.content_type)
            .field("severity", &self.severity)
            .field("enforce_redaction", &self.enforce_redaction)
            .field("has_redact", &self.has_redact)
            .field("redaction_resolver", &"oneshot::Sender")
            .finish()
    }
}

#[derive(Debug)]
pub enum UiEvent {
    TriggerHitModal(DetectionHit),
    OpenSettings,
    CopyToClipboard(String),
    ExitApp,
    AddAllowlistRule(String),
    RemoveAllowlistRule(String),
    EnrollAgent { admin_url: String, code: String },
    DisconnectAgent,
    DisconnectWithPassword(String),
    UpdateConfigInUI(String),
    UpdateLogsInUI(String),
    ToggleOcr(bool),
    ToggleDetection { category: String, enabled: bool },
    #[cfg(feature = "gui")]
    CloseWindow(tao::window::WindowId),
    #[cfg(feature = "gui")]
    DragWindow(tao::window::WindowId),
    UpdateTray,
    ExportLogs,
    ClearCache,
    UpdateModelStatus(String),
    UpdateHardwareStatus(String),
    UpdateUpstreamUrl(String),
    UpdateUpstreamApiKey(String),
    ToggleAtrAutoUpdate(bool),
}
