use tray_icon::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    TrayIcon, TrayIconBuilder,
};

pub fn get_icon_rgba(target_size: u32) -> (Vec<u8>, u32, u32) {
    let icon_bytes = include_bytes!("../../assets/logo.png");
    let img = image::load_from_memory(icon_bytes).expect("Failed to load icon from memory");
    let mut rgba_orig = img.to_rgba8();

    // 1. Remove Neon Green background FIRST (Before resize to prevent color bleed)
    for pixel in rgba_orig.pixels_mut() {
        if pixel[1] > 180 && pixel[1] > pixel[0] && pixel[1] > pixel[2] {
            // Neon green background -> make fully transparent
            pixel[0] = 0;
            pixel[1] = 0;
            pixel[2] = 0;
            pixel[3] = 0;
        }
    }

    let orig_width = rgba_orig.width();
    let orig_height = rgba_orig.height();

    // 2. Find Bounding Box of non-transparent pixels (Auto-Crop)
    let mut min_x = orig_width;
    let mut max_x = 0;
    let mut min_y = orig_height;
    let mut max_y = 0;
    let mut found = false;

    for (x, y, pixel) in rgba_orig.enumerate_pixels() {
        if pixel[3] > 0 {
            // Non-transparent pixel
            found = true;
            if x < min_x {
                min_x = x;
            }
            if x > max_x {
                max_x = x;
            }
            if y < min_y {
                min_y = y;
            }
            if y > max_y {
                max_y = y;
            }
        }
    }

    if !found {
        min_x = 0;
        min_y = 0;
        max_x = orig_width - 1;
        max_y = orig_height - 1;
    }

    let pad_w = (max_x - min_x) / 20; // 5% padding
    let pad_h = (max_y - min_y) / 20;
    let crop_x = min_x.saturating_sub(pad_w);
    let crop_y = min_y.saturating_sub(pad_h);
    let crop_w = (max_x - min_x + 2 * pad_w).min(orig_width - crop_x);
    let crop_h = (max_y - min_y + 2 * pad_h).min(orig_height - crop_y);

    // 3. Crop & Resize
    let transparent_img = image::DynamicImage::ImageRgba8(rgba_orig);
    let cropped =
        image::imageops::crop_imm(&transparent_img, crop_x, crop_y, crop_w, crop_h).to_image();
    let resized = image::imageops::resize(
        &cropped,
        target_size,
        target_size,
        image::imageops::FilterType::Lanczos3,
    );

    let (w, h) = resized.dimensions();
    (resized.into_raw(), w, h)
}

pub fn load_tray_icon() -> tray_icon::Icon {
    let (rgba, width, height) = get_icon_rgba(48); // Large & Clear
    tray_icon::Icon::from_rgba(rgba, width, height).expect("Failed to create tray icon")
}

pub fn load_window_icon() -> tao::window::Icon {
    let (rgba, width, height) = get_icon_rgba(128); // 128x128 previously worked and showed up
    tao::window::Icon::from_rgba(rgba, width, height).expect("Failed to create window icon")
}

pub fn load_icon_base64() -> String {
    let (rgba_raw, width, height) = get_icon_rgba(128); // Standard web size

    let mut buffer = std::io::Cursor::new(Vec::new());
    let img_buffer: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
        image::ImageBuffer::from_raw(width, height, rgba_raw).unwrap();
    img_buffer
        .write_to(&mut buffer, image::ImageFormat::Png)
        .unwrap();
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buffer.get_ref())
}

pub struct TrayMenuIds {
    pub copy_url: tray_icon::menu::MenuId,
    pub copy_token: tray_icon::menu::MenuId,
    pub setup_guide: tray_icon::menu::MenuId,
    pub settings: tray_icon::menu::MenuId,
    pub exit: tray_icon::menu::MenuId,
}

pub fn build_tray() -> (TrayIcon, TrayMenuIds) {
    let tray_menu = Menu::new();

    let copy_url_item = MenuItem::new("Copy API URL", true, None);
    let copy_token_item = MenuItem::new("Copy Bearer Token", true, None);
    let setup_guide_item = MenuItem::new("How to Configure IDE", true, None);
    let settings_item = MenuItem::new("Settings", true, None);
    let exit_item = MenuItem::new("Exit NodeGuarder", true, None);

    let ids = TrayMenuIds {
        copy_url: copy_url_item.id().clone(),
        copy_token: copy_token_item.id().clone(),
        setup_guide: setup_guide_item.id().clone(),
        settings: settings_item.id().clone(),
        exit: exit_item.id().clone(),
    };

    let _ = tray_menu.append_items(&[
        &copy_url_item,
        &copy_token_item,
        &PredefinedMenuItem::separator(),
        &setup_guide_item,
        &settings_item,
        &PredefinedMenuItem::separator(),
        &exit_item,
    ]);

    let tray = TrayIconBuilder::new()
        .with_menu(Box::new(tray_menu))
        .with_tooltip("NodeGuarder Local | MVP")
        .with_icon(load_tray_icon())
        .build()
        .expect("Failed to build tray icon");

    (tray, ids)
}

pub fn update_tray_tooltip(tray: &TrayIcon, port: u16, enrolled: bool, update_available: bool) {
    let mode = if enrolled { "Enterprise Enrolled" } else { "Local Mode" };
    let update_text = if update_available { " | Update Available!" } else { "" };
    let tooltip = format!("NodeGuarder Local v{} | http://127.0.0.1:{} | {}{}", env!("CARGO_PKG_VERSION"), port, mode, update_text);
    let _ = tray.set_tooltip(Some(tooltip));
}
