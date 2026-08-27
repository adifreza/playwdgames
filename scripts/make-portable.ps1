# Rakit folder portable untuk dikopi ke HDD customer.
# Jalankan SETELAH kamu isi library (scan + import + metadata) lewat app,
# supaya data/library.db + data/covers ikut terbawa.
#   powershell -ExecutionPolicy Bypass -File scripts/make-portable.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$releaseDir = Join-Path $root 'src-tauri/target/release'
$exe = Join-Path $releaseDir 'playwdgames.exe'
$srcData = Join-Path $releaseDir 'data'
$out = Join-Path $root 'dist-portable'

if (-not (Test-Path $exe)) {
    throw "Build dulu: npm run tauri build  (tidak ketemu $exe)"
}

Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $out | Out-Null
Copy-Item $exe (Join-Path $out 'playwdgames.exe')

if (Test-Path $srcData) {
    Copy-Item $srcData (Join-Path $out 'data') -Recurse
} else {
    New-Item -ItemType Directory -Path (Join-Path $out 'data') | Out-Null
}

# config customer: operator_mode OFF + BUANG kredensial API (jangan ikut ke HDD customer)
$cfgPath = Join-Path $out 'data/config.json'
$roots = @()
if (Test-Path $cfgPath) {
    $old = Get-Content $cfgPath -Raw | ConvertFrom-Json
    if ($old.library_roots) { $roots = $old.library_roots }
}
[pscustomobject]@{
    operator_mode = $false
    library_roots = $roots
    credentials   = [pscustomobject]@{ igdb_client_id = ''; igdb_client_secret = ''; steamgriddb_key = '' }
} | ConvertTo-Json -Depth 6 | Set-Content -Path $cfgPath -Encoding utf8

# artwork & database tetap ikut (metadata sudah "dipanggang", customer tidak butuh API)
Write-Host "Kredensial API dibuang dari salinan customer."

@'
PlayWD Games (portable)

Jalankan playwdgames.exe. Semua data ada di folder data\ di sebelahnya.
Folder ini boleh dikopi ke HDD/PC lain apa adanya (drive letter bebas).
'@ | Set-Content -Path (Join-Path $out 'BACA-SAYA.txt') -Encoding utf8

Write-Host "Selesai -> $out"
