use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

/// Folder data portable: `data/` di samping executable.
/// Semua state (config.json + library.db + artwork) hidup di sini supaya folder
/// aplikasi bisa dipindah antar-HDD tanpa setup ulang.
pub fn data_dir() -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let dir = exe
        .parent()
        .ok_or_else(|| Error::msg("tidak bisa menentukan folder executable"))?
        .join("data");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Subfolder di dalam `data/`, dibuat kalau belum ada.
pub fn data_subdir(name: &str) -> Result<PathBuf> {
    let dir = data_dir()?.join(name);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn config_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("config.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryRoot {
    pub id: String,
    pub label: String,
    pub path: String,
}

/// Kredensial API. Tersimpan lokal di config.json (gitignored), tidak pernah
/// dikirim balik mentah ke frontend — lihat `PublicConfig`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Credentials {
    pub igdb_client_id: String,
    pub igdb_client_secret: String,
    pub steamgriddb_key: String,
}

impl Credentials {
    pub fn has_igdb(&self) -> bool {
        !self.igdb_client_id.trim().is_empty() && !self.igdb_client_secret.trim().is_empty()
    }
    pub fn has_steamgriddb(&self) -> bool {
        !self.steamgriddb_key.trim().is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub operator_mode: bool,
    pub library_roots: Vec<LibraryRoot>,
    pub credentials: Credentials,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            operator_mode: true,
            library_roots: Vec::new(),
            credentials: Credentials::default(),
        }
    }
}

impl Config {
    pub fn load() -> Result<Config> {
        let path = config_path()?;
        if !path.exists() {
            let cfg = Config::default();
            cfg.save()?;
            return Ok(cfg);
        }
        let raw = fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&raw)?)
    }

    pub fn save(&self) -> Result<()> {
        let raw = serde_json::to_string_pretty(self)?;
        fs::write(config_path()?, raw)?;
        Ok(())
    }

    pub fn root(&self, id: &str) -> Result<&LibraryRoot> {
        self.library_roots
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| Error::msg(format!("library root '{id}' tidak ditemukan")))
    }
}

/// Versi config yang aman dikirim ke frontend: tanpa secret mentah.
#[derive(Debug, Serialize)]
pub struct PublicConfig {
    pub operator_mode: bool,
    pub library_roots: Vec<LibraryRoot>,
    pub has_igdb: bool,
    pub has_steamgriddb: bool,
}

impl From<&Config> for PublicConfig {
    fn from(c: &Config) -> Self {
        PublicConfig {
            operator_mode: c.operator_mode,
            library_roots: c.library_roots.clone(),
            has_igdb: c.credentials.has_igdb(),
            has_steamgriddb: c.credentials.has_steamgriddb(),
        }
    }
}

/// State config yang dipegang Tauri, dibungkus Mutex untuk akses dari command.
pub struct ConfigState(pub Mutex<Config>);

// ---- commands ----

#[tauri::command]
pub fn get_config(state: tauri::State<ConfigState>) -> Result<PublicConfig> {
    Ok(PublicConfig::from(&*state.0.lock().unwrap()))
}

#[tauri::command]
pub fn set_operator_mode(state: tauri::State<ConfigState>, enabled: bool) -> Result<()> {
    let mut cfg = state.0.lock().unwrap();
    cfg.operator_mode = enabled;
    cfg.save()
}

/// Simpan kredensial. Field kosong = biarkan nilai lama (biar user tidak perlu
/// ketik ulang secret tiap kali ubah satu field).
#[tauri::command]
pub fn set_credentials(
    state: tauri::State<ConfigState>,
    igdb_client_id: Option<String>,
    igdb_client_secret: Option<String>,
    steamgriddb_key: Option<String>,
) -> Result<PublicConfig> {
    let mut cfg = state.0.lock().unwrap();
    if let Some(v) = igdb_client_id {
        if !v.trim().is_empty() {
            cfg.credentials.igdb_client_id = v.trim().to_string();
        }
    }
    if let Some(v) = igdb_client_secret {
        if !v.trim().is_empty() {
            cfg.credentials.igdb_client_secret = v.trim().to_string();
        }
    }
    if let Some(v) = steamgriddb_key {
        if !v.trim().is_empty() {
            cfg.credentials.steamgriddb_key = v.trim().to_string();
        }
    }
    cfg.save()?;
    Ok(PublicConfig::from(&*cfg))
}

#[tauri::command]
pub fn add_library_root(
    state: tauri::State<ConfigState>,
    path: String,
    label: Option<String>,
) -> Result<LibraryRoot> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(Error::msg(format!("folder tidak valid: {path}")));
    }
    let label = label
        .filter(|s| !s.trim().is_empty())
        .or_else(|| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_else(|| path.clone());

    let root = LibraryRoot {
        id: uuid::Uuid::new_v4().to_string(),
        label,
        path,
    };
    let mut cfg = state.0.lock().unwrap();
    cfg.library_roots.push(root.clone());
    cfg.save()?;
    Ok(root)
}

#[tauri::command]
pub fn remove_library_root(state: tauri::State<ConfigState>, id: String) -> Result<()> {
    let mut cfg = state.0.lock().unwrap();
    cfg.library_roots.retain(|r| r.id != id);
    cfg.save()
}

/// Ubah path root yang sudah ada (buat relink kalau drive letter berubah).
#[tauri::command]
pub fn relink_root(state: tauri::State<ConfigState>, id: String, new_path: String) -> Result<()> {
    if !PathBuf::from(&new_path).is_dir() {
        return Err(Error::msg(format!("folder tidak valid: {new_path}")));
    }
    let mut cfg = state.0.lock().unwrap();
    let root = cfg
        .library_roots
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| Error::msg("root tidak ditemukan"))?;
    root.path = new_path;
    cfg.save()
}

/// Cek ketersediaan tiap root (drive ter-mount / folder ada).
#[tauri::command]
pub fn check_library_roots(state: tauri::State<ConfigState>) -> Result<Vec<RootStatus>> {
    let cfg = state.0.lock().unwrap();
    Ok(cfg
        .library_roots
        .iter()
        .map(|r| RootStatus {
            id: r.id.clone(),
            available: PathBuf::from(&r.path).is_dir(),
        })
        .collect())
}

#[derive(Debug, Serialize)]
pub struct RootStatus {
    pub id: String,
    pub available: bool,
}
