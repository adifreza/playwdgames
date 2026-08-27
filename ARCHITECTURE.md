# Architecture & Development Guide

Konteks utama untuk siapa pun yang bekerja di repo ini. **Baca sampai habis sebelum
mengubah apa pun.** Update file ini kalau ada keputusan arsitektur baru.

---

## 1. Apa ini

Game launcher desktop, terinspirasi **Playnite** tapi lebih ringan, dengan mode
**fullscreen ala PS5**. Tujuan: memudahkan setup library game di HDD-HDD yang
didistribusikan ke customer, lengkap dengan integrasi emulator (PCSX2, RPCS3) dan
metadata otomatis.

**Bukan** SaaS / multi-user. Ini tool internal + aplikasi end-user lokal, single-user,
tanpa akun/login, offline-first.

Dua peran pengguna (dibedakan flag `operator_mode`, **bukan** build terpisah):
- **Operator** (`operator_mode: true`) = kamu/pemilik. Bisa scan, import, edit metadata,
  atur emulator, klik-kanan game. Menu Settings & tombol setup kelihatan.
- **Customer** (`operator_mode: false`) = pembeli HDD. Cuma browse + main. Semua UI
  setup disembunyikan.

---

## 2. Status: Fase 1–5 SELESAI

Roadmap asli sudah dikerjakan semua (2026-08). Yang berjalan:

| Fase | Isi | Status |
|------|-----|--------|
| 1 | Scanner exe + SQLite + grid Desktop Mode + `operator_mode` | ✅ |
| 2 | Metadata IGDB + SteamGridDB, Bulk Import 2-langkah, mode manual | ✅ |
| 3 | Fullscreen Mode PS5 (carousel, background blur, keyboard + Gamepad) | ✅ |
| 4 | Emulator Profile System (PCSX2/RPCS3/custom + manual action ala Playnite) | ✅ |
| 5 | Portabilitas path, relink drive, `scripts/make-portable.ps1` | ✅ |

Verifikasi terakhir: `cargo test` 13 hijau, `npm run build` + `npm run lint` bersih,
`npm run tauri build` menghasilkan `.exe` + MSI + NSIS.

Ide lanjutan (belum dikerjakan) ada di bagian 11.

---

## 3. Tech stack (TERKUNCI — jangan ganti tanpa alasan eksplisit)

- **Tauri v2** (Rust backend + WebView2 frontend). Dipilih di atas Electron karena
  requirement "tidak seberat Playnite".
- **Frontend**: React 19 + TypeScript (strict) + Tailwind CSS v4 + **Zustand** (state).
- **Backend**: Rust. `rusqlite` (bundled SQLite, tanpa dependency sistem).
- **HTTP**: `reqwest` (rustls, bukan OpenSSL).
- **Animasi**: `motion` (framer-motion v13, import dari `motion/react`).
- **Metadata API**: IGDB (via Twitch OAuth) + SteamGridDB. Opsional — app jalan tanpanya.
- **DB**: SQLite portable di `data/library.db`. **Bukan** cloud/server. Harus bisa
  dipindah HDD tanpa setup ulang.

---

## 4. Toolchain & cara build/run (PENTING — sering bikin bingung)

### Rust tidak ada di PATH shell default
`cargo`/`rustc` terpasang via `winget install Rustlang.Rustup` tapi **tidak masuk PATH**
otomatis di bash maupun PowerShell. Selalu prefix dulu:
```powershell
# PowerShell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```
```bash
# bash
export PATH="$HOME/.cargo/bin:$PATH"
```
MSVC linker datang dari **Visual Studio Community 2026 Insiders**
(`C:\Program Files\Microsoft Visual Studio\18\Insiders`) — cargo menemukannya sendiri.
WebView2 runtime sudah terpasang per-machine.

### Perintah

| Tujuan | Perintah |
|--------|----------|
| Dev (hot reload) | `npm run tauri dev` |
| Build exe saja (cepat) | `npm run tauri build -- --no-bundle` |
| Build + installer | `npm run tauri build` |
| Test Rust | `cd src-tauri && cargo test` |
| Typecheck + build frontend | `npm run build` |
| Lint frontend | `npm run lint` (oxlint) |
| Rakit folder portable customer | `powershell -File scripts/make-portable.ps1` |

### DEV vs RELEASE — beda folder `data/`

`data/` dibuat **di samping executable**:
- Dev: `src-tauri/target/debug/data/`
- Release: `src-tauri/target/release/data/`

