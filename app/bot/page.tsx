'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import clsx from 'clsx'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

interface BotState {
  enabled: boolean
  paper_only: boolean
  paper_bankroll: number
  initial_bankroll: number
  peak_bankroll: number
  min_fee_ev_pct: number
  max_inter_model_spread: number
  min_edge_pct: number
  min_volume: number
  max_daily_spend: number
  max_open_positions: number
  max_positions_per_city: number
  max_trade_dollars: number
  kelly_fraction: number
  profit_take_multiple: number
  stop_loss_pct: number
  min_hours_to_close: number
  daily_spend_today: number
  daily_reset_date: string
  total_trades: number
  last_run_at: string | null
  last_run_status: string | null
  last_run_signals_evaluated: number | null
  last_run_trades_placed: number | null
}

interface BotTrade {
  id: string
  market_ticker: string
  city: string
  market_date: string
  subtitle: string | null
  side: 'YES' | 'NO'
  contracts: number
  entry_price_cents: number
  cost: number
  status: 'open' | 'closed' | 'settled'
  settlement_result: 'WIN' | 'LOSS' | null
  net_pnl: number | null
  created_at: string
  closed_at: string | null
  exit_price_cents: number | null
  exit_reason: string | null
}

interface BotDecision {
  id: string
  market_ticker: string
  city: string
  market_date: string
  subtitle: string
  edge_pct: number
  fee_ev_pct: number
  inter_model_spread: number
  signal_label: string
  direction: string
  action: string
  reason: string
  fee_ev_ok: boolean
  spread_ok: boolean
  volume_ok: boolean
  signal_strength_ok: boolean
  daily_limit_ok: boolean
  position_limit_ok: boolean
  city_limit_ok: boolean
  time_to_close_ok: boolean
  created_at: string
}

interface EquitySnapshot {
  created_at: string
  paper_bankroll: number
  open_positions_value: number
  total_equity: number
  open_trades: number
  total_pnl: number
}

const PARAM_FIELDS: { key: keyof BotState; label: string; step?: number; suffix?: string }[] = [
  { key: 'min_fee_ev_pct', label: 'Min Fee EV %', step: 0.5, suffix: '%' },
  { key: 'max_inter_model_spread', label: 'Max Spread', step: 0.5, suffix: '°F' },
  { key: 'min_edge_pct', label: 'Min Edge %', step: 0.5, suffix: '%' },
  { key: 'min_volume', label: 'Min Volume', step: 50 },
  { key: 'max_trade_dollars', label: 'Max Trade $', step: 5, suffix: '$' },
  { key: 'max_daily_spend', label: 'Max Daily Spend $', step: 25, suffix: '$' },
  { key: 'max_open_positions', label: 'Max Open Pos', step: 1 },
  { key: 'max_positions_per_city', label: 'Max Per City', step: 1 },
  { key: 'kelly_fraction', label: 'Kelly Fraction', step: 0.1 },
  { key: 'profit_take_multiple', label: 'Profit Take', step: 0.25, suffix: 'x' },
  { key: 'stop_loss_pct', label: 'Stop Loss', step: 0.05 },
  { key: 'min_hours_to_close', label: 'Min Hours', step: 0.5, suffix: 'h' },
]

