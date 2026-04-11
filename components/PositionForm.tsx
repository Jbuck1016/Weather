'use client'

import { useState, useEffect } from 'react'
import type { EdgeResult } from '@/lib/types'
import { americanOdds } from '@/lib/edge'

interface Props {
  edge: EdgeResult | null
  onClose: () => void
  onSuccess: () => void
}

export function PositionForm({ edge, onClose, onSuccess }: Props) {
  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [contracts, setContracts] = useState(0)
  const [entryCents, setEntryCents] = useState(0)
  const [limitCents, setLimitCents] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!edge) return
    const initialSide = edge.direction === 'BUY YES' ? 'YES' : 'NO'
    setSide(initialSide)
    setContracts(edge.contracts)
    const entry = initialSide === 'YES' ? edge.yesAsk : edge.noAsk
    setEntryCents(entry)
    setLimitCents(entry + 1)
    setErr(null)
  }, [edge])

  if (!edge) return null

  const submit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      const body = {
        market_ticker: edge.ticker,
        city: edge.city,
        market_type: 'high',
        date: edge.dateIso,
        subtitle: edge.subtitle,
        side,
        contracts,
        entry_price_cents: entryCents,
        limit_price_cents: limitCents,
        edge_pct_at_entry: edge.edgePct,
        nws_temp_at_entry: edge.nwsTemp,
        nws_prob_at_entry: edge.nwsProb,
        kalshi_prob_at_entry: edge.kalshiProb,
        kelly_pct: edge.kellyPct,
        actual_cost: (contracts * entryCents) / 100,
        status: 'open',
        source: 'manual',
      }
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onSuccess()
      onClose()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg2 border border-border max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="heading text-lg text-accent">LOG POSITION</h2>
          <button onClick={onClose} className="text-muted hover:text-text">×</button>
        </div>

        <div className="space-y-3">
          <Field label="Market Ticker">
            <div className="font-mono text-[11px] text-text">{edge.ticker}</div>
          </Field>
          <Field label="City">
            <div className="text-text">{edge.city}</div>
          </Field>
          <Field label="Range">
            <div className="text-text">{edge.subtitle}</div>
          </Field>
          <Field label="Side">
            <div className="flex gap-2">
              {(['YES', 'NO'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSide(s)
                    const entry = s === 'YES' ? edge.yesAsk : edge.noAsk
                    setEntryCents(entry)
                    setLimitCents(entry + 1)
                  }}
                  className={`flex-1 py-2 border ${
                    side === s
                      ? s === 'YES'
                        ? 'bg-green/20 border-green text-green'
                        : 'bg-red/20 border-red text-red'
                      : 'border-border text-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contracts">
              <input
                type="number"
                value={contracts}
                onChange={(e) => setContracts(parseInt(e.target.value || '0'))}
                className="w-full"
              />
            </Field>
            <Field label="Entry (odds)">
              <input
                type="number"
                value={entryCents}
                onChange={(e) => setEntryCents(parseInt(e.target.value || '0'))}
                className="w-full"
              />
              <div className="label mt-1">{americanOdds(entryCents)}</div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Limit (odds)">
              <input
                type="number"
                value={limitCents}
                onChange={(e) => setLimitCents(parseInt(e.target.value || '0'))}
                className="w-full"
              />
              <div className="label mt-1">{americanOdds(limitCents)}</div>
            </Field>
            <Field label="Cost">
              <div className="text-green">${((contracts * entryCents) / 100).toFixed(2)}</div>
            </Field>
          </div>
          <div className="text-[11px] text-muted space-y-1">
            <div>
              Edge at entry: <span className="text-text">{edge.edgePct > 0 ? '+' : ''}{edge.edgePct.toFixed(1)}%</span> ·
              NWS: <span className="text-text">{edge.nwsTemp.toFixed(0)}°F</span> ·
              Kelly suggests <span className="text-accent">{edge.contracts}</span> contracts
            </div>
            <div>
              Fee EV: <span className={edge.feeAdjustedEvPct > 0 ? 'text-green' : 'text-red'}>
                {Math.abs(edge.feeAdjustedEvPct) > 200
                  ? edge.feeAdjustedEvPct > 0 ? 'HIGH' : 'NEGATIVE'
                  : `${edge.feeAdjustedEvPct > 0 ? '+' : ''}${edge.feeAdjustedEvPct.toFixed(1)}%`}
              </span>
              {' · '}Fees: <span className="text-text">
                {Math.abs(edge.feeDragPct) > 200 ? 'HIGH FEES' : `-${Math.abs(edge.feeDragPct).toFixed(1)}%`}
              </span>
              {' · '}Break-even: <span className="text-text">{(edge.breakEvenProb * 100).toFixed(1)}%</span>
            </div>
          </div>

          {err && <div className="text-red text-xs">{err}</div>}

          <button
            onClick={submit}
            disabled={submitting || contracts <= 0}
            className="w-full py-2 bg-accent text-bg font-bold tracking-wider disabled:opacity-40"
          >
            {submitting ? 'LOGGING…' : 'LOG POSITION'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  )
}