Keduanya punya `config.json` + `library.db` + `covers/` + `heroes/` **terpisah**.
Kalau user bilang "sudah ke-scan tapi hilang", cek dia jalanin yang mana.
Setelah edit **frontend**, dev perlu di-restart (`Ctrl+C` lalu jalanin lagi) — HMR
kadang tidak cukup untuk perubahan besar. Setelah edit **Rust**, `tauri dev` recompile
otomatis.

### ⚠️ File di disk kadang kena mangle di luar sesi

Beberapa kali file berubah sendiri (mis. `$cfgPath` → `cfgPath` di skrip PowerShell,
whitespace aneh). Kemungkinan formatter/editor user. **Kalau skrip PS error, cek dulu
tanda `$` pada variabel.** Selalu re-read file sebelum edit.

---

## 5. Struktur folder (aktual)

```
/src                          React frontend
  main.tsx                    entry; matikan context menu bawaan WebView2 di sini
  App.tsx                     shell: TopBar + RelinkBanner + mode desktop/fullscreen + Settings drawer
  index.css                   Tailwind v4 @theme tokens (warna ink-*/accent-*, ease, radius)
  /lib
    ipc.ts                    SEMUA panggilan backend, typed. Satu-satunya tempat invoke().
    image.ts                  asset-protocol URL untuk gambar (convertFileSrc), cache-bust
    gamepad.ts                useGamepad() — poll Web Gamepad API
  /store/useStore.ts          Zustand: config, games, profiles, rootStatus, mode, selectedId
  /components                 Button, Cover, ContextMenu, Drawer, Sidebar, TopBar, GameCard, RelinkBanner
  /modes/desktop/DesktopMode.tsx     sidebar genre + grid + drawer detail + klik-kanan
  /modes/fullscreen/FullscreenMode.tsx   carousel PS5 + background + gamepad + klik-kanan
  /views
    BulkImport.tsx            modal: pilih folder → pindai → centang kandidat → import → auto-artwork
    GameDetail.tsx            drawer bertab: Umum / Gambar / Aksi Main (ala Playnite edit dialog)
    Settings.tsx              library roots, kredensial API, operator toggle, emulator profiles, refresh artwork

/src-tauri/src                Rust backend
  lib.rs                      registrasi command + state (ConfigState, DbState, MetaState)
  config.rs                   config.json (operator_mode, library_roots, credentials), data_dir()
  db.rs                       koneksi rusqlite + runner migrasi manual (PRAGMA user_version)
  scanner.rs                  walk folder, deteksi exe, filter installer, scan_candidates/import_games
  metadata.rs                 IGDB (OAuth Twitch) + SteamGridDB, download artwork, auto_match
  emulator.rs                 CRUD profil + build_launch_command (PURE, ada test) + set_game_launch
  games.rs                    list_games, launch_game, remove_game, get_data_dir, open_game_location, import_local_image
  paths.rs                    portablize_media / resolve_media (path media relatif ke root)
  error.rs                    enum Error (thiserror) → string ke frontend, type alias Result<T>
/src-tauri/migrations         001..004 .sql, di-include_str! di db.rs
/scripts/make-portable.ps1    rakit dist-portable/ (exe + data + operator_mode OFF + kredensial dibuang)
/docs/api-setup.md            panduan daftar Twitch Dev + SteamGridDB
```

---

## 6. Backend

### State (di `lib.rs`, semua `Mutex`)
- `ConfigState(Mutex<Config>)` — config.json in-memory. `cfg.save()` menulis balik.
- `DbState(Mutex<Connection>)` — satu koneksi rusqlite global.
  <!-- ponytail: cukup untuk single-user lokal, tak perlu pool -->
- `MetaState` — reqwest client + cache token IGDB.

### Migrasi (`db.rs`)
Manual, bukan crate. `const MIGRATIONS: &[&str]` = array `include_str!` file `.sql`
berurutan. Runner cek `PRAGMA user_version`, jalankan yang > versi sekarang, lalu
naikkan `user_version`. **Tambah migrasi = tambah file baru di akhir array, jangan
ubah yang lama.** `rusqlite_migration` sengaja tidak dipakai (konflik `libsqlite3-sys`).

