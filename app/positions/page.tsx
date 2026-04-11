'use client'

import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { AccountSummary } from '@/components/AccountSummary'
import { PnLChart } from '@/components/PnLChart'
import { PositionsList } from '@/components/PositionsList'
import { KalshiPortfolio } from '@/components/KalshiPortfolio'
import type { Position, PortfolioResponse } from '@/lib/types'

export default function PositionsPage() {
  const [tab, setTab] = useState<'mine' | 'kalshi'>('mine')
  const [positions, setPositions] = useState<Position[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const loadPositions = useCallback(async () => {
    const res = await fetch('/api/positions').then((r) => r.json())
    setPositions(res.positions ?? [])
  }, [])

  const loadPortfolio = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portfolio').then((r) => r.json())
      if (!res.error) setPortfolio(res)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPositions()
    loadPortfolio()
  }, [loadPositions, loadPortfolio])

  return (
    <div className="space-y-4">
      <AccountSummary positions={positions} />
      <PnLChart positions={positions} />

      <div className="flex gap-1 border-b border-border">
        {(['mine', 'kalshi'] as const).map((t) => (
          <button
            key={t}
            onClick={() => t === 'kalshi' ? (setTab(t), loadPortfolio()) : setTab(t)}
            className={clsx(
              'px-4 py-2 text-xs tracking-wider border-b-2 -mb-px',
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text',
            )}
          >
            {t === 'mine' ? 'MY POSITIONS' : 'KALSHI LIVE'}
          </button>
        ))}
        <div className="ml-auto flex items-center pr-2">
          <button
            onClick={() => { loadPositions(); loadPortfolio() }}
            disabled={loading}
            className="px-3 py-1 border border-accent/40 text-accent text-[10px] tracking-wider hover:bg-accent/10"
          >
            REFRESH
          </button>
        </div>
      </div>

      {tab === 'mine' && (
        <PositionsList positions={positions} onChanged={loadPositions} />
      )}
      {tab === 'kalshi' && <KalshiPortfolio data={portfolio} />}
    </div>
  )
}
