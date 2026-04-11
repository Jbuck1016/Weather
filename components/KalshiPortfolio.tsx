'use client'

import clsx from 'clsx'
import type { PortfolioResponse } from '@/lib/types'
import { americanOdds } from '@/lib/edge'

export function KalshiPortfolio({ data }: { data: PortfolioResponse | null }) {
  if (!data) return <div className="label p-6 text-center">Loading Kalshi portfolio…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCell label="Record" value={`${data.summary.wins}-${data.summary.losses}`} />
        <SummaryCell label="Win Rate" value={`${data.summary.winRate}%`} />
        <SummaryCell label="Total Wagered" value={`$${data.summary.totalWagered.toFixed(2)}`} />
        <SummaryCell
          label="Realized P&L"
          value={`$${data.summary.totalPnl.toFixed(2)}`}
          color={data.summary.totalPnl >= 0 ? 'text-green' : 'text-red'}
        />
      </div>

      <div className="border border-border bg-bg2">
        <div className="p-3 border-b border-border label">OPEN POSITIONS · {data.openPositions.length}</div>
        <div className="overflow-x-auto scrollbar-thin">
          <table>
            <thead>
              <tr>
                <th>City</th>
                <th>Ticker</th>
                <th>Side</th>
                <th>Contracts</th>
                <th>Avg Entry</th>
                <th>Current</th>
                <th>Unrealized P&L</th>
              </tr>
            </thead>
            <tbody>
              {data.openPositions.map((p) => (
                <tr key={p.ticker}>
                  <td>{p.city}</td>
                  <td className="font-mono text-[11px]">{p.ticker}</td>
                  <td className={p.side === 'YES' ? 'text-green' : 'text-red'}>{p.side}</td>
                  <td>{p.contracts}</td>
                  <td>{americanOdds(Math.round(p.avgEntryCents))}</td>
                  <td>{americanOdds(Math.round(p.currentPriceCents))}</td>
                  <td className={clsx(p.unrealizedPnl >= 0 ? 'text-green' : 'text-red')}>
                    ${p.unrealizedPnl.toFixed(2)}
                  </td>
                </tr>
              ))}
              {data.openPositions.length === 0 && (
                <tr><td colSpan={7} className="text-center label py-6">No open positions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-border bg-bg2">
        <div className="p-3 border-b border-border label">SETTLED · {data.settledBets.length}</div>
        <div className="overflow-x-auto scrollbar-thin max-h-96">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>City</th>
                <th>Ticker</th>
                <th>Side</th>
                <th>Contracts</th>
                <th>Result</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {data.settledBets.map((s, i) => (
                <tr key={`${s.ticker}-${i}`}>
                  <td className="text-muted">{s.date}</td>
                  <td>{s.city}</td>
                  <td className="font-mono text-[11px]">{s.ticker}</td>
                  <td className={s.side === 'YES' ? 'text-green' : 'text-red'}>{s.side}</td>
                  <td>{s.contracts}</td>
                  <td className={s.result === 'WIN' ? 'text-green' : 'text-red'}>{s.result}</td>
                  <td className={s.pnl >= 0 ? 'text-green' : 'text-red'}>${s.pnl.toFixed(2)}</td>
                </tr>
              ))}
              {data.settledBets.length === 0 && (
                <tr><td colSpan={7} className="text-center label py-6">No settled bets</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-border bg-bg2 p-3">
      <div className="label">{label}</div>
      <div className={clsx('text-xl font-bold mt-1', color || 'text-text')}>{value}</div>
    </div>
  )
}
