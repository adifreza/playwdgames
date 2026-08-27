import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '../components/Button'
import { Cover } from '../components/Cover'
import { ipc, type Game, type MetaHit } from '../lib/ipc'
import { bustImage } from '../lib/image'
import { useStore } from '../store/useStore'

export type DetailTab = 'umum' | 'gambar' | 'aksi'

interface Props {
  game: Game
  initialTab?: DetailTab
  onClose: () => void
}

export function GameDetail({ game, initialTab = 'umum', onClose }: Props) {
  const operator = useStore((s) => s.config?.operator_mode ?? false)
  const launch = useStore((s) => s.launch)
  const removeGame = useStore((s) => s.removeGame)
  const [tab, setTab] = useState<DetailTab>(operator ? initialTab : 'umum')

  const tabBtn = (id: DetailTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-3 py-2 text-sm transition-colors ${
        tab === id ? 'border-b-2 border-accent-400 text-fg' : 'text-fg-mute hover:text-fg'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-40 shrink-0 overflow-hidden">
        <Cover path={game.hero_path ?? game.cover_path} title={game.title} className="blur-[1px]" />
        <div className="absolute inset-0 bg-linear-to-t from-ink-850 to-transparent" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1 text-sm hover:bg-black/70"
        >
          ✕
        </button>
      </div>

      <div className="-mt-14 flex gap-4 px-5">
        <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          <Cover path={game.cover_path} title={game.title} />
        </div>
        <div className="mt-12 min-w-0">
          <h2 className="truncate text-lg font-semibold">{game.title}</h2>
          <p className="text-xs text-fg-dim">
            {[game.release_year, game.developer].filter(Boolean).join(' · ') || 'Belum ada metadata'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-5 py-3">
        <Button variant="primary" onClick={() => launch(game.id)}>
          ▶ Main
        </Button>
        {operator && (
          <Button variant="danger" onClick={() => removeGame(game.id)}>
            Hapus
          </Button>
        )}
      </div>

      {operator && (
        <div className="flex gap-1 border-b border-white/5 px-4">
          {tabBtn('umum', 'Umum')}
          {tabBtn('gambar', 'Gambar')}
          {tabBtn('aksi', 'Aksi Main')}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!operator || tab === 'umum' ? (
          <UmumTab game={game} operator={operator} />
        ) : tab === 'gambar' ? (
          <GambarTab game={game} />
        ) : (
          <AksiTab game={game} />
        )}
      </div>
    </div>
  )
}

// ---------- Umum: metadata teks + search IGDB ----------

function UmumTab({ game, operator }: { game: Game; operator: boolean }) {
  const hasIgdb = useStore((s) => s.config?.has_igdb ?? false)
  const refresh = useStore((s) => s.refresh)
  const [q, setQ] = useState(game.title)
  const [hits, setHits] = useState<MetaHit[]>([])
  const [busy, setBusy] = useState<'search' | 'auto' | 'save' | null>(null)
  const [f, setF] = useState({
    title: game.title,
    developer: game.developer ?? '',
    year: game.release_year?.toString() ?? '',
    genres: game.genres ?? '',
    summary: game.summary ?? '',
  })

  const done = async () => {
    if (game.cover_path) bustImage(game.cover_path)
    await refresh()
  }

  const search = async () => {
    setBusy('search')
    try {
      setHits(await ipc.searchMetadata(q))
    } catch (e) {
      alert(String(e))
    } finally {
      setBusy(null)
    }
  }

  const autoMatch = async () => {
    setBusy('auto')
    try {
      const hit = await ipc.autoMatch(game.id)
      await done()
      if (!hit) alert('Tidak ada hasil cocok di IGDB.')
    } catch (e) {
      alert(String(e))
    } finally {
      setBusy(null)
    }
  }

  const pick = async (h: MetaHit) => {
    try {
      await ipc.applyMetadata(game.id, h.igdb_id, false)
      await done()
    } catch (e) {
      alert(String(e))
    }
  }

  const saveFields = async () => {
    setBusy('save')
    try {
      await ipc.setGameFields(game.id, {
        title: f.title || undefined,
        developer: f.developer || undefined,
        release_year: f.year ? Number(f.year) : undefined,
        genres: f.genres || undefined,
        summary: f.summary || undefined,
      })
      await done()
    } catch (e) {
      alert(String(e))
    } finally {
      setBusy(null)
    }
  }

  if (!operator) {
    return (
      <>
        {game.genres && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {game.genres.split(',').map((g) => (
              <span key={g} className="rounded-full bg-ink-800 px-2.5 py-0.5 text-xs text-fg-dim">
                {g.trim()}
              </span>
            ))}
          </div>
        )}
        <p className="whitespace-pre-line text-sm leading-relaxed text-fg-dim">
          {game.summary || 'Belum ada deskripsi.'}
        </p>
      </>
    )
  }

  return (
    <div className="space-y-4 text-sm">
      {hasIgdb && (
        <div className="space-y-2 rounded-lg bg-ink-850 p-3">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Cari judul di IGDB…"
              className="flex-1 rounded-lg bg-ink-800 px-3 py-2"
            />
            <Button onClick={search} disabled={busy != null}>
              {busy === 'search' ? '…' : 'Cari'}
            </Button>
            <Button onClick={autoMatch} disabled={busy != null}>
              {busy === 'auto' ? '…' : '✨ Auto'}
            </Button>
          </div>
          {hits.map((h) => (
            <button
              key={h.igdb_id}
              type="button"
              onClick={() => pick(h)}
              className="flex w-full gap-3 rounded-lg bg-ink-800 p-2 text-left hover:bg-ink-700"
            >
              <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-900">
                {h.cover_url && <img src={h.cover_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {h.name} <span className="text-fg-mute">{h.release_year ? `(${h.release_year})` : ''}</span>
                </div>
                <div className="line-clamp-2 text-xs text-fg-dim">{h.summary}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Field label="Judul" value={f.title} onChange={(v) => setF({ ...f, title: v })} />
        <div className="flex gap-2">
          <Field label="Developer" value={f.developer} onChange={(v) => setF({ ...f, developer: v })} />
          <Field label="Tahun" value={f.year} onChange={(v) => setF({ ...f, year: v })} width="w-24" />
        </div>
        <Field
          label="Genre (pisah koma)"
          value={f.genres}
          onChange={(v) => setF({ ...f, genres: v })}
        />
        <label className="block">
          <span className="mb-1 block text-xs text-fg-mute">Deskripsi</span>
          <textarea
            value={f.summary}
            onChange={(e) => setF({ ...f, summary: e.target.value })}
            rows={5}
            className="w-full rounded-lg bg-ink-800 px-3 py-2"
          />
        </label>
        <Button variant="primary" onClick={saveFields} disabled={busy != null}>
          {busy === 'save' ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  width = 'flex-1',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  width?: string
}) {
  return (
    <label className={`block ${width}`}>
      <span className="mb-1 block text-xs text-fg-mute">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-ink-800 px-3 py-2"
      />
    </label>
  )
}

// ---------- Gambar: cover + background ----------

function GambarTab({ game }: { game: Game }) {
  const hasSgdb = useStore((s) => s.config?.has_steamgriddb ?? false)
  const refresh = useStore((s) => s.refresh)
  const [busy, setBusy] = useState(false)

  const done = async () => {
    if (game.cover_path) bustImage(game.cover_path)
    if (game.hero_path) bustImage(game.hero_path)
    await refresh()
  }

  const fromSgdb = async () => {
    setBusy(true)
    try {
      const found = await ipc.fetchArtwork(game.id)
      await done()
      if (!found) alert('SteamGridDB tidak menemukan artwork untuk judul ini.')
    } catch (e) {
      alert(String(e))
    } finally {
      setBusy(false)
    }
  }

  const fromUrl = async (kind: 'cover' | 'hero') => {
    const url = prompt(`URL ${kind === 'cover' ? 'cover' : 'background'} (https://…)`)
    if (!url) return
    try {
      await ipc.setGameFields(game.id, kind === 'cover' ? { cover_url: url } : { hero_url: url })
      await done()
    } catch (e) {
      alert(String(e))
    }
  }

  const fromFile = async (kind: 'cover' | 'hero') => {
    const p = await open({ multiple: false, filters: [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
    if (typeof p !== 'string') return
    try {
      await ipc.importLocalImage(game.id, kind, p)
      await done()
    } catch (e) {
      alert(String(e))
    }
  }

  const slot = (kind: 'cover' | 'hero', label: string, path: string | null, aspect: string) => (
    <div>
      <div className="mb-1 text-xs text-fg-mute">{label}</div>
      <div className={`${aspect} w-full overflow-hidden rounded-lg bg-ink-850 ring-1 ring-white/10`}>
        <Cover path={path} title={game.title} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => fromUrl(kind)}>URL…</Button>
        <Button onClick={() => fromFile(kind)}>File lokal…</Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 text-sm">
      {hasSgdb && (
        <Button onClick={fromSgdb} disabled={busy}>
          {busy ? 'Mengambil…' : '🖼 Ambil cover + background dari SteamGridDB'}
        </Button>
      )}
      {slot('cover', 'Cover (potret)', game.cover_path, 'aspect-[3/4]')}
      {slot('hero', 'Background (landscape, dipakai di Fullscreen)', game.hero_path, 'aspect-video')}
    </div>
  )
}

// ---------- Aksi Main: konfigurasi launch (ala Playnite) ----------

function AksiTab({ game }: { game: Game }) {
  const profiles = useStore((s) => s.profiles)
  const refresh = useStore((s) => s.refresh)
  const [type, setType] = useState(game.launch_type)
  const [profileId, setProfileId] = useState<number | null>(game.emulator_profile_id)
  const [media, setMedia] = useState<string | null>(game.media_path)
  const [exe, setExe] = useState(game.custom_exe ?? '')
  const [args, setArgs] = useState(game.custom_args ?? '')
  const [workdir, setWorkdir] = useState(game.custom_workdir ?? '')

  const pickMedia = async () => {
    const sel = await open({ directory: type === 'rpcs3', multiple: false })
    if (typeof sel === 'string') setMedia(await ipc.portablizePath(sel))
  }
  const pickExe = async () => {
    const sel = await open({ multiple: false, filters: [{ name: 'Program', extensions: ['exe', 'bat', 'lnk'] }] })
    if (typeof sel === 'string') setExe(sel)
  }
  const pickWorkdir = async () => {
    const sel = await open({ directory: true, multiple: false })
    if (typeof sel === 'string') setWorkdir(sel)
  }

  const save = async () => {
    try {
      await ipc.setGameLaunch(game.id, type, {
        profileId: ['pcsx2', 'rpcs3', 'custom'].includes(type) ? profileId : null,
        mediaPath: ['pcsx2', 'rpcs3', 'custom'].includes(type) ? media : null,
        customExe: type === 'manual' ? exe : null,
        customArgs: type === 'manual' ? args : null,
        customWorkdir: type === 'manual' ? workdir : null,
      })
      await refresh()
    } catch (e) {
      alert(String(e))
    }
  }

  const isEmu = ['pcsx2', 'rpcs3', 'custom'].includes(type)

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs text-fg-mute">Cara menjalankan</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-lg bg-ink-800 px-3 py-2"
        >
          <option value="native">Native EXE (hasil scan)</option>
          <option value="manual">Manual — exe + argumen sendiri</option>
          <option value="pcsx2">PCSX2 (PS2)</option>
          <option value="rpcs3">RPCS3 (PS3)</option>
          <option value="custom">Emulator lain</option>
        </select>
      </label>

      {type === 'native' && (
        <p className="rounded-lg bg-ink-850 p-3 text-xs text-fg-mute">{game.rel_path}</p>
      )}

      {type === 'manual' && (
        <>
          <div>
            <span className="mb-1 block text-xs text-fg-mute">Executable / shortcut</span>
            <div className="flex gap-2">
              <input
                value={exe}
                onChange={(e) => setExe(e.target.value)}
                placeholder="C:\…\game.exe"
                className="flex-1 rounded-lg bg-ink-800 px-3 py-2"
              />
              <Button onClick={pickExe}>Pilih…</Button>
            </div>
          </div>
          <Field label="Argumen (opsional)" value={args} onChange={setArgs} />
          <div>
            <span className="mb-1 block text-xs text-fg-mute">Folder kerja (opsional)</span>
            <div className="flex gap-2">
              <input
                value={workdir}
                onChange={(e) => setWorkdir(e.target.value)}
                placeholder="default: folder exe"
                className="flex-1 rounded-lg bg-ink-800 px-3 py-2"
              />
              <Button onClick={pickWorkdir}>Pilih…</Button>
            </div>
          </div>
        </>
      )}

      {isEmu && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs text-fg-mute">Profil emulator</span>
            <select
              value={profileId ?? ''}
              onChange={(e) => setProfileId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg bg-ink-800 px-3 py-2"
            >
              <option value="">— pilih —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id ?? ''}>
                  {p.name}
                </option>
              ))}
            </select>
            {profiles.length === 0 && (
              <span className="text-xs text-amber-400">Buat profil di Settings → Emulator.</span>
            )}
          </label>
          <div>
            <span className="mb-1 block text-xs text-fg-mute">
              {type === 'rpcs3' ? 'Folder game PS3' : 'File ISO'}
            </span>
            <div className="flex gap-2">
              <input
                readOnly
                value={media ?? ''}
                placeholder="belum dipilih"
                className="flex-1 rounded-lg bg-ink-800 px-3 py-2 text-fg-dim"
              />
              <Button onClick={pickMedia}>Pilih…</Button>
            </div>
          </div>
        </>
      )}

      <Button variant="primary" onClick={save}>
        Simpan
      </Button>
    </div>
  )
}
