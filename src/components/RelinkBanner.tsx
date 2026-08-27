import { open } from '@tauri-apps/plugin-dialog'
import { useStore } from '../store/useStore'

/** Muncul kalau ada library root yang drive-nya tidak terbaca. */
export function RelinkBanner() {
  const config = useStore((s) => s.config)
  const rootStatus = useStore((s) => s.rootStatus)
  const relinkRoot = useStore((s) => s.relinkRoot)

  const missing = (config?.library_roots ?? []).filter(
    (r) => rootStatus.find((s) => s.id === r.id)?.available === false,
  )
  if (missing.length === 0) return null

  const relink = async (id: string) => {
    const dir = await open({ directory: true })
    if (typeof dir === 'string') await relinkRoot(id, dir)
  }

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-sm text-amber-200">
      {missing.map((r) => (
        <div key={r.id} className="flex items-center gap-3">
          <span className="flex-1 truncate">
            Folder <b>{r.label}</b> tidak terbaca ({r.path}). Drive HDD mungkin ganti huruf.
          </span>
          <button
            type="button"
            onClick={() => relink(r.id)}
            className="shrink-0 rounded bg-amber-500/20 px-3 py-1 font-medium hover:bg-amber-500/30"
          >
            Relink…
          </button>
        </div>
      ))}
    </div>
  )
}
