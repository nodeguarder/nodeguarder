use crate::detector::{scan_and_redact, DetectionConfig, AtEngine};
#[cfg(windows)]
use crate::ocr::extract_text_from_image_bytes;

use tracing::{info, warn};

pub enum ScrutinyResult {
    /// File is safe (or binary with no hits)
    Pass(Vec<u8>),
    /// File contained sensitive data. Carries reason + detection category + original bytes.
    Block(String, String, Vec<u8>),
}

pub async fn scrub_file(
    filename: &str,
    content: Vec<u8>,
    allowlist: &[String],
    enable_ocr: bool,
    detection_config: &DetectionConfig,
    atr_engine: Option<&AtEngine>,
) -> ScrutinyResult {
    let extension = filename.split('.').last().unwrap_or("").to_lowercase();
    
    // 1. Handle PDF (Extract -> Scan -> Block)
    if extension == "pdf" {
        info!("Scrubbing PDF attachment: {}", filename);
        match pdf_extract::extract_text_from_mem(&content) {
            Ok(text) => {
                let check = scan_and_redact(&text, allowlist, detection_config, atr_engine);
                if check.flagged {
                    warn!("CRITICAL: Sensitive data detected in PDF attachment {}. Blocking upload.", filename);
                    let det = check.content_type.unwrap_or_else(|| "SECRET".to_string());
                    return ScrutinyResult::Block(format!("Sensitive data detected in PDF: {}", filename), det, content);
                }
            }
            Err(e) => {
                warn!("Failed to extract text from PDF {}: {}. Blocking upload (policy: FAIL_CLOSE).", filename, e);
                return ScrutinyResult::Block(
                    format!("Failed to scan PDF: {}", filename),
                    "SCAN_FAILURE".to_string(),
                    content,
                );
            }
        }
        return ScrutinyResult::Pass(content);
    }

    // 2. Handle Images (OCR -> Scan -> Block)
    let image_extensions = ["png", "jpg", "jpeg", "bmp", "tiff"];
    if enable_ocr && image_extensions.contains(&extension.as_str()) {
        info!("Scrubbing Image attachment (OCR): {}", filename);
        #[cfg(windows)]
        match extract_text_from_image_bytes(content.clone()).await {
            Ok(text) => {
                info!("OCR Extracted text: {:?}", text);
                let normalized_text = text.replace(' ', "").replace('\n', "").replace('\r', "");
                if !normalized_text.is_empty() {
                    let check = scan_and_redact(&normalized_text, allowlist, detection_config, atr_engine);
                    if check.flagged {
                        warn!("CRITICAL: Sensitive data detected in Image (OCR) {}. Blocking upload.", filename);
                        let det = check.content_type.unwrap_or_else(|| "SECRET".to_string());
                        return ScrutinyResult::Block(format!("Sensitive data detected in Image (OCR): {}", filename), det, content);
                    }
                }
            }
            Err(e) => {
                warn!("Failed to perform OCR on image {}: {}. Blocking upload (policy: FAIL_CLOSE).", filename, e);
                return ScrutinyResult::Block(
                    format!("Failed to scan image: {}", filename),
                    "SCAN_FAILURE".to_string(),
                    content,
                );
            }
        }
        return ScrutinyResult::Pass(content);
    }

    // 3. Handle Text-based files (Extract -> Scan -> Block)
    let text_extensions = ["txt", "log", "csv", "json", "py", "js", "ts", "md", "yaml", "yml", "sql"];
    if text_extensions.contains(&extension.as_str()) || is_likely_text(&content) {
        if let Ok(text) = String::from_utf8(content.clone()) {
            let check = scan_and_redact(&text, allowlist, detection_config, atr_engine);
            if check.flagged {
                info!("Sensitive data detected in text attachment: {}", filename);
                let det = check.content_type.unwrap_or_else(|| "SECRET".to_string());
                return ScrutinyResult::Block(format!("Sensitive data detected in text file: {}", filename), det, content);
            }
        }
    }

    ScrutinyResult::Pass(content)
}

fn is_likely_text(content: &[u8]) -> bool {
    let check_len = content.len().min(512);
    !content[..check_len].contains(&0)
}
