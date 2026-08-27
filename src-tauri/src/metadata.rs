use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::config::{data_subdir, ConfigState, Credentials};
use crate::db::DbState;
use crate::error::{Error, Result};

pub struct MetaState {
    client: reqwest::Client,
    /// (token, kapan kedaluwarsa) — hasil client_credentials Twitch.
    igdb_token: Mutex<Option<(String, Instant)>>,
}

impl MetaState {
    pub fn new() -> Self {
        MetaState {
            client: reqwest::Client::builder()
                .user_agent("playwdgames/0.1")
                .build()
                .expect("gagal buat http client"),
            igdb_token: Mutex::new(None),
        }
    }
}

/// Kandidat metadata untuk ditampilkan di UI "ganti metadata".
#[derive(Debug, Serialize, Clone)]
pub struct MetaHit {
    pub igdb_id: i64,
    pub name: String,
    pub summary: Option<String>,
    pub genres: Option<String>,
    pub release_year: Option<i64>,
    pub developer: Option<String>,
    pub cover_url: Option<String>,
}

// ---------- IGDB ----------

#[derive(Deserialize)]
struct TokenResp {
    access_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct IgdbNamed {
    name: String,
}
#[derive(Deserialize)]
struct IgdbCover {
    image_id: String,
}
#[derive(Deserialize)]
struct IgdbInvolved {
    developer: bool,
    company: IgdbNamed,
}
#[derive(Deserialize)]
struct IgdbGame {
    id: i64,
    name: String,
    summary: Option<String>,
    first_release_date: Option<i64>,
    genres: Option<Vec<IgdbNamed>>,
    cover: Option<IgdbCover>,
    involved_companies: Option<Vec<IgdbInvolved>>,
}

impl IgdbGame {
    fn into_hit(self) -> MetaHit {
        let genres = self.genres.map(|g| {
            g.into_iter()
                .map(|n| n.name)
                .collect::<Vec<_>>()
                .join(", ")
        });
        let developer = self.involved_companies.and_then(|list| {
            list.into_iter()
                .find(|c| c.developer)
                .map(|c| c.company.name)
        });
        let cover_url = self
            .cover
            .map(|c| format!("https://images.igdb.com/igdb/image/upload/t_cover_big/{}.jpg", c.image_id));
        MetaHit {
            igdb_id: self.id,
            name: self.name,
            summary: self.summary,
            // ponytail: konversi epoch→tahun pakai rata-rata detik/tahun; cukup untuk label
            release_year: self.first_release_date.map(|s| s / 31_556_952 + 1970),
            genres,
            developer,
            cover_url,
        }
    }
}

async fn igdb_token(meta: &MetaState, cred: &Credentials) -> Result<String> {
    if let Some((tok, exp)) = meta.igdb_token.lock().unwrap().as_ref() {
        if *exp > Instant::now() {
            return Ok(tok.clone());
        }
    }
    let resp: TokenResp = meta
        .client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", cred.igdb_client_id.as_str()),
            ("client_secret", cred.igdb_client_secret.as_str()),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|e| Error::msg(format!("gagal auth Twitch: {e}")))?
        .error_for_status()
        .map_err(|e| Error::msg(format!("Twitch menolak kredensial: {e}")))?
        .json()
        .await
        .map_err(|e| Error::msg(format!("respons token tidak terbaca: {e}")))?;

    let exp = Instant::now() + Duration::from_secs(resp.expires_in.saturating_sub(60));
    *meta.igdb_token.lock().unwrap() = Some((resp.access_token.clone(), exp));
    Ok(resp.access_token)
}

async fn igdb_query(meta: &MetaState, cred: &Credentials, body: String) -> Result<Vec<IgdbGame>> {
    let token = igdb_token(meta, cred).await?;
    let games: Vec<IgdbGame> = meta
        .client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", cred.igdb_client_id.clone())
        .bearer_auth(token)
        .body(body)
        .send()
        .await
        .map_err(|e| Error::msg(format!("gagal hubungi IGDB: {e}")))?
        .error_for_status()
        .map_err(|e| Error::msg(format!("IGDB error: {e}")))?
        .json()
        .await
        .map_err(|e| Error::msg(format!("respons IGDB tidak terbaca: {e}")))?;
    Ok(games)
}

