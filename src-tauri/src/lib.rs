use std::sync::{Arc, Mutex};
use base64::Engine;
use tauri::Manager;

#[derive(Default)]
struct AppState {
    opened_files: Arc<Mutex<Vec<String>>>,
}

#[tauri::command]
fn get_opened_files(app: tauri::AppHandle) -> Vec<String> {
    let state = app.state::<AppState>();
    let files = state.opened_files.lock().unwrap();
    files.clone()
}

#[tauri::command]
fn read_file_as_data_url(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let lower = path.to_lowercase();
    let mime = if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
fn write_image_to_clipboard(data_url: String) -> Result<(), String> {
    let (_, base64_data) = data_url
        .split_once(',')
        .ok_or_else(|| "Invalid data URL".to_string())?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    // Parse width/height from PNG header
    if bytes.len() < 24 {
        return Err("Image data too short".to_string());
    }
    // PNG: width at offset 16 (4 bytes BE), height at offset 20 (4 bytes BE)
    let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]) as usize;
    let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]) as usize;

    let img = arboard::ImageData { width: w, height: h, bytes: bytes.as_slice().into() };

    let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard.set_image(img).map_err(|e| format!("Failed to write to clipboard: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir { file_name: None },
                    ))
                    .build(),
            )?;

            // Read command-line arguments (file paths from "Open with")
            let args: Vec<String> = std::env::args().collect();
            log::info!("CLI args: {:?}", args);
            if args.len() > 1 {
                let state = app.state::<AppState>();
                let mut opened_files = state.opened_files.lock().unwrap();
                for arg in args.iter().skip(1) {
                    let lower = arg.to_lowercase();
                    if lower.ends_with(".png")
                        || lower.ends_with(".jpg")
                        || lower.ends_with(".jpeg")
                        || lower.ends_with(".bmp")
                        || lower.ends_with(".gif")
                        || lower.ends_with(".webp")
                    {
                        opened_files.push(arg.clone());
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_opened_files, read_file_as_data_url, write_image_to_clipboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
