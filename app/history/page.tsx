'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import clsx from 'clsx'
import { CalibrationChart } from '@/components/CalibrationChart'
import { SignalHistory } from '@/components/SignalHistory'
import type { EdgeSignalRow, CalibrationBucket } from '@/lib/types'

export default function HistoryPage() {
  const [signals, setSignals] = useState<EdgeSignalRow[]>([])
  const [buckets, setBuckets] = useState<CalibrationBucket[]>([])
  const [totalSettled, setTotalSettled] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sigRes, calRes] = await Promise.all([
        fetch('/api/signals?limit=1000').then((r) => r.json()),
        fetch('/api/calibration').then((r) => r.json()),
      ])
      setSignals(sigRes.signals ?? [])
      setBuckets(calRes.buckets ?? [])
      setTotalSettled(calRes.totalSettled ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const total = signals.length
    const settled = signals.filter((s) => s.settled).length
    const wins = signals.filter((s) => s.settlement_result === 'WIN').length
    const winRate = settled > 0 ? (wins / settled) * 100 : 0
    const briers = signals.filter((s) => s.brier_score !== null).map((s) => s.brier_score as number)
    const avgBrier = briers.length > 0 ? briers.reduce((a, b) => a + b, 0) / briers.length : 0
    return { total, settled, winRate, avgBrier }
  }, [signals])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total Signals" value={summary.total.toString()} />
        <Card label="Settled" value={summary.settled.toString()} />
        <Card
          label="Overall Win Rate"
          value={`${summary.winRate.toFixed(1)}%`}
          color={summary.winRate >= 50 ? 'text-green' : 'text-red'}
        />
        <Card
          label="Avg Brier Score"
          value={summary.avgBrier.toFixed(3)}
          sub={summary.avgBrier < 0.2 ? 'CALIBRATED' : summary.avgBrier < 0.25 ? 'OK' : 'POOR'}
          color={
            summary.avgBrier < 0.2 ? 'text-green'
            : summary.avgBrier < 0.25 ? 'text-yellow'
            : 'text-red'
          }
        />
      </div>

      <CalibrationChart buckets={buckets} totalSettled={totalSettled} />

      <div className="flex items-center justify-between">
        <h2 className="heading text-base text-text">SIGNAL HISTORY</h2>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 border border-accent/40 text-accent text-xs tracking-wider hover:bg-accent/10 rounded"
        >
          {loading ? 'LOADING…' : 'REFRESH'}
        </button>
      </div>

      <SignalHistory signals={signals} onChanged={load} />
    </div>
  )
}

function Card({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-border bg-bg2 p-4 rounded">
      <div className="label">{label}</div>
      <div className={clsx('text-2xl font-extrabold mt-1', color || 'text-text')}>{value}</div>
      {sub && <div className="label mt-1">{sub}</div>}
    </div>
  )
}