const IGDB_FIELDS: &str = "fields name, summary, first_release_date, genres.name, cover.image_id, involved_companies.developer, involved_companies.company.name;";

fn credentials(config: &tauri::State<ConfigState>) -> Credentials {
    config.0.lock().unwrap().credentials.clone()
}

// ---------- SteamGridDB ----------

#[derive(Deserialize)]
struct SgdbList<T> {
    data: Vec<T>,
}
#[derive(Deserialize)]
struct SgdbGame {
    id: i64,
    #[serde(default)]
    name: String,
}
#[derive(Deserialize)]
struct SgdbImage {
    url: String,
}

/// Cari game di SteamGridDB, kembalikan (id, nama official) hasil teratas.
async fn sgdb_search(meta: &MetaState, key: &str, name: &str) -> Result<Option<(i64, String)>> {
    let search: SgdbList<SgdbGame> = meta
        .client
        .get(format!(
            "https://www.steamgriddb.com/api/v2/search/autocomplete/{}",
            urlencoding(name)
        ))
        .bearer_auth(key)
        .send()
        .await
        .map_err(|e| Error::msg(format!("gagal hubungi SteamGridDB: {e}")))?
        .error_for_status()
        .map_err(|e| Error::msg(format!("SteamGridDB error: {e}")))?
        .json()
        .await
        .map_err(|e| Error::msg(format!("respons SteamGridDB tidak terbaca: {e}")))?;
    Ok(search.data.into_iter().next().map(|g| (g.id, g.name)))
}

async fn sgdb_image_for(
    meta: &MetaState,
    key: &str,
    sgdb_id: i64,
    endpoint: &str, // "grids" | "heroes"
    query: &str,
) -> Result<Option<String>> {
    let images: SgdbList<SgdbImage> = meta
        .client
        .get(format!(
            "https://www.steamgriddb.com/api/v2/{endpoint}/game/{sgdb_id}?{query}"
        ))
        .bearer_auth(key)
        .send()
        .await
        .map_err(|e| Error::msg(format!("gagal ambil gambar SteamGridDB: {e}")))?
        .error_for_status()
        .map_err(|e| Error::msg(format!("SteamGridDB error: {e}")))?
        .json()
        .await
        .map_err(|e| Error::msg(format!("respons gambar tidak terbaca: {e}")))?;
    Ok(images.data.into_iter().next().map(|i| i.url))
}

/// Encoding minimal untuk segmen URL (spasi & karakter umum).
fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

// ---------- download artwork ----------

async fn download_to(meta: &MetaState, url: &str, subdir: &str, filename: &str) -> Result<String> {
    let bytes = meta
        .client
        .get(url)
        .send()
        .await
        .map_err(|e| Error::msg(format!("gagal unduh gambar: {e}")))?
        .error_for_status()
        .map_err(|e| Error::msg(format!("gambar tidak tersedia: {e}")))?
        .bytes()
        .await
        .map_err(|e| Error::msg(format!("gagal baca gambar: {e}")))?;
    let dir = data_subdir(subdir)?;
    std::fs::write(dir.join(filename), &bytes)?;
    Ok(format!("{subdir}/{filename}"))
}

#[derive(Default)]
struct SgdbArtwork {
    /// nama official game dari SteamGridDB (buat koreksi judul)
    official_name: Option<String>,
    cover_path: Option<String>,
    hero_path: Option<String>,
}

/// Cari game di SteamGridDB berdasarkan `name`, lalu unduh cover (grid 600x900)
/// & hero. Kembalikan juga nama official-nya.
async fn sgdb_artwork(meta: &MetaState, key: &str, name: &str, game_id: i64) -> SgdbArtwork {
    let Ok(Some((sgdb_id, official))) = sgdb_search(meta, key, name).await else {
        return SgdbArtwork::default();
    };
    let cover = match sgdb_image_for(
        meta,
        key,
        sgdb_id,
        "grids",
        "dimensions=600x900&types=static&limit=1",
    )
    .await
    {
        Ok(Some(url)) => download_to(meta, &url, "covers", &format!("{game_id}.jpg")).await.ok(),
        _ => None,
    };
    let hero = match sgdb_image_for(meta, key, sgdb_id, "heroes", "types=static&limit=1").await {
        Ok(Some(url)) => download_to(meta, &url, "heroes", &format!("{game_id}.jpg")).await.ok(),
        _ => None,
    };
    SgdbArtwork {
        official_name: Some(official).filter(|s| !s.trim().is_empty()),
        cover_path: cover,
        hero_path: hero,
    }
}