export default function BotPage() {
  const [state, setState] = useState<BotState | null>(null)
  const [trades, setTrades] = useState<BotTrade[]>([])
  const [decisions, setDecisions] = useState<BotDecision[]>([])
  const [equity, setEquity] = useState<EquitySnapshot[]>([])
  const [editing, setEditing] = useState<Partial<BotState>>({})
  const [tab, setTab] = useState<'all' | 'trades' | 'skipped'>('all')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [s, t, d, e] = await Promise.all([
      fetch('/api/bot/state').then((r) => r.json()),
      fetch('/api/bot/trades?limit=200').then((r) => r.json()),
      fetch('/api/bot/decisions?limit=200').then((r) => r.json()),
      fetch('/api/bot/equity?days=7').then((r) => r.json()),
    ])
    if (s.state) setState(s.state)
    setTrades(t.trades ?? [])
    setDecisions(d.decisions ?? [])
    setEquity(e.snapshots ?? [])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const i = setInterval(load, 30000)
    return () => clearInterval(i)
  }, [load])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/bot/run', { method: 'POST' })
      const j = await res.json()
      showToast(
        j.error
          ? `Bot error: ${j.error}`
          : j.skipped
            ? 'Bot disabled — toggle on first'
            : `Cycle done: ${j.signals_evaluated ?? 0} signals, ${j.new_trades ?? 0} trades`,
      )
      await load()
    } finally {
      setRunning(false)
    }
  }

  const toggleEnabled = async () => {
    if (!state) return
    await fetch('/api/bot/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !state.enabled }),
    })
    await load()
  }

  const saveParams = async () => {
    setSaving(true)
    try {
      await fetch('/api/bot/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      setEditing({})
      showToast('Parameters saved')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const settledTrades = useMemo(() => trades.filter((t) => t.status === 'settled'), [trades])
  const wins = settledTrades.filter((t) => t.settlement_result === 'WIN').length
  const losses = settledTrades.filter((t) => t.settlement_result === 'LOSS').length
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0
  const openTrades = useMemo(() => trades.filter((t) => t.status === 'open'), [trades])
  const totalPnl = state ? state.paper_bankroll - (state.initial_bankroll ?? 500) : 0
  const pnlPct = state && state.initial_bankroll
    ? (totalPnl / state.initial_bankroll) * 100
    : 0

  const filteredDecisions = useMemo(() => {
    if (tab === 'trades') return decisions.filter((d) => d.action === 'BUY')
    if (tab === 'skipped') return decisions.filter((d) => d.action === 'SKIP')
    return decisions
  }, [decisions, tab])

  if (!state) return <div className="p-12 text-center label">Loading bot state…</div>

  const status = state.enabled ? 'RUNNING' : 'PAUSED'
  const lastRunMins = state.last_run_at
    ? Math.round((Date.now() - new Date(state.last_run_at).getTime()) / 60000)
    : null

  const equityChartData = equity.map((s) => ({
    t: new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    equity: s.total_equity,
    bankroll: s.paper_bankroll,
    open: s.open_positions_value,
  }))

  return (
    <div className="space-y-4">
      {/* Section 1: Control Panel */}
      <div className="border border-border bg-bg2 rounded p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status + controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className={clsx(
                  'w-3 h-3 rounded-full',
                  state.enabled && 'bg-green pulse-dot',
                  !state.enabled && 'bg-muted',
                )}
              />
              <span className={clsx(
                'heading text-lg',
                state.enabled ? 'text-green' : 'text-muted',
              )}>
                {status}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-green/15 text-green border border-green/40">
                🔒 PAPER ONLY
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleEnabled}
                className={clsx(
                  'px-4 py-2 text-xs font-extrabold tracking-wider rounded',
                  state.enabled
                    ? 'bg-red text-bg hover:brightness-110'
                    : 'bg-green text-bg hover:brightness-110',
                )}
              >
                {state.enabled ? 'DISABLE' : 'ENABLE'}
              </button>
              <button
                onClick={runNow}
                disabled={running}
                className="px-4 py-2 bg-accent text-bg text-xs font-extrabold tracking-wider rounded hover:brightness-110 disabled:opacity-50"
              >
                {running ? 'RUNNING…' : 'RUN NOW'}
              </button>
            </div>
            <div className="text-[11px] text-muted">
              {state.last_run_at ? (
                <>
                  Last run {lastRunMins === 0 ? '<1' : lastRunMins}m ago —{' '}
                  {state.last_run_signals_evaluated ?? 0} signals,{' '}
                  {state.last_run_trades_placed ?? 0} trades
                </>
              ) : 'Never run'}
            </div>
            {state.last_run_status && state.last_run_status !== 'success' && (
              <div className="text-red text-[11px]">{state.last_run_status}</div>
            )}
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <Metric
              label="Bankroll"
              value={`$${state.paper_bankroll.toFixed(2)}`}
              sub={`vs $${(state.initial_bankroll ?? 500).toFixed(0)}`}
              color={state.paper_bankroll >= (state.initial_bankroll ?? 500) ? 'text-green' : 'text-red'}
            />
            <Metric
              label="Total P&L"
              value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`}
              sub={`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`}
              color={totalPnl >= 0 ? 'text-green' : 'text-red'}
            />
            <Metric
              label="Win Rate"
              value={`${winRate.toFixed(0)}%`}
              sub={`${wins}-${losses}`}
            />
            <Metric
              label="Open Pos"
              value={`${openTrades.length} / ${state.max_open_positions}`}
            />
            <Metric
              label="Today $"
              value={`$${state.daily_spend_today.toFixed(0)} / ${state.max_daily_spend}`}
            />
            <Metric
              label="Total Trades"
              value={`${state.total_trades ?? 0}`}
            />
          </div>

          {/* Parameter controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label">PARAMETERS</span>
              <button
                onClick={saveParams}
                disabled={saving || Object.keys(editing).length === 0}
                className="px-3 py-1 bg-accent text-bg text-[10px] font-extrabold tracking-wider rounded disabled:opacity-40"
              >
                {saving ? 'SAVING…' : 'SAVE'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
              {PARAM_FIELDS.map((f) => {
                const current = (editing[f.key] ?? state[f.key]) as number
                return (
                  <label key={f.key} className="text-[10px] text-muted">
                    {f.label}
                    <input
                      type="number"
                      step={f.step}
                      value={current}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!Number.isFinite(v)) return
                        setEditing((p) => ({ ...p, [f.key]: v }))
                      }}
                      className="w-full text-xs mt-0.5"
                    />
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Equity + Open Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 border border-border bg-bg2 rounded p-4">
          <div className="flex justify-between items-baseline mb-2">
            <h2 className="heading text-base text-text">EQUITY CURVE</h2>
            <span className="label">7 DAYS</span>
          </div>
          {equityChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center label">
              No equity snapshots yet — run the bot to start collecting data
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityChartData}>
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="t" stroke="var(--muted)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="var(--muted)" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine
                    y={state.initial_bankroll ?? 500}
                    stroke="var(--accent)"
                    strokeDasharray="4 4"
                    label={{ value: '$500 start', fill: 'var(--accent)', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke={totalPnl >= 0 ? 'var(--green)' : 'var(--red)'}
                    strokeWidth={2}
                    fill="url(#eqFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 border border-border bg-bg2 rounded">
          <div className="p-3 border-b border-border label">OPEN POSITIONS · {openTrades.length}</div>
          <div className="overflow-x-auto scrollbar-thin max-h-72">
            <table>
              <thead>
                <tr>
                  <th>City</th>
                  <th>Side</th>
                  <th>Cont</th>
                  <th>Entry</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((t) => (
                  <tr key={t.id}>
                    <td className="font-bold">{t.city}</td>
                    <td className={t.side === 'YES' ? 'text-green' : 'text-red'}>{t.side}</td>
                    <td>{t.contracts}</td>
                    <td>{t.entry_price_cents}¢</td>
                    <td>${t.cost.toFixed(2)}</td>
                  </tr>
                ))}
                {openTrades.length === 0 && (
                  <tr><td colSpan={5} className="text-center label py-6">No open positions</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 3: Decision Log */}
      <div className="border border-border bg-bg2 rounded">
        <div className="flex border-b border-border">
          {(['all', 'trades', 'skipped'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'px-4 py-2 text-xs font-bold tracking-wider border-b-2 -mb-px',
                tab === t
                  ? 'border-accent text-text'
                  : 'border-transparent text-muted hover:text-text',
              )}
            >
              {t === 'all' ? 'ALL DECISIONS' : t === 'trades' ? 'TRADES' : 'SKIPPED'}
            </button>
          ))}
          <span className="ml-auto p-2 label">{filteredDecisions.length} ROWS</span>
        </div>
        {tab === 'trades' ? (
          <TradesTable trades={trades} />
        ) : (
          <DecisionsTable
            decisions={filteredDecisions}
            expanded={expanded}
            onExpand={setExpanded}
          />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-green/90 text-bg px-4 py-2 font-bold tracking-wider z-50 rounded">
          {toast}
        </div>
      )}
    </div>
  )
}

function Metric({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-border bg-bg3 p-2 rounded">
      <div className="label">{label}</div>
      <div className={clsx('text-base font-extrabold mt-0.5', color || 'text-text')}>{value}</div>
      {sub && <div className="label">{sub}</div>}
    </div>
  )
}

function actionTone(action: string): string {
  switch (action) {
    case 'BUY': return 'bg-green text-bg'
    case 'PROFIT_TAKE': return 'bg-accent text-bg'
    case 'STOP_LOSS': return 'bg-red text-bg'
    case 'TIME_STOP': return 'bg-strong text-bg'
    case 'NEEDS_SETTLEMENT': return 'bg-yellow text-bg'
    case 'HOLD': return 'bg-muted/30 text-muted border border-muted/40'
    case 'SKIP':
    default:
      return 'bg-bg3 text-muted border border-border'
  }
}

function DecisionsTable({
  decisions, expanded, onExpand,
}: { decisions: BotDecision[]; expanded: string | null; onExpand: (id: string | null) => void }) {
  return (
    <div className="overflow-x-auto scrollbar-thin max-h-[600px]">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>City</th>
            <th>Range</th>
            <th>Action</th>
            <th style={{ width: '40%' }}>Reason</th>
            <th>Edge%</th>
            <th>Fee EV%</th>
            <th>Spread</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const isOpen = expanded === d.id
            return (
              <>
                <tr key={d.id}>
                  <td className="text-muted text-[11px]">
                    {new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="font-bold">{d.city}</td>
                  <td className="text-soft text-[11px]">{d.subtitle}</td>
                  <td>
                    <span className={clsx('px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full', actionTone(d.action))}>
                      {d.action}
                    </span>
                  </td>
                  <td className="text-[11px] text-soft">{d.reason}</td>
                  <td className={d.edge_pct > 0 ? 'text-green' : 'text-red'}>
                    {d.edge_pct > 0 ? '+' : ''}{d.edge_pct.toFixed(1)}%
                  </td>
                  <td className={d.fee_ev_pct > 0 ? 'text-green' : 'text-red'}>
                    {d.fee_ev_pct > 0 ? '+' : ''}{d.fee_ev_pct.toFixed(0)}%
                  </td>
                  <td className={d.inter_model_spread > 3 ? 'text-red' : 'text-soft'}>
                    ±{d.inter_model_spread.toFixed(1)}°
                  </td>
                  <td>
                    <button
                      onClick={() => onExpand(isOpen ? null : d.id)}
                      className="text-accent text-[10px] tracking-wider"
                    >
                      {isOpen ? 'HIDE' : 'WHY?'}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${d.id}-exp`}>
                    <td colSpan={9} className="bg-bg3 text-[11px]">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 p-2">
                        <Check ok={d.fee_ev_ok}>Fee EV</Check>
                        <Check ok={d.spread_ok}>Spread</Check>
                        <Check ok={d.volume_ok}>Volume</Check>
                        <Check ok={d.signal_strength_ok}>Signal Strength</Check>
                        <Check ok={d.daily_limit_ok}>Daily Limit</Check>
                        <Check ok={d.position_limit_ok}>Position Limit</Check>
                        <Check ok={d.city_limit_ok}>City Limit</Check>
                        <Check ok={d.time_to_close_ok}>Time to Close</Check>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
          {decisions.length === 0 && (
            <tr><td colSpan={9} className="text-center label py-8">No decisions logged yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={ok ? 'text-green' : 'text-red'}>
      {ok ? '✓' : '✗'} {children}
    </div>
  )
}

