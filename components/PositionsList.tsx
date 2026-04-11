'use client'

import { useState } from 'react'
import clsx from 'clsx'
import type { Position } from '@/lib/types'
import { americanOdds } from '@/lib/edge'

interface Props {
  positions: Position[]
  onChanged: () => void
}

export function PositionsList({ positions, onChanged }: Props) {
  const [settling, setSettling] = useState<string | null>(null)
  const [tempInput, setTempInput] = useState<Record<string, string>>({})

  const settle = async (id: string) => {
    const t = parseFloat(tempInput[id] || '0')
    if (!Number.isFinite(t)) return
    setSettling(id)
    try {
      const res = await fetch(`/api/positions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlement_temp: t }),
      })
      if (res.ok) onChanged()
    } finally {
      setSettling(null)
    }
  }

  const exportCsv = () => {
    const headers = [
      'date', 'city', 'ticker', 'side', 'contracts', 'entry_cents',
      'edge_pct', 'cost', 'status', 'result', 'pnl',
    ]
    const lines = [headers.join(',')]
    for (const p of positions) {
      lines.push([
        p.date, p.city, p.market_ticker, p.side, p.contracts, p.entry_price_cents,
        p.edge_pct_at_entry ?? '', p.actual_cost ?? '', p.status,
        p.settlement_result ?? '', p.pnl ?? '',
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `positions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="border border-border bg-bg2">
      <div className="flex justify-between items-center p-3 border-b border-border">
        <div className="label">{positions.length} POSITIONS</div>
        <button
          onClick={exportCsv}
          className="px-3 py-1 border border-accent/40 text-accent text-[10px] tracking-wider hover:bg-accent/10"
        >
          EXPORT CSV
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>City</th>
              <th>Ticker</th>
              <th>Side</th>
              <th>Contracts</th>
              <th>Entry</th>
              <th>Edge@Entry</th>
              <th>Cost</th>
              <th>Status</th>
              <th>P&L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const past = p.date <= today
              return (
                <tr key={p.id}>
                  <td className="text-muted">{p.date}</td>
                  <td>{p.city}</td>
                  <td className="font-mono text-[11px]">{p.market_ticker}</td>
                  <td className={p.side === 'YES' ? 'text-green' : 'text-red'}>{p.side}</td>
                  <td>{p.contracts}</td>
                  <td>{americanOdds(p.entry_price_cents)}</td>
                  <td>{p.edge_pct_at_entry !== null ? `${p.edge_pct_at_entry > 0 ? '+' : ''}${p.edge_pct_at_entry}%` : '—'}</td>
                  <td>${(p.actual_cost ?? 0).toFixed(2)}</td>
                  <td>
                    <span
                      className={clsx(
                        'px-2 py-0.5 text-[10px] tracking-wider border',
                        p.status === 'open' && 'border-accent/40 text-accent',
                        p.settlement_result === 'WIN' && 'border-green/40 text-green bg-green/10',
                        p.settlement_result === 'LOSS' && 'border-red/40 text-red bg-red/10',
                      )}
                    >
                      {p.settlement_result || p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className={clsx((p.pnl ?? 0) > 0 ? 'text-green' : (p.pnl ?? 0) < 0 ? 'text-red' : 'text-muted')}>
                    {p.pnl !== null ? `$${p.pnl.toFixed(2)}` : '—'}
                  </td>
                  <td>
                    {p.status === 'open' && past && (
                      <div className="flex gap-1 items-center">
                        <input
                          type="number"
                          placeholder="°F"
                          value={tempInput[p.id] ?? ''}
                          onChange={(e) =>
                            setTempInput((s) => ({ ...s, [p.id]: e.target.value }))
                          }
                          className="w-14 text-[11px] py-1"
                        />
                        <button
                          disabled={settling === p.id}
                          onClick={() => settle(p.id)}
                          className="px-2 py-1 border border-accent/40 text-accent text-[10px] hover:bg-accent/10"
                        >
                          SETTLE
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {positions.length === 0 && (
              <tr><td colSpan={11} className="text-center label py-8">No positions logged</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
