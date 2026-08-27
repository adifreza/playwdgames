use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::DbState;
use crate::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmulatorProfile {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    pub kind: String, // 'pcsx2' | 'rpcs3' | 'custom'
    pub exe_path: String,
    #[serde(default)]
    pub default_args: String,
}

/// Perintah siap-eksekusi. Fungsi pembangunnya murni → gampang dites.
#[derive(Debug, PartialEq, Serialize)]
pub struct LaunchCmd {
    pub exe: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
}

fn parent_str(p: &str) -> Option<String> {
    Path::new(p).parent().map(|d| d.to_string_lossy().into_owned())
}

// ponytail: split argumen naif pakai whitespace, tidak handle tanda kutip.
// Cukup untuk flag emulator biasa; kalau butuh path berspasi di default_args, upgrade ke shell-words.
fn split_args(s: &str) -> Vec<String> {
    s.split_whitespace().map(|x| x.to_string()).collect()
}

/// Action manual ala Playnite (tipe File): exe + argumen + folder kerja bebas.
pub struct ManualAction<'a> {
    pub exe: &'a str,
    pub args: &'a str,
    pub workdir: Option<&'a str>,
}

/// Bangun perintah launch sesuai tipe. `game_exe_abs` = exe native yang sudah
/// diresolve; `media_abs` = ISO/folder game untuk emulator.
pub fn build_launch_command(
    launch_type: &str,
    game_exe_abs: &str,
    media_abs: Option<&str>,
    profile: Option<&EmulatorProfile>,
    manual: Option<&ManualAction>,
) -> Result<LaunchCmd> {
    match launch_type {
        "native" => Ok(LaunchCmd {
            exe: game_exe_abs.to_string(),
            args: vec![],
            cwd: parent_str(game_exe_abs),
        }),
        "manual" => {
            let m = manual
                .filter(|m| !m.exe.trim().is_empty())
                .ok_or_else(|| Error::msg("action manual belum diisi (exe kosong)"))?;
            Ok(LaunchCmd {
                exe: m.exe.to_string(),
                args: split_args(m.args),
                cwd: m
                    .workdir
                    .filter(|w| !w.trim().is_empty())
                    .map(|w| w.to_string())
                    .or_else(|| parent_str(m.exe)),
            })
        }
        "pcsx2" | "rpcs3" | "custom" => {
            let profile = profile.ok_or_else(|| {
                Error::msg(format!("launch '{launch_type}' butuh profil emulator dipilih"))
            })?;
            let mut args = split_args(&profile.default_args);
            match launch_type {
                "pcsx2" => {
                    let media = media_abs.ok_or_else(|| Error::msg("PCSX2 butuh path ISO game"))?;
                    args.push("--fullscreen".into());
                    args.push(media.to_string());
                }
                "rpcs3" => {
                    let media =
                        media_abs.ok_or_else(|| Error::msg("RPCS3 butuh path folder/EBOOT game"))?;
                    args.push("--no-gui".into());
                    args.push(media.to_string());
                }
                _ => {
                    if let Some(m) = media_abs {
                        args.push(m.to_string());
                    }
                }
            }
            Ok(LaunchCmd {
                exe: profile.exe_path.clone(),
                args,
                cwd: parent_str(&profile.exe_path),
            })
        }
        other => Err(Error::msg(format!("launch_type tidak dikenal: {other}"))),
    }
}

// ---------- commands ----------

