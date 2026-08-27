use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::config::ConfigState;
use crate::db::DbState;
use crate::error::{Error, Result};

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub added: u32,
    pub skipped: u32,
}

/// exe yang jelas bukan game: installer, uninstaller, redistributable, crash handler.
/// Cocokkan terhadap nama file lowercase tanpa ekstensi.
fn is_excluded(stem: &str) -> bool {
    const PREFIXES: &[&str] = &[
        "setup", "unins", "vcredist", "vc_redist", "dxsetup", "dotnetfx", "dotnet-",
        "ndp", "oalinst", "unitycrashhandler", "crashpad", "uninstall", "install",
        "python-", "directx",
    ];
    const CONTAINS: &[&str] = &["redist", "_setup", "-setup", "crashhandler", "prereq"];

    PREFIXES.iter().any(|p| stem.starts_with(p))
        || CONTAINS.iter().any(|c| stem.contains(c))
}

struct Candidate {
    /// judul game = nama folder tingkat-1 (atau nama file kalau exe langsung di root)
    title: String,
    /// path relatif ke root, pakai '/' biar portable lintas OS/drive
    rel_path: String,
    size: u64,
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn to_rel_string(rel: &Path) -> String {
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Kumpulkan kandidat game dari sebuah folder root.
/// Aturan: 1 subfolder tingkat-1 = 1 game; kalau ada beberapa exe kandidat,
/// pilih yang paling besar (heuristik "ini binary game utama").
fn collect_candidates(root: &Path) -> Result<(Vec<Candidate>, u32)> {
    let mut seen_exe: u32 = 0;
    let mut by_group: HashMap<String, Candidate> = HashMap::new();

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let is_exe = path
            .extension()
            .map(|e| e.eq_ignore_ascii_case("exe"))
            .unwrap_or(false);
        if !is_exe {
            continue;
        }
        seen_exe += 1;

        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if is_excluded(&stem) {
            continue;
        }

        let rel = match path.strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let first = rel
            .components()
            .next()
            .map(|c| c.as_os_str().to_string_lossy().into_owned());
        let Some(first) = first else { continue };

        // kalau komponen pertama == file itu sendiri, exe ada langsung di root
        let is_loose = rel.components().count() == 1;
        let title = if is_loose {
            path.file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| first.clone())
        } else {
            first.clone()
        };
        let group_key = if is_loose { format!("::loose::{first}") } else { first };

        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let cand = Candidate {
            title,
            rel_path: to_rel_string(rel),
            size,
        };
        by_group
            .entry(group_key)
            .and_modify(|existing| {
                if size > existing.size {
                    *existing = Candidate {
                        title: cand.title.clone(),
                        rel_path: cand.rel_path.clone(),
                        size,
                    };
                }
            })
            .or_insert(cand);
    }

    Ok((by_group.into_values().collect(), seen_exe))
}

#[tauri::command]
pub fn scan_root(
    config: tauri::State<ConfigState>,
    db: tauri::State<DbState>,
    root_id: String,
) -> Result<ScanResult> {
    let root_path = {
        let cfg = config.0.lock().unwrap();
        cfg.root(&root_id)?.path.clone()
    };
    let root = Path::new(&root_path);
    if !root.is_dir() {
        return Err(Error::msg(format!(
            "folder root tidak ada / tidak ter-mount: {root_path}"
        )));
    }

    let (candidates, seen_exe) = collect_candidates(root)?;

    let conn = db.0.lock().unwrap();
    let ts = now_unix();
    let mut added: u32 = 0;
    for c in &candidates {
        let n = conn.execute(
            "INSERT OR IGNORE INTO games (title, root_id, rel_path, launch_type, added_at)
             VALUES (?1, ?2, ?3, 'native', ?4)",
            rusqlite::params![c.title, root_id, c.rel_path, ts],
        )?;
        added += n as u32;
    }

    Ok(ScanResult {
        added,
        skipped: seen_exe.saturating_sub(added),
    })
}

