import { useState } from 'react'
import { assetUrl } from '../lib/image'

interface Props {
  path: string | null
  title: string
  className?: string
}

/** Cover art via asset protocol + fallback inisial judul. */
export function Cover({ path, title, className = '' }: Props) {
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const src = assetUrl(path)

  if (src && failedPath !== path) {
    return (
      <img
        src={src}
        alt={title}
        onError={() => setFailedPath(path)}
        className={`h-full w-full object-cover ${className}`}
      />
    )
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-linear-to-br from-ink-700 to-ink-900 text-3xl font-bold text-ink-600 ${className}`}
    >
      {title.slice(0, 1).toUpperCase()}
    </div>
  )
}
