import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { RelinkBanner } from './components/RelinkBanner'
import { TopBar } from './components/TopBar'
import { Drawer } from './components/Drawer'
import { DesktopMode } from './modes/desktop/DesktopMode'
import { FullscreenMode } from './modes/fullscreen/FullscreenMode'
import { Settings } from './views/Settings'
import { useStore } from './store/useStore'

export default function App() {
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const clearError = useStore((s) => s.clearError)
  const mode = useStore((s) => s.mode)
  const operator = useStore((s) => s.config?.operator_mode ?? false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    void init()
  }, [init])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-fg-mute">Memuat…</div>
    )
  }

  if (mode === 'fullscreen') return <FullscreenMode />

  return (
    <div className="relative flex h-full flex-col">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} query={query} onQuery={setQuery} />
      <RelinkBanner />

      <AnimatePresence>
        {error && (
          <motion.button
            type="button"
            onClick={clearError}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full bg-red-900/50 px-5 py-2 text-left text-sm text-red-200"
          >
            {error} <span className="text-red-300/60">(klik untuk tutup)</span>
          </motion.button>
        )}
      </AnimatePresence>

      <main className="min-h-0 flex-1">
        <DesktopMode query={query} />
      </main>

      <Drawer open={settingsOpen && operator} onClose={() => setSettingsOpen(false)}>
        <Settings onClose={() => setSettingsOpen(false)} />
      </Drawer>
    </div>
  )
}
