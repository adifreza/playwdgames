import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'

export interface MenuItem {
  label: string
  icon?: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('resize', close)
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  // jaga menu tetap di dalam viewport
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - items.length * 40 - 16),
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="glass fixed z-[60] w-52 overflow-hidden rounded-lg border border-white/10 py-1 shadow-2xl"
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          disabled={it.disabled}
          onClick={() => {
            it.onClick()
            onClose()
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:opacity-30 ${
            it.danger ? 'text-red-300 hover:bg-red-900/40' : 'text-fg-dim hover:bg-ink-800 hover:text-fg'
          }`}
        >
          <span className="w-4 text-center">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </motion.div>
  )
}
