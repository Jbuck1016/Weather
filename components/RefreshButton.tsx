'use client'

import clsx from 'clsx'

interface Props {
  onClick: () => void
  loading?: boolean
  countdown?: number
}

export function RefreshButton({ onClick, loading, countdown }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={clsx(
        'px-3 py-1.5 border border-accent/40 text-accent text-xs tracking-wider rounded-sm',
        'hover:bg-accent/10 transition-colors disabled:opacity-50',
      )}
    >
      {loading ? 'REFRESHING…' : `REFRESH${countdown !== undefined ? ` (${countdown}s)` : ''}`}
    </button>
  )
}