### Skema `games` (setelah 4 migrasi)
```
id, title, root_id, rel_path, launch_type ('native'|'manual'|'pcsx2'|'rpcs3'|'custom'),
added_at, igdb_id, summary, genres ("A, B"), release_year, developer,
cover_path, hero_path (relatif ke data/, mis "covers/6.jpg"),
match_status ('unmatched'|'auto'|'manual'|'none'),
emulator_profile_id, game_media_path (portable, lihat paths.rs),
custom_exe, custom_args, custom_workdir (untuk launch_type='manual')
```
Tabel `emulator_profiles`: `id, name, kind, exe_path, default_args`.

### Command penting (semua di `ipc.ts` sisi frontend)
- **config**: `get_config` (balikin `PublicConfig` — TANPA secret mentah, ada `has_igdb`/
  `has_steamgriddb`), `set_credentials` (field kosong = biarkan lama), `set_operator_mode`,
  `add_library_root`, `remove_library_root`, `relink_root`, `check_library_roots`.
- **scan**: `scan_candidates(root_id)` (deteksi, TIDAK simpan, buang yang sudah ada) →
  `import_games(root_id, items)`. `scan_root` lama masih ada (scan+auto-import).
- **games**: `list_games` (resolve path + `available` flag), `launch_game` (pakai
  `build_launch_command`), `remove_game`, `get_data_dir`, `open_game_location`
  (explorer /select), `import_local_image(kind, src_path)`, `portablize_path`.
- **metadata** (async): `search_metadata(query)` (IGDB), `apply_metadata(game_id, igdb_id, auto)`,
  `auto_match(game_id)`, `fetch_artwork(game_id, rename)` (SteamGridDB SAJA — cover+hero+
  nama official), `set_game_fields(...)` (mode manual, terima `cover_url`/`hero_url`).
- **emulator**: `list_profiles`, `save_profile`, `delete_profile`,
  `set_game_launch(game_id, launch_type, {profileId, mediaPath, customExe, customArgs, customWorkdir})`.

### `build_launch_command` (emulator.rs) — fungsi MURNI, ada 5 test
Menentukan `{exe, args, cwd}` per `launch_type`:
- `native` → exe hasil scan, tanpa args
- `manual` → `custom_exe` + `custom_args` (split whitespace) + `custom_workdir`
- `pcsx2` → `profile.exe_path` + `default_args` + `--fullscreen <iso>`
- `rpcs3` → `profile.exe_path` + `default_args` + `--no-gui <folder>`
- `custom` → `profile.exe_path` + `default_args` + `<media>`

<!-- ponytail: split args naif (whitespace, tak handle kutip). Upgrade ke shell-words kalau perlu. -->

---

## 7. Frontend

### Gambar = asset protocol (BUKAN base64)
File hero landscape besar (3–4 MB); base64-over-IPC gagal diam-diam. Semua gambar
lewat **asset protocol**:
- `tauri.conf.json` → `app.security.assetProtocol { enable: true, scope: ["**"] }`
- `Cargo.toml` → `tauri` feature `protocol-asset` (WAJIB, kalau tidak build script error)
- `lib/image.ts`: `assetUrl(rel)` = `convertFileSrc(dataDir + '/' + rel)`, sinkron, tanpa IPC.
  `dataDir` di-fetch sekali via `get_data_dir` di `initImages()` (dipanggil di `store.init()`).
  `bustImage(rel)` menaikkan versi query param buat cache-bust setelah gambar diganti.
- `core:asset:default` **BUKAN** permission valid — jangan taruh di `capabilities/`.
- `image_data_url` command masih ada tapi tidak dipakai (fallback saja).

### Klik-kanan
Menu bawaan WebView2 dimatikan di `main.tsx`
(`window.addEventListener('contextmenu', e => e.preventDefault())`). Handler kartu
pakai `e.preventDefault()` + `e.stopPropagation()`. Komponen `ContextMenu.tsx`
diposisikan `fixed` di koordinat klik. Isi menu di DesktopMode & FullscreenMode.

### Fullscreen carousel
**Jangan pakai `element.scrollIntoView()`** — itu meng-scroll SEMUA ancestor termasuk
container `overflow-hidden`, bikin header/judul ke-clip. Pakai `row.scrollBy({left: delta})`
dengan delta dari `getBoundingClientRect`. Ada spacer kiri/kanan supaya tile pinggir
bisa ke tengah.

### Zustand store (`useStore.ts`)
`init()` (dipanggil sekali di App) → `initImages` + load config/games/profiles/rootStatus.
`refresh()` reload games+profiles+rootStatus. `reloadConfig()` reload config saja.
`setMode('fullscreen')` juga panggil `getCurrentWindow().setFullscreen(true)`.