#[tauri::command]
pub fn list_profiles(db: tauri::State<DbState>) -> Result<Vec<EmulatorProfile>> {
    let conn = db.0.lock().unwrap();
    let mut stmt =
        conn.prepare("SELECT id, name, kind, exe_path, default_args FROM emulator_profiles ORDER BY name")?;
    let rows = stmt.query_map([], |r| {
        Ok(EmulatorProfile {
            id: Some(r.get(0)?),
            name: r.get(1)?,
            kind: r.get(2)?,
            exe_path: r.get(3)?,
            default_args: r.get(4)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[tauri::command]
pub fn save_profile(db: tauri::State<DbState>, profile: EmulatorProfile) -> Result<i64> {
    if profile.name.trim().is_empty() || profile.exe_path.trim().is_empty() {
        return Err(Error::msg("nama & path executable emulator wajib diisi"));
    }
    let conn = db.0.lock().unwrap();
    match profile.id {
        Some(id) => {
            conn.execute(
                "UPDATE emulator_profiles SET name=?1, kind=?2, exe_path=?3, default_args=?4 WHERE id=?5",
                rusqlite::params![profile.name, profile.kind, profile.exe_path, profile.default_args, id],
            )?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO emulator_profiles (name, kind, exe_path, default_args) VALUES (?1,?2,?3,?4)",
                rusqlite::params![profile.name, profile.kind, profile.exe_path, profile.default_args],
            )?;
            Ok(conn.last_insert_rowid())
        }
    }
}

#[tauri::command]
pub fn delete_profile(db: tauri::State<DbState>, id: i64) -> Result<()> {
    db.0.lock()
        .unwrap()
        .execute("DELETE FROM emulator_profiles WHERE id = ?1", [id])?;
    Ok(())
}

/// Assign cara launch ke sebuah game (ala Playnite "Play action").
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn set_game_launch(
    db: tauri::State<DbState>,
    game_id: i64,
    launch_type: String,
    profile_id: Option<i64>,
    media_path: Option<String>,
    custom_exe: Option<String>,
    custom_args: Option<String>,
    custom_workdir: Option<String>,
) -> Result<()> {
    if !["native", "manual", "pcsx2", "rpcs3", "custom"].contains(&launch_type.as_str()) {
        return Err(Error::msg(format!("launch_type tidak valid: {launch_type}")));
    }
    db.0.lock().unwrap().execute(
        "UPDATE games SET launch_type=?1, emulator_profile_id=?2, game_media_path=?3,
            custom_exe=?4, custom_args=?5, custom_workdir=?6 WHERE id=?7",
        rusqlite::params![
            launch_type,
            profile_id,
            media_path,
            custom_exe,
            custom_args,
            custom_workdir,
            game_id
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pcsx2() -> EmulatorProfile {
        EmulatorProfile {
            id: Some(1),
            name: "PCSX2".into(),
            kind: "pcsx2".into(),
            exe_path: "C:/emu/pcsx2/pcsx2.exe".into(),
            default_args: "--nogui".into(),
        }
    }

    #[test]
    fn native_command() {
        let c = build_launch_command("native", "D:/Games/Celeste/Celeste.exe", None, None, None)
            .unwrap();
        assert_eq!(c.exe, "D:/Games/Celeste/Celeste.exe");
        assert!(c.args.is_empty());
        assert_eq!(c.cwd.as_deref(), Some("D:/Games/Celeste"));
    }

    #[test]
    fn manual_command() {
        let m = ManualAction {
            exe: "D:/Games/X/launcher.exe",
            args: "-skipintro --lang en",
            workdir: None,
        };
        let c = build_launch_command("manual", "ignored", None, None, Some(&m)).unwrap();
        assert_eq!(c.exe, "D:/Games/X/launcher.exe");
        assert_eq!(c.args, vec!["-skipintro", "--lang", "en"]);
        assert_eq!(c.cwd.as_deref(), Some("D:/Games/X"));

        let m2 = ManualAction { exe: "", args: "", workdir: None };
        assert!(build_launch_command("manual", "x", None, None, Some(&m2)).is_err());
    }

    #[test]
    fn pcsx2_command() {
        let p = pcsx2();
        let c = build_launch_command("pcsx2", "x", Some("D:/ISO/god of war.iso"), Some(&p), None)
            .unwrap();
        assert_eq!(c.exe, "C:/emu/pcsx2/pcsx2.exe");
        assert_eq!(
            c.args,
            vec!["--nogui", "--fullscreen", "D:/ISO/god of war.iso"]
        );
        assert_eq!(c.cwd.as_deref(), Some("C:/emu/pcsx2"));
    }

    #[test]
    fn rpcs3_command() {
        let p = EmulatorProfile { kind: "rpcs3".into(), exe_path: "C:/emu/rpcs3.exe".into(), default_args: String::new(), ..pcsx2() };
        let c = build_launch_command("rpcs3", "x", Some("D:/PS3/GOW3"), Some(&p), None).unwrap();
        assert_eq!(c.args, vec!["--no-gui", "D:/PS3/GOW3"]);
    }

    #[test]
    fn emulator_requires_profile_and_media() {
        assert!(build_launch_command("pcsx2", "x", Some("m"), None, None).is_err());
        assert!(build_launch_command("pcsx2", "x", None, Some(&pcsx2()), None).is_err());
    }
}