// ---------- commands ----------

/// Ambil artwork + nama official dari SteamGridDB (tanpa perlu IGDB).
/// Judul game saat ini dipakai sebagai kata kunci pencarian; kalau ketemu,
/// judul di-update ke nama official SteamGridDB.
#[tauri::command]
pub async fn fetch_artwork(
    meta: tauri::State<'_, MetaState>,
    config: tauri::State<'_, ConfigState>,
    db: tauri::State<'_, DbState>,
    game_id: i64,
    rename: Option<bool>,
) -> Result<bool> {
    let cred = credentials(&config);
    if !cred.has_steamgriddb() {
        return Err(Error::msg(
            "SteamGridDB belum dikonfigurasi (Settings → Koneksi Metadata).",
        ));
    }
    let title: String = {
        let conn = db.0.lock().unwrap();
        conn.query_row("SELECT title FROM games WHERE id = ?1", [game_id], |r| r.get(0))?
    };

    let art = sgdb_artwork(&meta, &cred.steamgriddb_key, &title, game_id).await;
    let found = art.official_name.is_some() || art.cover_path.is_some();
    let new_title = if rename.unwrap_or(true) {
        art.official_name.clone()
    } else {
        None
    };

    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE games SET
            title = COALESCE(?1, title),
            cover_path = COALESCE(?2, cover_path),
            hero_path = COALESCE(?3, hero_path),
            match_status = CASE WHEN match_status = 'unmatched' THEN 'manual' ELSE match_status END
         WHERE id = ?4",
        rusqlite::params![new_title, art.cover_path, art.hero_path, game_id],
    )?;
    Ok(found)
}

#[tauri::command]
pub async fn search_metadata(
    meta: tauri::State<'_, MetaState>,
    config: tauri::State<'_, ConfigState>,
    query: String,
) -> Result<Vec<MetaHit>> {
    let cred = credentials(&config);
    if !cred.has_igdb() {
        return Err(Error::msg(
            "IGDB belum dikonfigurasi. Isi kredensial di Settings, atau isi metadata manual.",
        ));
    }
    let q = query.replace('"', " ");
    let body = format!("search \"{q}\"; {IGDB_FIELDS} limit 12;");
    let games = igdb_query(&meta, &cred, body).await?;
    Ok(games.into_iter().map(IgdbGame::into_hit).collect())
}

/// Ambil detail 1 game IGDB + artwork, simpan ke row.
#[tauri::command]
pub async fn apply_metadata(
    meta: tauri::State<'_, MetaState>,
    config: tauri::State<'_, ConfigState>,
    db: tauri::State<'_, DbState>,
    game_id: i64,
    igdb_id: i64,
    auto: bool,
) -> Result<MetaHit> {
    let cred = credentials(&config);
    apply_metadata_inner(&meta, &db, &cred, game_id, igdb_id, auto).await
}