#[derive(Debug, Serialize)]
pub struct ScanCandidate {
    pub rel_path: String,
    pub suggested_title: String,
}

/// Fase 2 Bulk Import langkah 1: kembalikan kandidat TANPA menyimpan,
/// sudah dibuang yang rel_path-nya sudah ada di library.
#[tauri::command]
pub fn scan_candidates(
    config: tauri::State<ConfigState>,
    db: tauri::State<DbState>,
    root_id: String,
) -> Result<Vec<ScanCandidate>> {
    let root_path = {
        let cfg = config.0.lock().unwrap();
        cfg.root(&root_id)?.path.clone()
    };
    let root = Path::new(&root_path);
    if !root.is_dir() {
        return Err(Error::msg(format!(
            "folder root tidak ada / tidak ter-mount: {root_path}"
        )));
    }

    let existing: std::collections::HashSet<String> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT rel_path FROM games WHERE root_id = ?1")?;
        let rows = stmt.query_map([&root_id], |r| r.get::<_, String>(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let (candidates, _) = collect_candidates(root)?;
    let mut out: Vec<ScanCandidate> = candidates
        .into_iter()
        .filter(|c| !existing.contains(&c.rel_path))
        .map(|c| ScanCandidate {
            rel_path: c.rel_path,
            suggested_title: c.title,
        })
        .collect();
    out.sort_by(|a, b| a.suggested_title.to_lowercase().cmp(&b.suggested_title.to_lowercase()));
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct ImportItem {
    pub rel_path: String,
    pub title: String,
}

/// Fase 2 Bulk Import langkah 2: simpan kandidat yang dicentang user.
#[tauri::command]
pub fn import_games(
    db: tauri::State<DbState>,
    root_id: String,
    items: Vec<ImportItem>,
) -> Result<u32> {
    let conn = db.0.lock().unwrap();
    let ts = now_unix();
    let mut added: u32 = 0;
    for it in &items {
        let title = if it.title.trim().is_empty() {
            it.rel_path.clone()
        } else {
            it.title.trim().to_string()
        };
        added += conn.execute(
            "INSERT OR IGNORE INTO games (title, root_id, rel_path, launch_type, added_at)
             VALUES (?1, ?2, ?3, 'native', ?4)",
            rusqlite::params![title, root_id, it.rel_path, ts],
        )? as u32;
    }
    Ok(added)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![0u8; bytes]).unwrap();
    }

    #[test]
    fn detects_games_and_skips_installers() {
        let tmp = std::env::temp_dir().join(format!("pwdg_scan_{}", now_unix()));
        let _ = fs::remove_dir_all(&tmp);
        touch(&tmp.join("Game Alpha/alpha.exe"), 500);
        touch(&tmp.join("Game Alpha/setup.exe"), 900); // lebih besar tapi harus di-skip
        touch(&tmp.join("Game Beta/beta.exe"), 300);
        touch(&tmp.join("_Redist/vcredist_x64.exe"), 100);

        let (cands, seen) = collect_candidates(&tmp).unwrap();
        assert_eq!(seen, 4, "harus lihat 4 exe");

        let mut titles: Vec<_> = cands.iter().map(|c| c.title.clone()).collect();
        titles.sort();
        assert_eq!(titles, vec!["Game Alpha", "Game Beta"]);

        let alpha = cands.iter().find(|c| c.title == "Game Alpha").unwrap();
        assert_eq!(alpha.rel_path, "Game Alpha/alpha.exe");

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn excluded_names() {
        assert!(is_excluded("setup"));
        assert!(is_excluded("unins000"));
        assert!(is_excluded("vc_redist.x64"));
        assert!(is_excluded("unitycrashhandler64"));
        assert!(!is_excluded("witcher3"));
        assert!(!is_excluded("game"));
    }
}
