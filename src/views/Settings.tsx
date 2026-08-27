import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '../components/Button'
import { ipc, type EmulatorProfile } from '../lib/ipc'
import { useStore } from '../store/useStore'

export function Settings({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config)
  const removeRoot = useStore((s) => s.removeRoot)
  const addRoot = useStore((s) => s.addRoot)
  const setOperatorMode = useStore((s) => s.setOperatorMode)
  const reloadConfig = useStore((s) => s.reloadConfig)

  if (!config) return null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <h2 className="font-semibold">Settings</h2>
        <button type="button" onClick={onClose} className="text-fg-mute hover:text-fg">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto p-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">Folder Library</h3>
          <div className="space-y-2">
            {config.library_roots.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg bg-ink-850 p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.label}</div>
                  <div className="truncate text-xs text-fg-mute">{r.path}</div>
                </div>
                <Button variant="danger" onClick={() => removeRoot(r.id)}>
                  Hapus
                </Button>
              </div>
            ))}
            {config.library_roots.length === 0 && (
              <p className="text-sm text-fg-mute">Belum ada folder.</p>
            )}
          </div>
          <Button
            className="mt-2"
            onClick={async () => {
              const d = await open({ directory: true })
              if (typeof d === 'string') await addRoot(d)
            }}
          >
            + Tambah Folder
          </Button>
        </section>

        <CredentialsSection
          hasIgdb={config.has_igdb}
          hasSgdb={config.has_steamgriddb}
          onSaved={reloadConfig}
        />

        <EmulatorSection />

        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">Operator Mode</h3>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={config.operator_mode}
              onChange={(e) => setOperatorMode(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-fg-dim">
              Aktifkan menu setup (scan, import, edit metadata, emulator). Matikan sebelum HDD
              dikirim ke customer — mereka cuma bisa browse & main.
            </span>
          </label>
        </section>
      </div>
    </div>
  )
}

function CredentialsSection({
  hasIgdb,
  hasSgdb,
  onSaved,
}: {
  hasIgdb: boolean
  hasSgdb: boolean
  onSaved: () => Promise<void>
}) {
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')
  const [sgdb, setSgdb] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await ipc.setCredentials({
        igdbClientId: id || undefined,
        igdbClientSecret: secret || undefined,
        steamgriddbKey: sgdb || undefined,
      })
      setId('')
      setSecret('')
      setSgdb('')
      await onSaved()
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const badge = (ok: boolean) =>
    ok ? (
      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
        terhubung
      </span>
    ) : (
      <span className="rounded bg-ink-800 px-2 py-0.5 text-xs text-fg-mute">belum diisi</span>
    )

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-fg">Koneksi Metadata</h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-fg-dim">IGDB (Twitch)</span>
          {badge(hasIgdb)}
        </div>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Twitch Client ID"
          className="w-full rounded-lg bg-ink-800 px-3 py-2"
        />
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          type="password"
          placeholder="Twitch Client Secret"
          className="w-full rounded-lg bg-ink-800 px-3 py-2"
        />
        <div className="flex items-center gap-2 pt-2">
          <span className="text-fg-dim">SteamGridDB</span>
          {badge(hasSgdb)}
        </div>
        <input
          value={sgdb}
          onChange={(e) => setSgdb(e.target.value)}
          type="password"
          placeholder="SteamGridDB API Key"
          className="w-full rounded-lg bg-ink-800 px-3 py-2"
        />
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan kredensial'}
        </Button>
        <p className="text-xs text-fg-mute">
          Field kosong = biarkan nilai lama. Cara daftar ada di{' '}
          <span className="text-accent-400">docs/api-setup.md</span>.
        </p>
        {hasSgdb && <RefreshArtworkButton />}
      </div>
    </section>
  )
}

function RefreshArtworkButton() {
  const refreshAllArtwork = useStore((s) => s.refreshAllArtwork)
  const total = useStore((s) => s.games.length)
  const [prog, setProg] = useState<string | null>(null)

  const run = async () => {
    setProg('mulai…')
    await refreshAllArtwork((done, tot, title) => setProg(`${done}/${tot} · ${title}`))
    setProg(null)
  }

  return (
    <div className="mt-2 border-t border-white/5 pt-3">
      <Button onClick={run} disabled={prog != null || total === 0}>
        {prog ? `Mengambil… ${prog}` : `🖼 Ambil ulang cover + background semua game (${total})`}
      </Button>
      <p className="mt-1 text-xs text-fg-mute">
        Berguna buat mengisi background landscape (dipakai di Fullscreen Mode) untuk game
        yang di-import sebelum fitur ini ada. Judul tidak diubah.
      </p>
    </div>
  )
}

function EmulatorSection() {
  const profiles = useStore((s) => s.profiles)
  const refresh = useStore((s) => s.refresh)
  const [editing, setEditing] = useState<EmulatorProfile | null>(null)

  const blank = (): EmulatorProfile => ({
    id: null,
    name: '',
    kind: 'pcsx2',
    exe_path: '',
    default_args: '',
  })

  const save = async () => {
    if (!editing) return
    try {
      await ipc.saveProfile(editing)
      setEditing(null)
      await refresh()
    } catch (e) {
      alert(String(e))
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-fg">Emulator</h3>
      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg bg-ink-850 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {p.name} <span className="text-xs uppercase text-fg-mute">{p.kind}</span>
              </div>
              <div className="truncate text-xs text-fg-mute">{p.exe_path}</div>
            </div>
            <Button onClick={() => setEditing(p)}>Edit</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (p.id != null) {
                  await ipc.deleteProfile(p.id)
                  await refresh()
                }
              }}
            >
              Hapus
            </Button>
          </div>
        ))}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2 rounded-lg bg-ink-850 p-3 text-sm">
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Nama (mis. PCSX2 Nightly)"
            className="w-full rounded-lg bg-ink-800 px-3 py-2"
          />
          <select
            value={editing.kind}
            onChange={(e) =>
              setEditing({ ...editing, kind: e.target.value as EmulatorProfile['kind'] })
            }
            className="w-full rounded-lg bg-ink-800 px-3 py-2"
          >
            <option value="pcsx2">PCSX2</option>
            <option value="rpcs3">RPCS3</option>
            <option value="custom">Custom</option>
          </select>
          <div className="flex gap-2">
            <input
              value={editing.exe_path}
              onChange={(e) => setEditing({ ...editing, exe_path: e.target.value })}
              placeholder="Path executable emulator"
              className="flex-1 rounded-lg bg-ink-800 px-3 py-2"
            />
            <Button
              onClick={async () => {
                const f = await open({ multiple: false })
                if (typeof f === 'string') setEditing({ ...editing, exe_path: f })
              }}
            >
              Pilih…
            </Button>
          </div>
          <input
            value={editing.default_args}
            onChange={(e) => setEditing({ ...editing, default_args: e.target.value })}
            placeholder="Argumen default (opsional, mis. --fullscreen)"
            className="w-full rounded-lg bg-ink-800 px-3 py-2"
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={save}>
              Simpan
            </Button>
            <Button variant="subtle" onClick={() => setEditing(null)}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-2" onClick={() => setEditing(blank())}>
          + Profil Emulator
        </Button>
      )}
    </section>
  )
}
