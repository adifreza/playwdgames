import { motion } from 'motion/react'
import type { MouseEvent } from 'react'
import type { Game } from '../lib/ipc'
import { Cover } from './Cover'

interface Props {
  game: Game
  selected: boolean
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: MouseEvent) => void
}

export function GameCard({ game, selected, onClick, onDoubleClick, onContextMenu }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative flex flex-col overflow-hidden rounded-card bg-ink-850 text-left ring-1 transition-shadow ${
        selected ? 'ring-2 ring-accent-400' : 'ring-white/5 hover:ring-accent-400/40'
      }`}
    >
      <div className="aspect-[3/4] w-full overflow-hidden">
        <Cover path={game.cover_path} title={game.title} />
      </div>
      <div className="flex items-start justify-between gap-2 px-2.5 py-2">
        <span className="line-clamp-2 text-[13px] leading-tight text-fg">{game.title}</span>
        {!game.available && (
          <span className="mt-0.5 shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            !
          </span>
        )}
      </div>
      {game.launch_type !== 'native' && (
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-400">
          {game.launch_type}
        </span>
      )}
    </motion.button>
  )
}
