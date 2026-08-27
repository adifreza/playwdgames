import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { open } from '@tauri-apps/plugin-dialog'
import { Button } from '../components/Button'
import { ipc, type LibraryRoot } from '../lib/ipc'
import { useStore } from '../store/useStore'

interface Row {
  rel_path: string
  title: string
  checked: boolean
}

interface Props {
  open: boolean
  onClose: () => void
}

export function BulkImport({ open: isOpen, onClose }: Props) {
  const config = useStore((s) => s.config)
  const addRoot = useStore((s) => s.addRoot)
  const refresh = useStore((s) => s.refresh)
  const hasIgdb = useStore((s) => s.config?.has_igdb ?? false)
  const hasSgdb = useStore((s) => s.config?.has_steamgriddb ?? false)

  const [rootId, setRootId] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'list' | 'importing'>('idle')
  const [progress, setProgress] = useState('')

  const roots = config?.library_roots ?? []
  useEffect(() => {
    if (isOpen && !rootId && roots[0]) setRootId(roots[0].id)
  }, [isOpen, rootId, roots])

  const pickAndAddFolder = async () => {
    const dir = await open({ directory: true })
    if (typeof dir === 'string') {
      await addRoot(dir)
      const cfg = useStore.getState().config
      const added = cfg?.library_roots[cfg.library_roots.length - 1]
      if (added) setRootId(added.id)
    }
  }

  const scan = async () => {
    if (!rootId) return
    setPhase('scanning')
    try {
      const cands = await ipc.scanCandidates(rootId)
      setRows(cands.map((c) => ({ rel_path: c.rel_path, title: c.suggested_title, checked: true })))
      setPhase('list')
    } catch (e) {
      alert(String(e))
      setPhase('idle')
    }
  }

  const doImport = async () => {
    const picked = rows.filter((r) => r.checked)
    if (picked.length === 0) return
    setPhase('importing')
    try {
      await ipc.importGames(
        rootId,
        picked.map((r) => ({ rel_path: r.rel_path, title: r.title })),
      )
      await refresh()

      const fresh = useStore.getState().games.filter((g) => g.match_status === 'unmatched')
      if (hasIgdb || hasSgdb) {
        for (let i = 0; i < fresh.length; i++) {
          setProgress(
            `${hasIgdb ? 'Auto-match' : 'Ambil cover'} ${i + 1}/${fresh.length}: ${fresh[i].title}`,
          )
          try {
            if (hasIgdb) await ipc.autoMatch(fresh[i].id)
            else await ipc.fetchArtwork(fresh[i].id)
          } catch {
            /* lanjut game berikutnya */
          }
        }
        await refresh()
      }
      close()
    } catch (e) {
      alert(String(e))
      setPhase('list')
    }
  }

  const close = () => {
    setRows([])
    setPhase('idle')
    setProgress('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.96, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="glass flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <h2 className="font-semibold">Tambah Game</h2>
              <button type="button" onClick={close} className="text-fg-mute hover:text-fg">
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 px-5 py-3">
              <select
                value={rootId}
                onChange={(e) => setRootId(e.target.value)}
                className="flex-1 rounded-lg bg-ink-800 px-3 py-2 text-sm"
              >
                <option value="">— pilih folder library —</option>
                {roots.map((r: LibraryRoot) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.path})
                  </option>
                ))}
              </select>
              <Button onClick={pickAndAddFolder}>+ Folder</Button>
              <Button variant="primary" onClick={scan} disabled={!rootId || phase === 'scanning'}>
                {phase === 'scanning' ? 'Memindai…' : 'Pindai'}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              {phase === 'list' && rows.length === 0 && (
                <p className="py-8 text-center text-sm text-fg-mute">
                  Tidak ada kandidat baru di folder ini.
                </p>
              )}
              {rows.map((r, i) => (
                <label
                  key={r.rel_path}
                  className="flex items-center gap-3 border-b border-white/5 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={r.checked}
                    onChange={(e) =>
                      setRows(rows.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))
                    }
                    className="h-4 w-4"
                  />
                  <input
                    value={r.title}
                    onChange={(e) =>
                      setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                    }
                    className="w-52 rounded bg-ink-800 px-2 py-1"
                  />
                  <span className="truncate text-xs text-fg-mute">{r.rel_path}</span>
                </label>
              ))}
            </div>

            {phase === 'list' && rows.length > 0 && (
              <div className="flex items-center gap-2 border-t border-white/5 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setRows(rows.map((r) => ({ ...r, checked: true })))}
                  className="text-xs text-fg-dim hover:text-fg"
                >
                  Pilih semua
                </button>
                <button
                  type="button"
                  onClick={() => setRows(rows.map((r) => ({ ...r, checked: false })))}
                  className="text-xs text-fg-dim hover:text-fg"
                >
                  Kosongkan
                </button>
                <span className="ml-auto text-xs text-fg-mute">
                  {rows.filter((r) => r.checked).length} dipilih
                  {hasIgdb
                    ? ' · metadata + cover auto'
                    : hasSgdb
                      ? ' · cover auto (SteamGridDB)'
                      : ' · isi metadata manual nanti'}
                </span>
                <Button variant="primary" onClick={doImport}>
                  Import
                </Button>
              </div>
            )}

            {phase === 'importing' && (
              <div className="border-t border-white/5 px-5 py-3 text-sm text-fg-dim">
                {progress || 'Mengimpor…'}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
