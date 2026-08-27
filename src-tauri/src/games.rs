use std::path::PathBuf;
use std::process::Command;

use base64::Engine;
use serde::Serialize;

use crate::config::{data_dir, data_subdir, ConfigState};
use crate::db::DbState;
use crate::emulator::{build_launch_command, EmulatorProfile, ManualAction};
use crate::error::{Error, Result};
use crate::paths::{portablize_media, resolve_media};

#[derive(Debug, Serialize)]
pub struct Game {
    pub id: i64,
    pub title: String,
    pub root_id: String,
    pub rel_path: String,
    pub launch_type: String,
    pub abs_path: Option<String>,
    pub available: bool,

    pub summary: Option<String>,
    pub genres: Option<String>,
    pub release_year: Option<i64>,
    pub developer: Option<String>,
    pub cover_path: Option<String>,
    pub hero_path: Option<String>,
    pub match_status: String,

    pub emulator_profile_id: Option<i64>,
    pub media_path: Option<String>,
    pub custom_exe: Option<String>,
    pub custom_args: Option<String>,
    pub custom_workdir: Option<String>,
}

struct Row {
    id: i64,
    title: String,
    root_id: String,
    rel_path: String,
    launch_type: String,
    summary: Option<String>,
    genres: Option<String>,
    release_year: Option<i64>,
    developer: Option<String>,
    cover_path: Option<String>,
    hero_path: Option<String>,
    match_status: String,
    emulator_profile_id: Option<i64>,
    media_stored: Option<String>,
    custom_exe: Option<String>,
    custom_args: Option<String>,
    custom_workdir: Option<String>,
}

const SELECT_COLS: &str = "id, title, root_id, rel_path, launch_type, summary, genres,
    release_year, developer, cover_path, hero_path, match_status,
    emulator_profile_id, game_media_path, custom_exe, custom_args, custom_workdir";

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Row> {
    Ok(Row {
        id: r.get(0)?,
        title: r.get(1)?,
        root_id: r.get(2)?,
        rel_path: r.get(3)?,
        launch_type: r.get(4)?,
        summary: r.get(5)?,
        genres: r.get(6)?,
        release_year: r.get(7)?,
        developer: r.get(8)?,
        cover_path: r.get(9)?,
        hero_path: r.get(10)?,
        match_status: r.get(11)?,
        emulator_profile_id: r.get(12)?,
        media_stored: r.get(13)?,
        custom_exe: r.get(14)?,
        custom_args: r.get(15)?,
        custom_workdir: r.get(16)?,
    })
}

#[tauri::command]
pub fn list_games(config: tauri::State<ConfigState>, db: tauri::State<DbState>) -> Result<Vec<Game>> {
    let cfg = config.0.lock().unwrap();
    let conn = db.0.lock().unwrap();

    let sql = format!("SELECT {SELECT_COLS} FROM games ORDER BY title COLLATE NOCASE");
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<Row> = stmt
        .query_map([], |r| map_row(r))?
        .filter_map(|r| r.ok())
        .collect();

    let mut games = Vec::with_capacity(rows.len());
    for row in rows {
        let root_path = cfg
            .library_roots
            .iter()
            .find(|r| r.id == row.root_id)
            .map(|r| r.path.clone());
        let abs = root_path
            .as_ref()
            .map(|rp| PathBuf::from(rp).join(&row.rel_path));
        let media_abs = row.media_stored.as_ref().and_then(|s| resolve_media(s, &cfg));

        let available = match row.launch_type.as_str() {
            "native" => abs.as_ref().map(|p| p.is_file()).unwrap_or(false),
            "manual" => row
                .custom_exe
                .as_ref()
                .map(|e| PathBuf::from(e).is_file())
                .unwrap_or(false),
            _ => media_abs.as_ref().map(|p| p.exists()).unwrap_or(false),
        };

        games.push(Game {
            id: row.id,
            title: row.title,
            root_id: row.root_id,
            rel_path: row.rel_path,
            launch_type: row.launch_type,
            abs_path: abs.map(|p| p.to_string_lossy().into_owned()),
            available,
            summary: row.summary,
            genres: row.genres,
            release_year: row.release_year,
            developer: row.developer,
            cover_path: row.cover_path,
            hero_path: row.hero_path,
            match_status: row.match_status,
            emulator_profile_id: row.emulator_profile_id,
            media_path: media_abs.map(|p| p.to_string_lossy().into_owned()),
            custom_exe: row.custom_exe,
            custom_args: row.custom_args,
            custom_workdir: row.custom_workdir,
        });
    }
    Ok(games)
}

#[tauri::command]
pub fn remove_game(db: tauri::State<DbState>, id: i64) -> Result<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM games WHERE id = ?1", [id])?;
    for sub in ["covers", "heroes"] {
        let _ = std::fs::remove_file(
            data_dir()
                .map(|d| d.join(sub).join(format!("{id}.jpg")))
                .unwrap_or_default(),
        );
    }
    Ok(())
}

/// Path absolut folder data/ (frontend pakai untuk convertFileSrc / asset protocol).
#[tauri::command]
pub fn get_data_dir() -> Result<String> {
    Ok(data_dir()?.to_string_lossy().into_owned())
}

