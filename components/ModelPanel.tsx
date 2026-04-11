'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'

interface ModelRow {
  model: string
  runTime: string
  projectedHigh: number
  projectedLow: number
  forecastHour: number
  insertedAt: string
  paceVsActual: number | null
  rank: number | null
  mae: number | null
  bias: number | null
  n: number
  weight: number
}

interface ModelData {
  series: string
  city: string
  short: string
  stationCode: string
  forecastDate: string
  currentActualHigh: number | null
  models: ModelRow[]
  consensus: {
    high: number
    low: number
    weightedBy: 'accuracy' | 'equal'
    interModelSpread: number
    topModels: string[]
  } | null
  rankings: { model: string; mae: number; bias: number; rank: number; n: number }[]
}

interface Props {
  series: string
  onClose: () => void
}

function paceColor(pace: number | null): string {
  if (pace === null) return 'text-muted'
  const abs = Math.abs(pace)
  if (abs <= 1) return 'text-green'
  if (pace > 3) return 'text-red'
  if (pace > 1) return 'text-yellow'
  if (pace < -3) return 'text-accent'
  return 'text-accent/70'
}

function rankBorder(rank: number | null): string {
  if (rank === 1) return 'border-l-4 border-yellow'
  if (rank === 2) return 'border-l-4 border-muted'
  if (rank === 3) return 'border-l-4 border-strong'
  return 'border-l-4 border-transparent'
}

export function ModelPanel({ series, onClose }: Props) {
  const [data, setData] = useState<ModelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetch(`/api/models/${series}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.error) setErr(j.error)
        else setData(j)
      })
      .catch((e) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [series])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const consensus = data?.consensus
  const spread = consensus?.interModelSpread ?? 0
  const confidence =
    spread < 1 ? 'HIGH CONFIDENCE'
    : spread <= 3 ? 'MEDIUM CONFIDENCE'
    : 'LOW CONFIDENCE'
  const confidenceColor =
    spread < 1 ? 'text-green'
    : spread <= 3 ? 'text-yellow'
    : 'text-red'

  return (
    <div className="border border-border bg-bg2 rounded">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-border">
        <div className="flex items-baseline gap-3">
          <h3 className="heading text-base text-text">{data?.city ?? series}</h3>
          {consensus && (
            <>
              <span className="label">CONSENSUS</span>
              <span className="text-2xl font-extrabold text-accent">
                {consensus.high.toFixed(1)}°F
              </span>
              <span className="label">SPREAD</span>
              <span className={clsx('font-extrabold', confidenceColor)}>
                ±{spread.toFixed(1)}°F · {confidence}
              </span>
            </>
          )}
          {data?.currentActualHigh !== null && data?.currentActualHigh !== undefined && (
            <>
              <span className="label">TODAY HIGH</span>
              <span className="font-bold text-green">{data.currentActualHigh}°F</span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-text text-xl leading-none px-2"
        >
          ×
        </button>
      </div>

      {loading && <div className="p-8 text-center label">Loading model data…</div>}
      {err && <div className="p-8 text-center text-red">{err}</div>}

      {!loading && !err && data && data.models.length === 0 && (
        <div className="p-8 text-center label">No model data available yet</div>
      )}

      {!loading && !err && data && data.models.length > 0 && (
        <>
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Model</th>
                  <th>Run</th>
                  <th>Proj High</th>
                  <th>vs Cons</th>
                  <th>7d MAE</th>
                  <th>7d Bias</th>
                  <th>Weight</th>
                  {data.currentActualHigh !== null && <th>Pacing</th>}
                </tr>
              </thead>
              <tbody>
                {[...data.models]
                  .sort((a, b) => b.projectedHigh - a.projectedHigh)
                  .map((m) => {
                  const vsConsensus = consensus
                    ? Math.round((m.projectedHigh - consensus.high) * 10) / 10
                    : 0
                  const isOutlier = Math.abs(vsConsensus) > 5
                  return (
                    <tr key={`${m.model}_${m.runTime}`} className={clsx(isOutlier && 'bg-yellow/15')}>
                      <td className={clsx(rankBorder(m.rank), 'font-bold')}>
                        {m.rank ?? '—'}
                      </td>
                      <td className="font-bold text-text">
                        <div className="flex items-center gap-2">
                          <span>{m.model}</span>
                          {isOutlier && (
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider rounded-full bg-yellow text-bg">
                              OUTLIER
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-muted">{m.runTime}</td>
                      <td className="font-bold">{m.projectedHigh.toFixed(1)}°</td>
                      <td className={clsx(
                        isOutlier ? 'text-yellow font-extrabold'
                        : vsConsensus > 0 ? 'text-yellow'
                        : vsConsensus < 0 ? 'text-accent'
                        : 'text-muted',
                      )}>
                        {vsConsensus > 0 ? '+' : ''}{vsConsensus.toFixed(1)}°
                      </td>
                      <td>{m.mae !== null ? m.mae.toFixed(2) : '—'}</td>
                      <td className={clsx(
                        m.bias === null && 'text-muted',
                        m.bias !== null && m.bias > 0.5 && 'text-accent',
                        m.bias !== null && m.bias < -0.5 && 'text-red',
                      )}>
                        {m.bias !== null ? `${m.bias > 0 ? '+' : ''}${m.bias.toFixed(2)}` : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 bg-border rounded w-16 overflow-hidden">
                            <div
                              className="h-full bg-accent"
                              style={{ width: `${Math.min(100, m.weight * 4)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold">{m.weight.toFixed(0)}%</span>
                        </div>
                      </td>
                      {data.currentActualHigh !== null && (
                        <td className={clsx('font-bold', paceColor(m.paceVsActual))}>
                          {m.paceVsActual !== null
                            ? `${m.paceVsActual > 0 ? '+' : ''}${m.paceVsActual.toFixed(1)}°`
                            : '—'}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <div className="label">
              {consensus?.weightedBy === 'accuracy'
                ? `Accuracy-weighted from top models (${data.rankings.slice(0, 3).map((r) => r.model).join(', ')})`
                : `Equal weights — collecting accuracy data (${data.rankings.length}/3 models ranked)`}
            </div>
            <div className="flex items-center gap-2">
              <span className="label">SPREAD GAUGE</span>
              <div className="flex items-center gap-1 text-[10px] font-bold">
                <span className={clsx('px-2 py-0.5 rounded-full', spread < 1 ? 'bg-green text-bg' : 'bg-green/10 text-green/40')}>LOW</span>
                <span className={clsx('px-2 py-0.5 rounded-full', spread >= 1 && spread <= 3 ? 'bg-yellow text-bg' : 'bg-yellow/10 text-yellow/40')}>MED</span>
                <span className={clsx('px-2 py-0.5 rounded-full', spread > 3 ? 'bg-red text-bg' : 'bg-red/10 text-red/40')}>HIGH</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
