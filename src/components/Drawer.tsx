import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: string
}

export function Drawer({ open, onClose, children, width = 'max-w-md' }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="drawer-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/50"
          />
          <motion.aside
            key="drawer-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={`glass absolute right-0 top-0 z-50 flex h-full w-full ${width} flex-col border-l border-white/10`}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