/// Baca file gambar di dalam data/ jadi data URL. Dipakai sebagai fallback saja
/// (asset protocol lebih efisien, terutama untuk hero landscape yang besar).
#[tauri::command]
pub fn image_data_url(rel: String) -> Result<String> {
    if rel.contains("..") {
        return Err(Error::msg("path tidak valid"));
    }
    let path = data_dir()?.join(&rel);
    let bytes = std::fs::read(&path)?;
    let mime = match bytes.as_slice() {
        [0x89, b'P', b'N', b'G', ..] => "image/png",
        [b'G', b'I', b'F', b'8', ..] => "image/gif",
        _ => "image/jpeg",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

/// Copy gambar lokal (yang dipilih operator) ke data/covers|heroes/<id>.<ext>.
#[tauri::command]
pub fn import_local_image(
    db: tauri::State<DbState>,
    game_id: i64,
    kind: String, // "cover" | "hero"
    src_path: String,
) -> Result<String> {
    let (subdir, col) = match kind.as_str() {
        "cover" => ("covers", "cover_path"),
        "hero" => ("heroes", "hero_path"),
        _ => return Err(Error::msg("kind harus 'cover' atau 'hero'")),
    };
    let src = PathBuf::from(&src_path);
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .filter(|e| ["jpg", "jpeg", "png", "gif", "webp"].contains(&e.as_str()))
        .unwrap_or_else(|| "jpg".into());
    let rel = format!("{subdir}/{game_id}.{ext}");
    std::fs::copy(&src, data_subdir(subdir)?.join(format!("{game_id}.{ext}")))?;
    db.0.lock().unwrap().execute(
        &format!("UPDATE games SET {col} = ?1 WHERE id = ?2"),
        rusqlite::params![rel, game_id],
    )?;
    Ok(rel)
}

/// Buka folder game di Explorer (Windows), file game ke-highlight.
#[tauri::command]
pub fn open_game_location(
    config: tauri::State<ConfigState>,
    db: tauri::State<DbState>,
    id: i64,
) -> Result<()> {
    let cfg = config.0.lock().unwrap();
    let conn = db.0.lock().unwrap();
    let row = conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM games WHERE id = ?1"),
        [id],
        |r| map_row(r),
    )?;
    let target = match row.launch_type.as_str() {
        "manual" => row.custom_exe.map(PathBuf::from),
        _ => cfg
            .library_roots
            .iter()
            .find(|r| r.id == row.root_id)
            .map(|r| PathBuf::from(&r.path).join(&row.rel_path)),
    }
    .ok_or_else(|| Error::msg("lokasi game tidak diketahui"))?;

    Command::new("explorer")
        .arg("/select,")
        .arg(&target)
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn launch_game(config: tauri::State<ConfigState>, db: tauri::State<DbState>, id: i64) -> Result<()> {
    let cfg = config.0.lock().unwrap();
    let conn = db.0.lock().unwrap();

    let sql = format!("SELECT {SELECT_COLS} FROM games WHERE id = ?1");
    let row = conn.query_row(&sql, [id], |r| map_row(r))?;

    let root = cfg.root(&row.root_id).ok();
    let game_exe = root
        .map(|r| PathBuf::from(&r.path).join(&row.rel_path))
        .unwrap_or_default();
    let media_abs = row
        .media_stored
        .as_ref()
        .and_then(|s| resolve_media(s, &cfg))
        .map(|p| p.to_string_lossy().into_owned());

    let profile: Option<EmulatorProfile> = match row.emulator_profile_id {
        Some(pid) => Some(conn.query_row(
            "SELECT id, name, kind, exe_path, default_args FROM emulator_profiles WHERE id = ?1",
            [pid],
            |r| {
                Ok(EmulatorProfile {
                    id: Some(r.get(0)?),
                    name: r.get(1)?,
                    kind: r.get(2)?,
                    exe_path: r.get(3)?,
                    default_args: r.get(4)?,
                })
            },
        )?),
        None => None,
    };

    let manual = ManualAction {
        exe: row.custom_exe.as_deref().unwrap_or(""),
        args: row.custom_args.as_deref().unwrap_or(""),
        workdir: row.custom_workdir.as_deref(),
    };

    let cmd = build_launch_command(
        &row.launch_type,
        &game_exe.to_string_lossy(),
        media_abs.as_deref(),
        profile.as_ref(),
        Some(&manual),
    )?;

    if !PathBuf::from(&cmd.exe).is_file() {
        return Err(Error::msg(format!(
            "executable tidak ditemukan: {} (HDD/emulator ter-mount?)",
            cmd.exe
        )));
    }

    let mut c = Command::new(&cmd.exe);
    c.args(&cmd.args);
    if let Some(cwd) = &cmd.cwd {
        c.current_dir(cwd);
    }
    c.spawn()?;
    Ok(())
}

/// Dipakai frontend saat operator memilih ISO/folder: konversi ke bentuk portable.
#[tauri::command]
pub fn portablize_path(config: tauri::State<ConfigState>, abs_path: String) -> Result<String> {
    Ok(portablize_media(&abs_path, &config.0.lock().unwrap()))
}
