import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'

const styles: Record<Variant, string> = {
  primary:
    'bg-linear-to-r from-accent-500 to-violet-400 text-ink-950 font-semibold hover:brightness-110',
  ghost: 'bg-ink-800 text-fg hover:bg-ink-700',
  subtle: 'bg-transparent text-fg-dim hover:text-fg hover:bg-ink-800',
  danger: 'bg-ink-800 text-red-300 hover:bg-red-900/50',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'ghost', className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-[filter,background-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  )
}
