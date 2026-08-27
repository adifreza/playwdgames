import { create } from 'zustand'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ipc, type Config, type EmulatorProfile, type Game, type RootStatus } from '../lib/ipc'
import { bustImage, initImages } from '../lib/image'

type Mode = 'desktop' | 'fullscreen'

interface State {
  config: Config | null
  games: Game[]
  profiles: EmulatorProfile[]
  rootStatus: RootStatus[]
  mode: Mode
  selectedId: number | null
  loading: boolean
  error: string | null

  init: () => Promise<void>
  refresh: () => Promise<void>
  reloadConfig: () => Promise<void>

  setMode: (m: Mode) => Promise<void>
  select: (id: number | null) => void

  addRoot: (path: string) => Promise<void>
  removeRoot: (id: string) => Promise<void>
  relinkRoot: (id: string, path: string) => Promise<void>
  setOperatorMode: (b: boolean) => Promise<void>

  launch: (id: number) => Promise<void>
  removeGame: (id: number) => Promise<void>
  refreshAllArtwork: (onProgress?: (done: number, total: number, title: string) => void) => Promise<void>
  clearError: () => void
}

function errText(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)
}

export const useStore = create<State>((set, get) => ({
  config: null,
  games: [],
  profiles: [],
  rootStatus: [],
  mode: 'desktop',
  selectedId: null,
  loading: true,
  error: null,

  init: async () => {
    set({ loading: true, error: null })
    try {
      await initImages()
      const [config, games, profiles, rootStatus] = await Promise.all([
        ipc.getConfig(),
        ipc.listGames(),
        ipc.listProfiles(),
        ipc.checkRoots(),
      ])
      set({ config, games, profiles, rootStatus, loading: false })
    } catch (e) {
      set({ error: errText(e), loading: false })
    }
  },

  refresh: async () => {
    try {
      const [games, profiles, rootStatus] = await Promise.all([
        ipc.listGames(),
        ipc.listProfiles(),
        ipc.checkRoots(),
      ])
      set({ games, profiles, rootStatus })
    } catch (e) {
      set({ error: errText(e) })
    }
  },

  reloadConfig: async () => set({ config: await ipc.getConfig() }),

  setMode: async (m) => {
    try {
      await getCurrentWindow().setFullscreen(m === 'fullscreen')
    } catch {
      /* window API tidak ada saat dev di browser murni — abaikan */
    }
    set({ mode: m })
  },

  select: (id) => set({ selectedId: id }),

  addRoot: async (path) => {
    await ipc.addLibraryRoot(path)
    await get().reloadConfig()
    await get().refresh()
  },
  removeRoot: async (id) => {
    await ipc.removeLibraryRoot(id)
    await get().reloadConfig()
    await get().refresh()
  },
  relinkRoot: async (id, path) => {
    await ipc.relinkRoot(id, path)
    await get().reloadConfig()
    await get().refresh()
  },
  setOperatorMode: async (b) => {
    await ipc.setOperatorMode(b)
    await get().reloadConfig()
  },

  launch: async (id) => {
    try {
      await ipc.launchGame(id)
    } catch (e) {
      set({ error: errText(e) })
    }
  },
  removeGame: async (id) => {
    const g = get().games.find((x) => x.id === id)
    if (g?.cover_path) bustImage(g.cover_path)
    await ipc.removeGame(id)
    set({ selectedId: get().selectedId === id ? null : get().selectedId })
    await get().refresh()
  },

  refreshAllArtwork: async (onProgress) => {
    const list = [...get().games]
    for (let i = 0; i < list.length; i++) {
      const g = list[i]
      onProgress?.(i + 1, list.length, g.title)
      if (g.cover_path) bustImage(g.cover_path)
      if (g.hero_path) bustImage(g.hero_path)
      try {
        await ipc.fetchArtwork(g.id, false)
      } catch {
        /* lanjut game berikutnya */
      }
    }
    await get().refresh()
  },

  clearError: () => set({ error: null }),
}))
