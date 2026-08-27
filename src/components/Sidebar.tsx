interface Props {
  genres: string[]
  active: string
  onSelect: (g: string) => void
  counts: Record<string, number>
}

export function Sidebar({ genres, active, onSelect, counts }: Props) {
  const item = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onSelect(key)}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
        active === key ? 'bg-ink-800 text-fg' : 'text-fg-dim hover:bg-ink-850 hover:text-fg'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="ml-2 shrink-0 text-xs text-fg-mute">{counts[key] ?? 0}</span>
    </button>
  )

  return (
    <nav className="flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/5 bg-ink-900 p-3">
      {item('all', 'Semua Game')}
      {item('emulator', 'Emulator')}
      {genres.length > 0 && (
        <div className="mt-3 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-fg-mute">
          Genre
        </div>
      )}
      {genres.map((g) => item(g, g))}
    </nav>
  )
}
