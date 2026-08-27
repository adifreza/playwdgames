import { convertFileSrc } from '@tauri-apps/api/core'
import { ipc } from './ipc'

// path absolut folder data/ (di-set sekali saat init)
let dataDir = ''
// versi per-path buat cache-busting setelah gambar diganti
const version = new Map<string, number>()

export async function initImages() {
  try {
    dataDir = (await ipc.getDataDir()).replace(/\\/g, '/').replace(/\/+$/, '')
  } catch {
    dataDir = ''
  }
}

/** URL asset protocol untuk file di dalam data/ (mis. "covers/6.jpg"). Efisien untuk hero besar. */
export function assetUrl(rel: string | null | undefined): string {
  if (!rel || !dataDir) return ''
  const base = convertFileSrc(`${dataDir}/${rel.replace(/^\/+/, '')}`)
  const v = version.get(rel)
  return v ? `${base}${base.includes('?') ? '&' : '?'}v=${v}` : base
}

export function bustImage(rel: string) {
  version.set(rel, (version.get(rel) ?? 0) + 1)
}
