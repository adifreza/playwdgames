# Cara Dapat Kredensial Metadata

Aplikasi tetap jalan tanpa ini (metadata diisi manual). Isi ini kalau mau
judul + cover + deskripsi otomatis.

Semua key disimpan lokal di `data/config.json` (gitignored), tidak dikirim ke mana-mana
selain API resminya.

---

## 1. IGDB (via Twitch Developer) — judul, deskripsi, genre, tahun, developer

IGDB dimiliki Twitch, jadi autentikasinya lewat akun Twitch.

1. Buat/siapkan akun Twitch biasa, lalu aktifkan 2FA di
   <https://www.twitch.tv/settings/security> (wajib, kalau tidak nanti ditolak).
2. Buka <https://dev.twitch.tv/console> → **Log in** → menu **Applications** →
   **Register Your Application**.
3. Isi:
   - **Name**: bebas, mis. `playwdgames-local`
   - **OAuth Redirect URLs**: `http://localhost` (tidak dipakai, tapi wajib diisi)
   - **Category**: `Application Integration`
   - **Client Type**: `Confidential`
4. **Create**. Buka lagi aplikasi yang barusan dibuat:
   - **Client ID** → copy
   - **Client Secret** → klik **New Secret** → copy (muncul sekali)
5. Di app: **Settings → Koneksi Metadata → IGDB (Twitch)**, tempel Client ID + Client
   Secret, **Simpan**. Badge berubah jadi "terhubung".

Dokumen resmi: <https://api-docs.igdb.com/#getting-started>
Rate limit: 4 request/detik, cukup untuk scan biasa.

---

## 2. SteamGridDB — cover art & background resolusi tinggi

Opsional tapi sangat disarankan — cover-nya jauh lebih rapi daripada bawaan IGDB.

1. Login/daftar di <https://www.steamgriddb.com/> (bisa pakai Steam).
2. Buka **Preferences → API** langsung: <https://www.steamgriddb.com/profile/preferences/api>
3. **Generate API Key** → copy.
4. Di app: **Settings → Koneksi Metadata → SteamGridDB**, tempel key, **Simpan**.

Kalau SteamGridDB tidak diisi, cover diambil dari IGDB (tetap ada, resolusi lebih kecil).

---

## Urutan pemakaian di app

1. Isi kredensial di Settings.
2. **+ Tambah Game** → pilih folder → **Pindai** → centang kandidat → **Import**.
   Kalau IGDB sudah terhubung, auto-match jalan otomatis setelah import.
3. Hasil kurang pas? Buka game → **Metadata** → **Auto-match** ulang, cari manual,
   atau isi judul/cover sendiri.
