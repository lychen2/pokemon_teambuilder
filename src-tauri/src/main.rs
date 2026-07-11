#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn repo_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| String::from("Cannot resolve repository root."))
}

fn renderer_binary(root: &Path) -> PathBuf {
    root.join("tools")
        .join("poketeam-display")
        .join("build")
        .join("poketeam_display")
}

fn downloads_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join("Downloads"))
        .filter(|path| path.is_dir())
        .ok_or_else(|| String::from("Cannot find Downloads directory."))
}

fn safe_filename(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
            output.push(ch);
        } else if ch.is_whitespace() {
            output.push('-');
        }
    }
    let trimmed = output.trim_matches('-');
    if trimmed.is_empty() {
        String::from("team")
    } else {
        trimmed.to_string()
    }
}

fn timestamp_millis() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn export_team_share_image(showdown: String, name: String, slot: String, team_id: String, trainer: String, avatar: String) -> Result<String, String> {
    if showdown.trim().is_empty() {
        return Err(String::from("Current team is empty."));
    }

    let root = repo_root()?;
    let binary = renderer_binary(&root);
    if !binary.is_file() {
        return Err(format!(
            "Share renderer is not built: {}",
            binary.display()
        ));
    }

    let stamp = timestamp_millis()?;
    let temp_input = std::env::temp_dir().join(format!("poke-type-share-{stamp}.txt"));
    fs::write(&temp_input, showdown).map_err(|error| error.to_string())?;

    let output = downloads_dir()?.join(format!("poke-type-{}-{stamp}.png", safe_filename(&name)));
    let result = Command::new(&binary)
        .current_dir(root.join("tools").join("poketeam-display"))
        .arg("--input")
        .arg(&temp_input)
        .arg("--page")
        .arg("share")
        .arg("--output")
        .arg(&output)
        .arg("--slot")
        .arg(if slot.trim().is_empty() { "分享队伍" } else { slot.trim() })
        .arg("--team-id")
        .arg(team_id.trim())
        .arg("--trainer")
        .arg(trainer.trim())
        .arg("--avatar")
        .arg(avatar.trim())
        .output()
        .map_err(|error| error.to_string());

    let _ = fs::remove_file(&temp_input);
    let result = result?;
    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }

    Ok(output.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![export_team_share_image])
        .run(tauri::generate_context!())
        .expect("error while running Poke Type desktop app");
}