async fn apply_metadata_inner(
    meta: &MetaState,
    db: &DbState,
    cred: &Credentials,
    game_id: i64,
    igdb_id: i64,
    auto: bool,
) -> Result<MetaHit> {
    if !cred.has_igdb() {
        return Err(Error::msg("IGDB belum dikonfigurasi."));
    }
    let body = format!("{IGDB_FIELDS} where id = {igdb_id}; limit 1;");
    let hit = igdb_query(&meta, &cred, body)
        .await?
        .into_iter()
        .next()
        .map(IgdbGame::into_hit)
        .ok_or_else(|| Error::msg("game IGDB tidak ditemukan"))?;

    // artwork: SteamGridDB dulu (kualitas lebih baik), fallback cover IGDB.
    // Judul tetap pakai nama IGDB (lebih kanonis daripada SGDB).
    let art = if cred.has_steamgriddb() {
        sgdb_artwork(meta, &cred.steamgriddb_key, &hit.name, game_id).await
    } else {
        SgdbArtwork::default()
    };
    let mut cover_path = art.cover_path;
    let hero_path = art.hero_path;
    if cover_path.is_none() {
        if let Some(url) = &hit.cover_url {
            cover_path = download_to(&meta, url, "covers", &format!("{game_id}.jpg")).await.ok();
        }
    }

    let status = if auto { "auto" } else { "manual" };
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE games SET title = ?1, igdb_id = ?2, summary = ?3, genres = ?4,
            release_year = ?5, developer = ?6, match_status = ?7,
            cover_path = COALESCE(?8, cover_path), hero_path = COALESCE(?9, hero_path)
         WHERE id = ?10",
        rusqlite::params![
            hit.name,
            hit.igdb_id,
            hit.summary,
            hit.genres,
            hit.release_year,
            hit.developer,
            status,
            cover_path,
            hero_path,
            game_id,
        ],
    )?;
    Ok(hit)
}

/// Auto-match: cari judul game di IGDB, pakai hasil teratas.
#[tauri::command]
pub async fn auto_match(
    meta: tauri::State<'_, MetaState>,
    config: tauri::State<'_, ConfigState>,
    db: tauri::State<'_, DbState>,
    game_id: i64,
) -> Result<Option<MetaHit>> {
    let cred = credentials(&config);
    if !cred.has_igdb() {
        return Err(Error::msg("IGDB belum dikonfigurasi."));
    }
    let title: String = {
        let conn = db.0.lock().unwrap();
        conn.query_row("SELECT title FROM games WHERE id = ?1", [game_id], |r| r.get(0))?
    };
    let q = title.replace('"', " ");
    let body = format!("search \"{q}\"; fields id; limit 1;");
    let top = igdb_query(&meta, &cred, body).await?.into_iter().next();

    match top {
        Some(g) => {
            let hit = apply_metadata_inner(&meta, &db, &cred, game_id, g.id, true).await?;
            Ok(Some(hit))
        }
        None => {
            db.0.lock().unwrap().execute(
                "UPDATE games SET match_status = 'none' WHERE id = ?1",
                [game_id],
            )?;
            Ok(None)
        }
    }
}

/// Set field manual (jalan tanpa API key). `cover_url` kalau ada akan diunduh.
#[tauri::command]
pub async fn set_game_fields(
    meta: tauri::State<'_, MetaState>,
    db: tauri::State<'_, DbState>,
    game_id: i64,
    title: Option<String>,
    summary: Option<String>,
    genres: Option<String>,
    release_year: Option<i64>,
    developer: Option<String>,
    cover_url: Option<String>,
    hero_url: Option<String>,
) -> Result<()> {
    let cover_path = match cover_url {
        Some(u) if !u.trim().is_empty() => {
            Some(download_to(&meta, u.trim(), "covers", &format!("{game_id}.jpg")).await?)
        }
        _ => None,
    };
    let hero_path = match hero_url {
        Some(u) if !u.trim().is_empty() => {
            Some(download_to(&meta, u.trim(), "heroes", &format!("{game_id}.jpg")).await?)
        }
        _ => None,
    };

    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE games SET
            title = COALESCE(?1, title),
            summary = COALESCE(?2, summary),
            genres = COALESCE(?3, genres),
            release_year = COALESCE(?4, release_year),
            developer = COALESCE(?5, developer),
            cover_path = COALESCE(?6, cover_path),
            hero_path = COALESCE(?7, hero_path),
            match_status = 'manual'
         WHERE id = ?8",
        rusqlite::params![
            title, summary, genres, release_year, developer, cover_path, hero_path, game_id
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencode_basic() {
        assert_eq!(urlencoding("Hollow Knight"), "Hollow%20Knight");
        assert_eq!(urlencoding("zelda"), "zelda");
    }

    #[test]
    fn igdb_year_conversion() {
        let g = IgdbGame {
            id: 1,
            name: "X".into(),
            summary: None,
            first_release_date: Some(1_500_000_000), // 2017
            genres: None,
            cover: None,
            involved_companies: None,
        };
        assert_eq!(g.into_hit().release_year, Some(2017));
    }
}
