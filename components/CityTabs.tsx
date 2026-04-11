'use client'

import clsx from 'clsx'
import type { CityStatus } from '@/lib/types'

interface Props {
  cityStatus: CityStatus[]
  selected: string
  onSelect: (series: string) => void
  totalEdges: number
}

export function CityTabs({ cityStatus, selected, onSelect, totalEdges }: Props) {
  const sorted = [...cityStatus].sort((a, b) => b.count - a.count)

  return (
    <div className="sticky top-[57px] z-20 bg-bg2 border-b border-border -mx-6 px-6 overflow-x-auto scrollbar-thin">
      <div className="flex gap-1 min-w-max py-2">
        <button
          onClick={() => onSelect('ALL')}
          className={clsx(
            'px-4 py-3 text-sm font-bold tracking-wider border-b-2 transition-colors flex items-center gap-2',
            selected === 'ALL'
              ? 'border-accent text-text'
              : 'border-transparent text-muted hover:text-text',
          )}
        >
          ALL
          <span className="text-[11px] text-muted">{totalEdges}</span>
        </button>
        {sorted.map((c) => {
          const active = selected === c.series
          const hasEdges = c.count > 0
          return (
            <button
              key={c.series}
              onClick={() => onSelect(c.series)}
              className={clsx(
                'px-4 py-3 text-sm font-bold tracking-wider border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap',
                active
                  ? 'border-accent text-text'
                  : 'text-muted hover:text-text border-transparent',
              )}
            >
              <span>{c.short}</span>
              {c.nwsTemp !== null && (
                <span className="text-accent text-[12px]">{Math.round(c.nwsTemp)}°</span>
              )}
              {hasEdges && (
                <span className="px-2 py-0.5 bg-strong text-bg text-[10px] font-extrabold rounded-full">
                  {c.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