function TradesTable({ trades }: { trades: BotTrade[] }) {
  return (
    <div className="overflow-x-auto scrollbar-thin max-h-[600px]">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>City</th>
            <th>Range</th>
            <th>Side</th>
            <th>Cont</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Reason</th>
            <th>P&L</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td className="text-muted text-[11px]">
                {new Date(t.created_at).toLocaleDateString()}
              </td>
              <td className="font-bold">{t.city}</td>
              <td className="text-soft text-[11px]">{t.subtitle}</td>
              <td className={t.side === 'YES' ? 'text-green' : 'text-red'}>{t.side}</td>
              <td>{t.contracts}</td>
              <td>{t.entry_price_cents}¢</td>
              <td className="text-soft">{t.exit_price_cents !== null ? `${t.exit_price_cents}¢` : '—'}</td>
              <td className="text-muted text-[11px]">{t.exit_reason ?? (t.status === 'open' ? 'open' : '—')}</td>
              <td className={clsx(
                t.net_pnl !== null && t.net_pnl > 0 && 'text-green',
                t.net_pnl !== null && t.net_pnl < 0 && 'text-red',
                t.net_pnl === null && 'text-muted',
              )}>
                {t.net_pnl !== null ? `${t.net_pnl >= 0 ? '+' : ''}$${t.net_pnl.toFixed(2)}` : '—'}
              </td>
              <td>
                <span className={clsx(
                  'px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full',
                  t.settlement_result === 'WIN' && 'bg-green text-bg',
                  t.settlement_result === 'LOSS' && 'bg-red text-bg',
                  !t.settlement_result && t.status === 'open' && 'bg-accent/20 text-accent border border-accent/40',
                  !t.settlement_result && t.status === 'closed' && 'bg-muted/30 text-muted border border-muted/40',
                )}>
                  {t.settlement_result || t.status.toUpperCase()}
                </span>
              </td>
            </tr>
          ))}
          {trades.length === 0 && (
            <tr><td colSpan={10} className="text-center label py-8">No trades yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
