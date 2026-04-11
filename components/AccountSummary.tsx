'use client'

import clsx from 'clsx'
import type { Position } from '@/lib/types'

interface Props {
  positions: Position[]
}

export function AccountSummary({ positions }: Props) {
  const settled = positions.filter((p) => p.status === 'settled')
  const totalWagered = positions.reduce((a, p) => a + (p.actual_cost ?? 0), 0)
  const realized = settled.reduce((a, p) => a + (p.pnl ?? 0), 0)
  const wins = settled.filter((p) => p.settlement_result === 'WIN').length
  const winRate = settled.length > 0 ? (wins / settled.length) * 100 : 0
  const edges = positions
    .filter((p) => p.edge_pct_at_entry !== null)
    .map((p) => Math.abs(p.edge_pct_at_entry as number))
  const avgEdge = edges.length > 0 ? edges.reduce((a, b) => a + b, 0) / edges.length : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card label="Total Wagered" value={`$${totalWagered.toFixed(2)}`} />
      <Card
        label="Realized P&L"
        value={`$${realized.toFixed(2)}`}
        color={realized >= 0 ? 'text-green' : 'text-red'}
      />
      <Card label="Win Rate" value={`${winRate.toFixed(1)}%`} sub={`${wins}/${settled.length}`} />
      <Card label="Avg Edge @ Entry" value={`${avgEdge.toFixed(1)}%`} />
    </div>
  )
}

function Card({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-border bg-bg2 p-4">
      <div className="label">{label}</div>
      <div className={clsx('text-2xl font-bold mt-1', color || 'text-text')}>{value}</div>
      {sub && <div className="label mt-1">{sub}</div>}
    </div>
  )
}
