import { useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { Drawer } from '../../components/Drawer'
import { GameCard } from '../../components/GameCard'
import { Sidebar } from '../../components/Sidebar'
import { BulkImport } from '../../views/BulkImport'
import { GameDetail, type DetailTab } from '../../views/GameDetail'
import { ipc } from '../../lib/ipc'
import { useStore } from '../../store/useStore'

interface Props {
  query: string
}

export function DesktopMode({ query }: Props) {
  const games = useStore((s) => s.games)
  const operator = useStore((s) => s.config?.operator_mode ?? false)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const launch = useStore((s) => s.launch)
  const removeGame = useStore((s) => s.removeGame)

  const [filter, setFilter] = useState('all')
  const [importOpen, setImportOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('umum')
  const [menu, setMenu] = useState<{ x: number; y: number; id: number } | null>(null)

  const genres = useMemo(() => {
    const set = new Set<string>()
    for (const g of games) g.genres?.split(',').forEach((x) => x.trim() && set.add(x.trim()))
    return [...set].sort()
  }, [games])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: games.length, emulator: 0 }
    for (const g of games) {
      if (g.launch_type !== 'native') c.emulator = (c.emulator ?? 0) + 1
      g.genres?.split(',').forEach((x) => {
        const k = x.trim()
        if (k) c[k] = (c[k] ?? 0) + 1
      })
    }
    return c
  }, [games])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return games.filter((g) => {
      if (q && !g.title.toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      if (filter === 'emulator') return g.launch_type !== 'native'
      return g.genres?.split(',').some((x) => x.trim() === filter) ?? false
    })
  }, [games, query, filter])

  const selected = games.find((g) => g.id === selectedId) ?? null

  const openDetail = (id: number, tab: DetailTab) => {
    setDetailTab(tab)
    select(id)
  }

  const menuItems = (id: number): MenuItem[] => {
    const g = games.find((x) => x.id === id)
    const base: MenuItem[] = [
      { label: 'Main', icon: '▶', onClick: () => launch(id) },
      { label: 'Buka folder', icon: '📂', onClick: () => ipc.openGameLocation(id).catch(() => {}) },
    ]
    if (!operator) return base
    return [
      { label: 'Main', icon: '▶', onClick: () => launch(id) },
      { label: 'Edit metadata', icon: '✎', onClick: () => openDetail(id, 'umum') },
      { label: 'Gambar / cover', icon: '🖼', onClick: () => openDetail(id, 'gambar') },
      { label: 'Aksi Main…', icon: '🎮', onClick: () => openDetail(id, 'aksi') },
      { label: 'Buka folder', icon: '📂', onClick: () => ipc.openGameLocation(id).catch(() => {}) },
      {
        label: 'Hapus dari library',
        icon: '🗑',
        danger: true,
        onClick: () => g && confirm(`Hapus "${g.title}"?`) && removeGame(id),
      },
    ]
  }

  return (
    <div className="relative flex h-full min-h-0">
      <Sidebar genres={genres} active={filter} onSelect={setFilter} counts={counts} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 py-3">
          <span className="text-sm text-fg-dim">
            {visible.length} game{visible.length !== 1 ? 's' : ''}
          </span>
          {operator && (
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              + Tambah Game
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-fg-mute">
              {games.length === 0
                ? operator
                  ? 'Belum ada game. Klik "+ Tambah Game".'
                  : 'Library kosong.'
                : 'Tidak ada game yang cocok.'}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
              {visible.map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  selected={g.id === selectedId}
                  onClick={() => openDetail(g.id, 'umum')}
                  onDoubleClick={() => launch(g.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setMenu({ x: e.clientX, y: e.clientY, id: g.id })
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Drawer open={selected !== null} onClose={() => select(null)}>
        {selected && (
          <GameDetail
            key={`${selected.id}-${detailTab}`}
            game={selected}
            initialTab={detailTab}
            onClose={() => select(null)}
          />
        )}
      </Drawer>

      <BulkImport open={importOpen} onClose={() => setImportOpen(false)} />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