---

## 8. Alur data penting

### Scan → Import → Metadata (operator)
1. Settings / BulkImport → tambah library root (folder di HDD).
2. BulkImport: `scan_candidates` → walk folder, 1 subfolder tingkat-1 = 1 game,
   pilih exe terbesar, buang installer (`setup`, `vcredist`, `unins*`, dll).
3. User centang + edit judul → `import_games` insert ke `games`.
4. Auto-artwork per game yang di-import:
   - Ada IGDB key → `auto_match` (judul + deskripsi + genre + cover, dari nama IGDB)
   - Cuma SteamGridDB key → `fetch_artwork` (cover + background + rename ke nama official SGDB)
   - Tanpa key → biarkan, operator isi manual di GameDetail → tab Umum/Gambar

### Launch
`launch_game` → ambil row → resolve exe native (`root.path + rel_path`) + media
(`resolve_media`) + profil emulator → `build_launch_command` → cek file ada →
`Command::spawn()` dengan cwd.

### Portabilitas (kenapa bisa pindah HDD)
- `games.rel_path` relatif ke library root; root path disimpan di config, di-resolve saat runtime.
- `game_media_path` disimpan sebagai `root::<rootId>::<rel>` kalau di bawah root (lihat `paths.rs`).
- Cover/hero relatif ke `data/`.
- Startup: `check_library_roots` → kalau drive tak terbaca, `RelinkBanner` muncul →
  `relink_root(id, newPath)`.
- `make-portable.ps1`: copy exe + `data/` (library.db + covers + heroes), set
  `operator_mode: false`, **kosongkan `credentials`** (jangan kirim API key kamu ke customer).

---

## 9. Konvensi kode

- **TypeScript**: strict, `no any` (kasih komentar alasan kalau terpaksa).
- **Rust**: semua command `Result<T, Error>`; **tidak ada `.unwrap()`** di jalur yang
  kena input user (path folder, config). `.lock().unwrap()` pada Mutex OK (bukan input user).
- **Tailwind v4**: pakai nama kanonis (`bg-linear-to-r` bukan `bg-gradient-to-r`).
  Warna dari token `@theme` di `index.css` (`ink-900`, `accent-400`, `fg-dim`, dst).
  Inline style hanya untuk nilai dinamis.
- **Komentar**: boleh Bahasa Indonesia. Nama fungsi/variabel Bahasa Inggris standar.
- **`ponytail:` comment** menandai shortcut sadar dengan ceiling + upgrade path.
- **Commit**: imperatif singkat — `feat: add exe scanner`, `fix: emulator path validation`.
- Logika non-trivial (parser, money/security path) tinggalkan 1 test (`#[test]` /
  `test_*.py`), tanpa framework.

## 10. Hal yang HARUS dihindari

- Jangan tambah UI lib berat (MUI/AntD) — Tailwind + komponen custom.
- Jangan hardcode API key di source — hanya di `data/config.json` (gitignored).
- Jangan asumsikan drive letter tetap (`D:\`) — semua path relatif ke root atau di-resolve ulang.
- Jangan bikin fitur cloud/online kecuali diminta eksplisit.
- Jangan kirim base64 gambar besar lewat IPC — pakai asset protocol.
- Jangan ubah migrasi lama; tambah file baru.
- Jangan taruh `core:asset:*` di capabilities.

---

## 11. Ide lanjutan (belum dikerjakan)

- **Multi-action per game** (ala Playnite penuh): sekarang 1 action/game. Kalau perlu
  launcher + config tool + mod manager per game → butuh tabel `game_actions` terpisah.
- **Icon aplikasi** masih default Tauri.
- **IGDB belum dipakai user** — baru punya SteamGridDB key. Kalau IGDB diisi,
  metadata teks (deskripsi/genre/tahun) jadi otomatis.
- Downscale hero art saat download (sekarang bisa 4 MB) — perlu image crate.
- Cross-platform (sekarang Windows-only: `explorer /select`, dll).

---

## 12. Kredensial API (untuk operator)

Cara daftar Twitch Developer + SteamGridDB ada di [docs/api-setup.md](docs/api-setup.md).
Customer **tidak perlu** API key — metadata sudah "dipanggang" ke `library.db` + `data/covers`
saat operator setup.
