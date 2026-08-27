import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ContextMenu } from '../../components/ContextMenu'
import { Cover } from '../../components/Cover'
import { ipc } from '../../lib/ipc'
import { assetUrl } from '../../lib/image'
import { useGamepad } from '../../lib/gamepad'
import { useStore } from '../../store/useStore'

/** Background landscape: hero → cover → gradient halus. Tanpa huruf inisial. */
function FsBackground({ path, title }: { path: string | null; title: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const src = assetUrl(path)
  const show = src && failedPath !== path

  return (
    <motion.div
      key={path ?? 'none'}
      initial={{ opacity: 0, scale: 1.06 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0"
    >
      {show ? (
        <img
          src={src}
          alt=""
          onError={() => setFailedPath(path)}
          className="h-full w-full scale-110 object-cover blur-2xl brightness-[0.45]"
        />
      ) : (
        <div className="h-full w-full bg-[radial-gradient(circle_at_50%_25%,var(--color-ink-800),var(--color-ink-950)_70%)]" />
      )}
      <span className="sr-only">{title}</span>
    </motion.div>
  )
}

export function FullscreenMode() {
  const games = useStore((s) => s.games)
  const launch = useStore((s) => s.launch)
  const setMode = useStore((s) => s.setMode)
  const select = useStore((s) => s.select)
  const operator = useStore((s) => s.config?.operator_mode ?? false)

  const [idx, setIdx] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; id: number } | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const current = games[idx]
  const move = (d: number) => setIdx((i) => Math.max(0, Math.min(games.length - 1, i + d)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') move(1)
      else if (e.key === 'ArrowLeft') move(-1)
      else if (e.key === 'Enter' && current) launch(current.id)
      else if (e.key === 'Escape') setMode('desktop')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, games.length])

  useGamepad(
    {
      onLeft: () => move(-1),
      onRight: () => move(1),
      onConfirm: () => current && launch(current.id),
      onBack: () => setMode('desktop'),
    },
    true,
  )

  // scroll HANYA carousel-nya (bukan seluruh halaman) supaya tile fokus di tengah
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const tile = row.querySelector<HTMLElement>(`[data-tile="${idx}"]`)
    if (!tile) return
    const rowRect = row.getBoundingClientRect()
    const tileRect = tile.getBoundingClientRect()
    const delta = tileRect.left + tileRect.width / 2 - (rowRect.left + rowRect.width / 2)
    row.scrollBy({ left: delta, behavior: 'smooth' })
  }, [idx, games.length])

  if (games.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-ink-950">
        <p className="text-fg-dim">Library masih kosong.</p>
        <button
          type="button"
          onClick={() => setMode('desktop')}
          className="rounded-lg bg-ink-800 px-4 py-2 text-sm"
        >
          Kembali (Esc)
        </button>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <FsBackground path={current?.hero_path ?? current?.cover_path ?? null} title={current?.title ?? ''} />
      <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/50 to-ink-950/10" />

      <div className="relative flex h-full w-full flex-col">
        <div className="flex items-center justify-between px-16 pt-10">
          <span className="bg-linear-to-r from-accent-400 to-violet-400 bg-clip-text text-lg font-bold tracking-widest text-transparent">
            PLAYWD GAMES
          </span>
          <button
            type="button"
            onClick={() => setMode('desktop')}
            className="rounded-lg bg-white/10 px-4 py-1.5 text-sm text-fg-dim hover:text-fg"
          >
            Keluar (Esc / B)
          </button>
        </div>

        <div className="flex-1" />

        <div className="px-16 pb-3">
          <motion.h1
            key={current?.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="max-w-3xl truncate text-4xl font-bold drop-shadow-lg"
          >
            {current?.title}
          </motion.h1>
          <p className="mt-1 text-sm text-fg-dim">
            {[current?.release_year, current?.developer, current?.genres].filter(Boolean).join('  ·  ')}
          </p>
          <p className="mt-3 text-sm font-medium text-accent-400">Tekan A / Enter untuk main</p>
        </div>

        {/* carousel — spacer di kiri/kanan supaya tile pinggir tetap bisa ke tengah */}
        <div
          ref={rowRef}
          className="flex items-end gap-4 overflow-x-auto pb-12 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div aria-hidden className="shrink-0" style={{ width: 'calc(50% - 100px)' }} />
          {games.map((g, i) => (
            <motion.button
              key={g.id}
              type="button"
              data-tile={i}
              onClick={() => (i === idx ? launch(g.id) : setIdx(i))}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIdx(i)
                setMenu({ x: e.clientX, y: e.clientY, id: g.id })
              }}
              animate={{ width: i === idx ? 190 : 128, opacity: i === idx ? 1 : 0.5 }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className={`relative aspect-[3/4] shrink-0 overflow-hidden rounded-xl ring-1 ${
                i === idx ? 'ring-2 ring-accent-400' : 'ring-white/10'
              }`}
            >
              <Cover path={g.cover_path} title={g.title} />
              {g.launch_type !== 'native' && (
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-400">
                  {g.launch_type}
                </span>
              )}
            </motion.button>
          ))}
          <div aria-hidden className="shrink-0" style={{ width: 'calc(50% - 100px)' }} />
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Main', icon: '▶', onClick: () => launch(menu.id) },
            {
              label: 'Buka folder',
              icon: '📂',
              onClick: () => ipc.openGameLocation(menu.id).catch(() => {}),
            },
            ...(operator
              ? [
                  {
                    label: 'Edit di Desktop Mode',
                    icon: '✎',
                    onClick: () => {
                      select(menu.id)
                      void setMode('desktop')
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  )
}
