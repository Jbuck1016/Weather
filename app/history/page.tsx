'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { americanOdds } from '@/lib/edge'

interface TradeAnalysis {
  id: string
  created_at: string
  bot_trade_id: string
  market_ticker: string
  city: string
  market_date: string | null
  market_type: string | null
  edge_at_entry: number | null
  kalshi_prob_at_entry: number | null
  model_prob_at_entry: number | null
  inter_model_spread_at_entry: number | null
  entry_price_cents: number | null
  entry_hour_pacific: number | null
  entry_session: 'morning' | 'afternoon' | 'evening' | null
  hours_held: number | null
  forecast_temp_at_entry: number | null
  actual_high: number | null
  forecast_error_f: number | null
  forecast_abs_error_f: number | null
  edge_at_close: number | null
  edge_compression: number | null
  settlement_result: 'WIN' | 'LOSS' | null
  gross_pnl: number | null
  net_pnl: number | null
  roi_pct: number | null
  top_models: string[] | null
  model_count: number | null
  forecast_source: string | null
}

interface SettledTrade {
  id: string
  market_ticker: string
  city: string
  market_date: string
  subtitle: string | null
  side: 'YES' | 'NO'
  contracts: number
  entry_price_cents: number
  cost: number
  edge_pct_at_entry: number | null
  inter_model_spread: number | null
  net_pnl: number | null
  gross_pnl: number | null
  settlement_result: 'WIN' | 'LOSS' | null
  closed_at: string | null
  created_at: string
}

interface Snapshot {
  captured_at: string
  edge_pct: number
  kalshi_prob: number
  yes_bid_cents: number
  yes_ask_cents: number
  hours_since_entry: number | null
}

interface AnalysisResponse {
  trades: TradeAnalysis[]
  summary: {
    wins: number
    losses: number
    netPnl: number
    avgEdge: number
    avgForecastError: number
  }
  byCity: Record<
    string,
    { wins: number; losses: number; netPnl: number; avgEdge: number; count: number }
  >
  bySession: Record<string, { wins: number; losses: number }>
}

const EMPTY = 'Waiting for first settlement — markets close tonight.'

