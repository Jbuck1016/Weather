'use client'

import { useState, useMemo } from 'react'
import clsx from 'clsx'
import type { EdgeSignalRow } from '@/lib/types'

interface Props {
  signals: EdgeSignalRow[]
  onChanged: () => void
}

const TODAY = new Date().toISOString().slice(0, 10)

function statusOf(s: EdgeSignalRow): 'WIN' | 'LOSS' | 'NEEDS' | 'PENDING' {
  if (s.settlement_result === 'WIN') return 'WIN'
  if (s.settlement_result === 'LOSS') return 'LOSS'
  if (!s.settled && s.market_date <= TODAY) return 'NEEDS'
  return 'PENDING'
}

export function SignalHistory({ signals, onChanged }: Props) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'won' | 'lost' | 'needs'>('all')
  const [cityFilter, setCityFilter] = useState<string>('')
  const [labelFilter, setLabelFilter] = useState<string>('')
  const [marketTypeFilter, setMarketTypeFilter] = useState<string>('')
  const [settling, setSettling] = useState<string | null>(null)
  const [tempInput, setTempInput] = useState<Record<string, string>>({})

  const cities = useMemo(
    () => Array.from(new Set(signals.map((s) => s.city))).sort(),
    [signals],
  )

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      const status = statusOf(s)
      if (statusFilter === 'won' && status !== 'WIN') return false
      if (statusFilter === 'lost' && status !== 'LOSS') return false
      if (statusFilter === 'pending' && status !== 'PENDING') return false
      if (statusFilter === 'needs' && status !== 'NEEDS') return false
      if (cityFilter && s.city !== cityFilter) return false
      if (labelFilter && s.edge_label !== labelFilter) return false
      if (marketTypeFilter && s.market_type !== marketTypeFilter) return false
      return true
    })
  }, [signals, statusFilter, cityFilter, labelFilter, marketTypeFilter])

  const settle = async (id: string) => {
    const t = parseFloat(tempInput[id] || '0')
    if (!Number.isFinite(t)) return
    setSettling(id)
    try {
      const res = await fetch(`/api/signals/${id}/settle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlement_temp: t }),
      })
      if (res.ok) {
        setTempInput((s) => { const n = { ...s }; delete n[id]; return n })
        onChanged()
      }
    } finally {
      setSettling(null)
    }
  }

  return (
    <div className="border border-border bg-bg2 rounded">
      <div className="p-3 border-b border-border flex flex-wrap gap-3 items-center">
        <div className="label">{filtered.length} SIGNALS</div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="text-xs">
          <option value="all">ALL STATUSES</option>
          <option value="needs">NEEDS SETTLEMENT</option>
          <option value="pending">PENDING</option>
          <option value="won">WON</option>
          <option value="lost">LOST</option>
        </select>
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="text-xs">
          <option value="">ALL CITIES</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} className="text-xs">
          <option value="">ALL STRENGTHS</option>
          <option value="STRONG">STRONG</option>
          <option value="MODERATE">MODERATE</option>
          <option value="WEAK">WEAK</option>
        </select>
        <select value={marketTypeFilter} onChange={(e) => setMarketTypeFilter(e.target.value)} className="text-xs">
          <option value="">ALL TYPES</option>
          <option value="high">HIGH</option>
          <option value="low">LOW</option>
        </select>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>City</th>
              <th>Range</th>
              <th>Edge%</th>
              <th>Direction</th>
              <th>Kalshi%</th>
              <th>NWS%</th>
              <th>Fee EV%</th>
              <th>Signal</th>
              <th>Status</th>
              <th>Temp</th>
              <th>Result</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const status = statusOf(s)
              return (
                <tr key={s.id}>
                  <td className="text-muted">{s.market_date}</td>
                  <td className="font-bold">{s.city}</td>
                  <td className="text-soft">{s.subtitle}</td>
                  <td className={clsx('font-bold', s.edge_pct > 0 ? 'text-green' : 'text-red')}>
                    {s.edge_pct > 0 ? '+' : ''}{s.edge_pct.toFixed(1)}%
                  </td>
                  <td className={s.direction === 'BUY YES' ? 'text-green' : 'text-red'}>
                    {s.direction}
                  </td>
                  <td>{(s.kalshi_prob * 100).toFixed(1)}%</td>
                  <td>{(s.nws_prob * 100).toFixed(1)}%</td>
                  <td className={clsx('font-bold', s.fee_adjusted_ev_pct > 0 ? 'text-green' : 'text-red')}>
                    {s.fee_adjusted_ev_pct > 0 ? '+' : ''}{s.fee_adjusted_ev_pct.toFixed(1)}%
                  </td>
                  <td>
                    <span className={clsx(
                      'px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full',
                      s.edge_label === 'STRONG' && 'bg-strong text-bg',
                      s.edge_label === 'MODERATE' && 'bg-yellow text-bg',
                      s.edge_label === 'WEAK' && 'bg-accent/20 text-accent border border-accent/40',
                    )}>
                      {s.edge_label}
                    </span>
                  </td>
                  <td>
                    <span className={clsx(
                      'px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full',
                      status === 'WIN' && 'bg-green text-bg',
                      status === 'LOSS' && 'bg-red text-bg',
                      status === 'NEEDS' && 'bg-strong text-bg',
                      status === 'PENDING' && 'bg-muted/30 text-muted border border-muted/40',
                    )}>
                      {status === 'WIN' ? '✓ WIN' : status === 'LOSS' ? '✗ LOSS' : status === 'NEEDS' ? 'NEEDS SETTLE' : 'PENDING'}
                    </span>
                  </td>
                  <td className="text-muted">{s.settlement_temp ?? '—'}</td>
                  <td className={clsx(
                    s.brier_score !== null && s.brier_score < 0.2 && 'text-green',
                    s.brier_score !== null && s.brier_score >= 0.25 && 'text-red',
                    s.brier_score !== null && s.brier_score >= 0.2 && s.brier_score < 0.25 && 'text-yellow',
                  )}>
                    {s.brier_score !== null ? `B=${s.brier_score.toFixed(3)}` : '—'}
                  </td>
                  <td>
                    {status === 'NEEDS' && (
                      <div className="flex gap-1 items-center">
                        <input
                          type="number"
                          placeholder="°F"
                          value={tempInput[s.id] ?? ''}
                          onChange={(e) => setTempInput((s2) => ({ ...s2, [s.id]: e.target.value }))}
                          className="w-14 text-[11px] py-1"
                        />
                        <button
                          onClick={() => settle(s.id)}
                          disabled={settling === s.id}
                          className="px-2 py-1 bg-strong text-bg text-[10px] font-bold rounded hover:brightness-110"
                        >
                          SETTLE
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={13} className="text-center label py-8">No signals match the current filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
