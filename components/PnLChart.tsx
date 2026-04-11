'use client'

import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { Position } from '@/lib/types'

export function PnLChart({ positions }: { positions: Position[] }) {
  const data = useMemo(() => {
    const settled = positions
      .filter((p) => p.status === 'settled' && p.pnl !== null)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    let cum = 0
    return settled.map((p) => {
      cum += p.pnl ?? 0
      return { date: p.date, pnl: Math.round(cum * 100) / 100 }
    })
  }, [positions])

  if (data.length === 0) {
    return (
      <div className="border border-border bg-bg2 p-12 text-center label">
        No settled positions to chart yet
      </div>
    )
  }

  const lastPnl = data[data.length - 1].pnl
  const stroke = lastPnl >= 0 ? 'var(--green)' : 'var(--red)'

  return (
    <div className="border border-border bg-bg2 p-4">
      <div className="label mb-2">CUMULATIVE P&L</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis dataKey="date" stroke="var(--muted)" tick={{ fontSize: 10 }} />
            <YAxis stroke="var(--muted)" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke={stroke}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
