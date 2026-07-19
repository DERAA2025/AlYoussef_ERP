// Prevents an extra console window from appearing on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

const DATA_FILE_NAME: &str = "data.json";

/// Resolves the path to the app's single data file, creating the app's
/// dedicated data folder first if it doesn't exist yet.
fn data_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(DATA_FILE_NAME))
}

/// Returns the saved data as a JSON string, or an empty string if no data
/// has been saved yet (first run).
#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<String, String> {
    let path = data_file_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Overwrites the data file with the given JSON string.
#[tauri::command]
fn save_data(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = data_file_path(&app)?;
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Lets the frontend show the user exactly where their data file lives on
/// disk (useful for manual backups or troubleshooting).
#[tauri::command]
fn data_file_location(app: tauri::AppHandle) -> Result<String, String> {
    let path = data_file_path(&app)?;
    Ok(path.to_string_lossy().to_string())
}

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:data.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            data_file_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