export default function HistoryPage() {
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [settled, setSettled] = useState<SettledTrade[]>([])
  const [snapshotCache, setSnapshotCache] = useState<Record<string, Snapshot[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [citySort, setCitySort] = useState<'netPnl' | 'winRate' | 'trades' | 'avgEdge'>('netPnl')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, t] = await Promise.all([
        fetch('/api/bot/analysis', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/bot/trades?status=settled&limit=200', { cache: 'no-store' }).then((r) => r.json()),
      ])
      setAnalysis(a)
      setSettled(t.trades ?? [])
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const i = setInterval(load, 60_000)
    return () => clearInterval(i)
  }, [load])

  const fetchSnapshots = useCallback(async (tradeId: string) => {
    if (snapshotCache[tradeId]) return
    try {
      const r = await fetch(`/api/bot/snapshots/${tradeId}`, { cache: 'no-store' })
      const j = await r.json()
      setSnapshotCache((c) => ({ ...c, [tradeId]: j.snapshots ?? [] }))
    } catch (e) {
      setSnapshotCache((c) => ({ ...c, [tradeId]: [] }))
    }
  }, [snapshotCache])

  const settledAnalyses = useMemo(
    () => (analysis?.trades ?? []).filter((t) => t.settlement_result),
    [analysis],
  )

  const summary = useMemo(() => {
    const rows = settledAnalyses
    const count = rows.length
    const wins = rows.filter((r) => r.settlement_result === 'WIN').length
    const losses = rows.filter((r) => r.settlement_result === 'LOSS').length
    const net = rows.reduce((s, r) => s + (r.net_pnl ?? 0), 0)
    const avgEdge = count ? rows.reduce((s, r) => s + Math.abs(r.edge_at_entry ?? 0), 0) / count : 0
    const avgErr = count ? rows.reduce((s, r) => s + (r.forecast_error_f ?? 0), 0) / count : 0
    const avgRoi = count ? rows.reduce((s, r) => s + (r.roi_pct ?? 0), 0) / count : 0
    const avgHours = count ? rows.reduce((s, r) => s + (r.hours_held ?? 0), 0) / count : 0
    return { count, wins, losses, net, avgEdge, avgErr, avgRoi, avgHours }
  }, [settledAnalyses])

  const cityRows = useMemo(() => {
    const raw = Object.entries(analysis?.byCity ?? {}).map(([city, v]) => {
      const total = v.wins + v.losses
      const winRate = total > 0 ? (v.wins / total) * 100 : 0
      const cityTrades = settledAnalyses.filter((t) => t.city === city)
      const avgErr = cityTrades.length
        ? cityTrades.reduce((s, t) => s + (t.forecast_error_f ?? 0), 0) / cityTrades.length
        : 0
      return { city, ...v, winRate, avgErr }
    })
    raw.sort((a, b) => {
      switch (citySort) {
        case 'winRate': return b.winRate - a.winRate
        case 'trades': return b.count - a.count
        case 'avgEdge': return b.avgEdge - a.avgEdge
        case 'netPnl':
        default: return b.netPnl - a.netPnl
      }
    })
    return raw
  }, [analysis, settledAnalyses, citySort])

  const spreadBuckets = useMemo(() => {
    const buckets = [
      { label: '<2°F', min: 0, max: 2 },
      { label: '2-3°F', min: 2, max: 3 },
      { label: '3-4°F', min: 3, max: 4 },
      { label: '≥4°F', min: 4, max: Infinity },
    ]
    return buckets.map((b) => {
      const rows = settledAnalyses.filter((t) => {
        const s = t.inter_model_spread_at_entry ?? 0
        return s >= b.min && s < b.max
      })
      const wins = rows.filter((r) => r.settlement_result === 'WIN').length
      const total = rows.length
      const winRate = total > 0 ? (wins / total) * 100 : 0
      const avgEdge = total
        ? rows.reduce((s, r) => s + Math.abs(r.edge_at_entry ?? 0), 0) / total
        : 0
      return { label: b.label, trades: total, winRate, avgEdge }
    })
  }, [settledAnalyses])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="heading text-lg text-text">HISTORY · ANALYSIS</h1>
        <div className="flex items-center gap-3">
          <span className="label text-muted">
            LAST UPDATED {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="px-2.5 py-1 border border-accent/50 text-accent text-[10px] font-bold tracking-wider hover:bg-accent/15 rounded disabled:opacity-50"
          >
            {loading ? 'REFRESHING…' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Section 1 — Summary */}
      {summary.count === 0 ? (
        <div className="border border-border bg-bg2 rounded p-6 text-center label">
          No settled trades yet — check back after markets close tonight.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 bg-bg2 border border-border p-3 rounded">
          <Stat label="Settled" value={summary.count.toString()} />
          <Stat
            label="Win Rate"
            value={`${summary.count > 0 ? ((summary.wins / summary.count) * 100).toFixed(0) : 0}%`}
            sub={`${summary.wins}-${summary.losses}`}
          />
          <Stat
            label="Net P&L"
            value={`${summary.net >= 0 ? '+' : ''}$${summary.net.toFixed(2)}`}
            color={summary.net >= 0 ? 'text-green' : 'text-red'}
          />
          <Stat label="Avg Edge" value={`${summary.avgEdge.toFixed(1)}%`} />
          <Stat
            label="Avg Forecast Err"
            value={`${summary.avgErr > 0 ? '+' : ''}${summary.avgErr.toFixed(1)}°F`}
            sub={Math.abs(summary.avgErr) < 0.5 ? 'calibrated' : summary.avgErr > 0 ? 'warm bias' : 'cold bias'}
            color={Math.abs(summary.avgErr) < 0.5 ? 'text-green' : 'text-yellow'}
          />
          <Stat
            label="Avg ROI"
            value={`${summary.avgRoi >= 0 ? '+' : ''}${summary.avgRoi.toFixed(1)}%`}
            color={summary.avgRoi >= 0 ? 'text-green' : 'text-red'}
          />
          <Stat label="Avg Held" value={`${summary.avgHours.toFixed(1)}h`} />
        </div>
      )}

      {/* Section 2 — By City */}
      <Section title="PERFORMANCE BY CITY">
        {cityRows.length === 0 ? (
          <EmptyRow>{EMPTY}</EmptyRow>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th onClick={() => setCitySort('trades')}>City</th>
                  <th onClick={() => setCitySort('trades')}>Trades</th>
                  <th>W</th>
                  <th>L</th>
                  <th onClick={() => setCitySort('winRate')}>Win Rate</th>
                  <th onClick={() => setCitySort('netPnl')}>Net P&L</th>
                  <th onClick={() => setCitySort('avgEdge')}>Avg Edge</th>
                  <th>Avg Forecast Err</th>
                </tr>
              </thead>
              <tbody>
                {cityRows.map((r) => (
                  <tr key={r.city}>
                    <td className="font-bold">{r.city}</td>
                    <td>{r.count}</td>
                    <td className="text-green">{r.wins}</td>
                    <td className="text-red">{r.losses}</td>
                    <td className={winRateColor(r.winRate)}>{r.winRate.toFixed(0)}%</td>
                    <td className={r.netPnl >= 0 ? 'text-green' : 'text-red'}>
                      {r.netPnl >= 0 ? '+' : ''}${r.netPnl.toFixed(2)}
                    </td>
                    <td>{r.avgEdge.toFixed(1)}%</td>
                    <td className={errColor(r.avgErr)}>
                      {r.avgErr > 0 ? '+' : ''}{r.avgErr.toFixed(1)}°F
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section 3 — By Session */}
      <Section title="PERFORMANCE BY ENTRY SESSION">
        {Object.keys(analysis?.bySession ?? {}).length === 0 ? (
          <EmptyRow>{EMPTY}</EmptyRow>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Trades</th>
                  <th>W</th>
                  <th>L</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {(['morning', 'afternoon', 'evening'] as const).map((s) => {
                  const v = analysis?.bySession?.[s] ?? { wins: 0, losses: 0 }
                  const total = v.wins + v.losses
                  const winRate = total > 0 ? (v.wins / total) * 100 : 0
                  return (
                    <tr key={s}>
                      <td className="font-bold capitalize">{s}</td>
                      <td>{total}</td>
                      <td className="text-green">{v.wins}</td>
                      <td className="text-red">{v.losses}</td>
                      <td className={total > 0 ? winRateColor(winRate) : 'text-muted'}>
                        {total > 0 ? `${winRate.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section 4 — Edge Decay Cards */}
      <Section title="EDGE DECAY PER TRADE">
        {settledAnalyses.length === 0 ? (
          <EmptyRow>{EMPTY}</EmptyRow>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
            {settledAnalyses.map((t) => (
              <DecayCard
                key={t.bot_trade_id}
                trade={t}
                snapshots={snapshotCache[t.bot_trade_id]}
                onMount={() => fetchSnapshots(t.bot_trade_id)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Section 5 — Forecast Accuracy */}
      <Section title="FORECAST ACCURACY">
        {settledAnalyses.length === 0 ? (
          <EmptyRow>{EMPTY}</EmptyRow>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>City</th>
                  <th>Date</th>
                  <th>Model Forecast</th>
                  <th>Actual High</th>
                  <th>Error</th>
                  <th>Direction</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {[...settledAnalyses]
                  .sort(
                    (a, b) =>
                      (b.forecast_abs_error_f ?? 0) - (a.forecast_abs_error_f ?? 0),
                  )
                  .map((t) => {
                    const err = t.forecast_error_f
                    const direction =
                      err === null
                        ? '—'
                        : Math.abs(err) < 1
                          ? 'ACCURATE'
                          : err > 0
                            ? 'WARM BIAS'
                            : 'COLD BIAS'
                    return (
                      <tr key={t.bot_trade_id}>
                        <td className="font-bold">{t.city}</td>
                        <td className="text-muted text-[11px]">{t.market_date ?? '—'}</td>
                        <td>{t.forecast_temp_at_entry !== null ? `${t.forecast_temp_at_entry.toFixed(0)}°F` : '—'}</td>
                        <td>{t.actual_high !== null ? `${t.actual_high.toFixed(0)}°F` : '—'}</td>
                        <td className={errColor(err ?? 0)}>
                          {err !== null ? `${err > 0 ? '+' : ''}${err.toFixed(1)}°F` : '—'}
                        </td>
                        <td className="text-soft text-[11px]">{direction}</td>
                        <td>
                          <ResultBadge result={t.settlement_result} />
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section 6 — Spread vs Outcome */}
      <Section title="INTER-MODEL SPREAD vs OUTCOME">
        {settledAnalyses.length === 0 ? (
          <EmptyRow>{EMPTY}</EmptyRow>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Spread</th>
                  <th>Trades</th>
                  <th>Win Rate</th>
                  <th>Avg Edge</th>
                </tr>
              </thead>
              <tbody>
                {spreadBuckets.map((b) => (
                  <tr key={b.label}>
                    <td className="font-bold">{b.label}</td>
                    <td>{b.trades}</td>
                    <td className={b.trades > 0 ? winRateColor(b.winRate) : 'text-muted'}>
                      {b.trades > 0 ? `${b.winRate.toFixed(0)}%` : '—'}
                    </td>
                    <td>{b.trades > 0 ? `${b.avgEdge.toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section 7 — Raw settled trades */}
      <Section title={`RAW SETTLED TRADES · ${settled.length}`}>
        {settled.length === 0 ? (
          <EmptyRow>{EMPTY}</EmptyRow>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>City</th>
                  <th>Ticker</th>
                  <th>Side</th>
                  <th>Entry ¢</th>
                  <th>Odds</th>
                  <th>Cont</th>
                  <th>Cost</th>
                  <th>Payout</th>
                  <th>Edge@Entry</th>
                  <th>Spread</th>
                  <th>Session</th>
                  <th>Fcst Err</th>
                  <th>Result</th>
                  <th>Net P&L</th>
                  <th>ROI%</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((t) => {
                  const analysisRow = settledAnalyses.find((a) => a.bot_trade_id === t.id)
                  const isOpen = expanded === t.id
                  const rowClass =
                    t.settlement_result === 'WIN'
                      ? 'row-strong'
                      : t.settlement_result === 'LOSS'
                        ? 'row-weak'
                        : ''
                  return (
                    <>
                      <tr
                        key={t.id}
                        className={clsx(rowClass, 'cursor-pointer')}
                        onClick={() => {
                          if (isOpen) setExpanded(null)
                          else {
                            setExpanded(t.id)
                            fetchSnapshots(t.id)
                          }
                        }}
                      >
                        <td className="text-muted text-[11px]">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>
                        <td className="font-bold">{t.city}</td>
                        <td className="font-mono text-[10px] text-accent">{t.market_ticker}</td>
                        <td className={t.side === 'YES' ? 'text-green' : 'text-strong'}>{t.side}</td>
                        <td>{t.entry_price_cents}¢</td>
                        <td className="font-mono text-soft">{americanOdds(t.entry_price_cents)}</td>
                        <td>{t.contracts}</td>
                        <td>${t.cost.toFixed(2)}</td>
                        <td className="text-green">
                          +${((t.contracts * (100 - t.entry_price_cents)) / 100).toFixed(2)}
                        </td>
                        <td className={t.edge_pct_at_entry && t.edge_pct_at_entry > 0 ? 'text-green' : 'text-red'}>
                          {t.edge_pct_at_entry !== null ? `${t.edge_pct_at_entry > 0 ? '+' : ''}${t.edge_pct_at_entry.toFixed(1)}%` : '—'}
                        </td>
                        <td className="text-soft">
                          {t.inter_model_spread !== null ? `±${t.inter_model_spread.toFixed(1)}°` : '—'}
                        </td>
                        <td className="text-soft text-[11px] capitalize">
                          {analysisRow?.entry_session ?? '—'}
                        </td>
                        <td className={errColor(analysisRow?.forecast_error_f ?? 0)}>
                          {analysisRow?.forecast_error_f !== null && analysisRow?.forecast_error_f !== undefined
                            ? `${analysisRow.forecast_error_f > 0 ? '+' : ''}${analysisRow.forecast_error_f.toFixed(1)}°`
                            : '—'}
                        </td>
                        <td><ResultBadge result={t.settlement_result} /></td>
                        <td className={
                          t.net_pnl !== null && t.net_pnl > 0 ? 'text-green font-bold'
                            : t.net_pnl !== null && t.net_pnl < 0 ? 'text-red font-bold'
                              : 'text-muted'
                        }>
                          {t.net_pnl !== null ? `${t.net_pnl >= 0 ? '+' : ''}$${t.net_pnl.toFixed(2)}` : '—'}
                        </td>
                        <td className={
                          analysisRow?.roi_pct && analysisRow.roi_pct > 0 ? 'text-green'
                            : analysisRow?.roi_pct && analysisRow.roi_pct < 0 ? 'text-red'
                              : 'text-muted'
                        }>
                          {analysisRow?.roi_pct !== null && analysisRow?.roi_pct !== undefined
                            ? `${analysisRow.roi_pct >= 0 ? '+' : ''}${analysisRow.roi_pct.toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${t.id}-exp`}>
                          <td colSpan={16} className="bg-bg3 p-3">
                            <EdgeDecaySparkline snapshots={snapshotCache[t.id]} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={clsx('text-base font-extrabold mt-0.5', color || 'text-text')}>{value}</div>
      {sub && <div className="label mt-0.5">{sub}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-bg2 rounded">
      <div className="p-3 border-b border-border label">{title}</div>
      {children}
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-center label">{children}</div>
}

function ResultBadge({ result }: { result: 'WIN' | 'LOSS' | null }) {
  if (!result) return <span className="text-muted">—</span>
  return (
    <span className={clsx(
      'px-2 py-0.5 text-[10px] font-extrabold tracking-wider rounded-full',
      result === 'WIN' ? 'bg-green text-bg' : 'bg-red text-bg',
    )}>
      {result}
    </span>
  )
}

function winRateColor(wr: number) {
  if (wr > 60) return 'text-green font-bold'
  if (wr >= 40) return 'text-yellow font-bold'
  return 'text-red font-bold'
}

function errColor(err: number) {
  const a = Math.abs(err)
  if (a < 1) return 'text-green'
  if (a <= 3) return 'text-yellow'
  return 'text-red'
}

function DecayCard({
  trade, snapshots, onMount,
}: { trade: TradeAnalysis; snapshots: Snapshot[] | undefined; onMount: () => void }) {
  useEffect(() => { onMount() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  const entry = trade.edge_at_entry
  const close = trade.edge_at_close
  const compression = trade.edge_compression
  const arrow = compression === null ? '—' : compression > 0 ? '↓' : '↑'

  const chartData =
    snapshots && snapshots.length > 0
      ? snapshots.map((s, i) => ({
          i,
          edge: s.edge_pct,
          hrs: s.hours_since_entry ?? i,
        }))
      : []

  return (
    <div className="border border-border bg-bg3 rounded p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-bold text-text">{trade.city}</div>
          <div className="font-mono text-[10px] text-accent truncate max-w-[200px]">
            {trade.market_ticker}
          </div>
        </div>
        <ResultBadge result={trade.settlement_result} />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-soft">
          {entry !== null ? `${entry > 0 ? '+' : ''}${entry.toFixed(1)}%` : '—'}
          {' '}<span className="text-muted">{arrow}</span>{' '}
          {close !== null ? `${close > 0 ? '+' : ''}${close.toFixed(1)}%` : '—'}
        </span>
        <span className={clsx(
          'font-bold',
          trade.net_pnl !== null && trade.net_pnl > 0 && 'text-green',
          trade.net_pnl !== null && trade.net_pnl < 0 && 'text-red',
        )}>
          {trade.net_pnl !== null ? `${trade.net_pnl >= 0 ? '+' : ''}$${trade.net_pnl.toFixed(2)}` : '—'}
        </span>
      </div>
      <div className="h-20">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="edge"
                stroke="var(--accent)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center label text-[10px]">
            {snapshots === undefined ? 'Loading…' : 'No decay data'}
          </div>
        )}
      </div>
      {trade.forecast_temp_at_entry !== null && trade.actual_high !== null && (
        <div className="text-[11px] text-muted">
          Model said {trade.forecast_temp_at_entry.toFixed(0)}°F, actual was {trade.actual_high.toFixed(0)}°F
          {trade.forecast_error_f !== null && (
            <span className={clsx(' ml-1', errColor(trade.forecast_error_f))}>
              → {trade.forecast_error_f > 0 ? '+' : ''}{trade.forecast_error_f.toFixed(1)}°F {trade.forecast_error_f > 0 ? 'warm' : trade.forecast_error_f < 0 ? 'cold' : ''} bias
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function EdgeDecaySparkline({ snapshots }: { snapshots: Snapshot[] | undefined }) {
  if (!snapshots) return <div className="label text-center">Loading snapshots…</div>
  if (snapshots.length < 2) return <div className="label text-center">No decay data</div>
  const data = snapshots.map((s, i) => ({ i, edge: s.edge_pct, hrs: s.hours_since_entry ?? i }))
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="hrs" stroke="var(--muted)" tick={{ fontSize: 10 }} label={{ value: 'hours since entry', position: 'insideBottom', offset: -2, style: { fontSize: 10, fill: 'var(--muted)' } }} />
          <YAxis stroke="var(--muted)" tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 11 }} />
          <Line type="monotone" dataKey="edge" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
