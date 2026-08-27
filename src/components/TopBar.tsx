import { useStore } from '../store/useStore'

interface Props {
  onOpenSettings: () => void
  query: string
  onQuery: (q: string) => void
}

export function TopBar({ onOpenSettings, query, onQuery }: Props) {
  const operator = useStore((s) => s.config?.operator_mode ?? false)
  const setMode = useStore((s) => s.setMode)

  return (
    <header className="glass flex items-center gap-4 border-b border-white/5 px-5 py-2.5">
      <span className="bg-linear-to-r from-accent-400 to-violet-400 bg-clip-text text-sm font-bold tracking-wide text-transparent">
        PLAYWD&nbsp;GAMES
      </span>

      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Cari game…"
        className="ml-2 w-56 rounded-lg bg-ink-800 px-3 py-1.5 text-sm text-fg placeholder:text-fg-mute focus:w-72 focus:outline-none"
      />

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('fullscreen')}
          className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm text-fg-dim hover:text-fg"
          title="Mode Fullscreen (PS5)"
        >
          ⛶ Fullscreen
        </button>
        {operator && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm text-fg-dim hover:text-fg"
          >
            ⚙ Settings
          </button>
        )}
      </div>
    </header>
  )
}
