'use client'

import { useState, useMemo } from 'react'
import clsx from 'clsx'
import type { EdgeResult } from '@/lib/types'
import { EdgeBadge } from './EdgeBadge'
import { americanOdds } from '@/lib/edge'

type SortKey = 'rank' | 'city' | 'edge' | 'feeEv' | 'kalshi' | 'nws' | 'volume'

interface Props {
  edges: EdgeResult[]
  onLog: (edge: EdgeResult) => void
  hideFeeNegative: boolean
  onToggleHideFeeNegative: (next: boolean) => void
}

function priceCell(cents: number, color: 'green' | 'red') {
  if (cents <= 0 || cents >= 100) return <span className="text-muted">—</span>
  return (
    <span className={color === 'green' ? 'text-green font-bold' : 'text-red font-bold'}>
      {americanOdds(cents)}
    </span>
  )
}

function formatFeeEv(evPct: number, entryCents: number): { label: string; tone: 'green' | 'red' | 'yellow' | 'muted' } {
  if (!Number.isFinite(evPct)) return { label: 'EV: —', tone: 'muted' }

  // Low-priced contracts produce huge percentage swings — fall back to dollar terms
  if (entryCents > 0 && entryCents < 10) {
    const dollarsPer100 = (evPct * entryCents) / 100
    if (Math.abs(dollarsPer100) > 200) {
      return { label: dollarsPer100 > 0 ? 'EV: HIGH' : 'EV: NEG', tone: dollarsPer100 > 0 ? 'green' : 'red' }
    }
    const sign = dollarsPer100 >= 0 ? '+' : ''
    const tone =
      dollarsPer100 > 1 ? 'green' : dollarsPer100 < -1 ? 'red' : 'yellow'
    return { label: `EV: ${sign}$${dollarsPer100.toFixed(2)}/$100`, tone }
  }

  if (evPct > 200) return { label: 'EV: HIGH', tone: 'green' }
  if (evPct < -200) return { label: 'EV: NEG', tone: 'red' }
  const capped = Math.max(-999, Math.min(999, evPct))
  const sign = capped >= 0 ? '+' : ''
  const tone = capped > 1 ? 'green' : capped < -1 ? 'red' : 'yellow'
  return { label: `EV: ${sign}${capped.toFixed(0)}%`, tone }
}

export function EdgeTable({ edges, onLog, hideFeeNegative, onToggleHideFeeNegative }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('feeEv')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const filtered = hideFeeNegative
      ? edges.filter((e) => e.feeAdjustedEvPct > 0)
      : edges
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      switch (sortKey) {
        case 'rank': av = a.rank; bv = b.rank; break
        case 'city': av = a.city; bv = b.city; break
        case 'edge': av = Math.abs(a.edgePct); bv = Math.abs(b.edgePct); break
        case 'feeEv': av = a.feeAdjustedEvPct; bv = b.feeAdjustedEvPct; break
        case 'kalshi': av = a.kalshiProb; bv = b.kalshiProb; break
        case 'nws': av = a.nwsTemp; bv = b.nwsTemp; break
        case 'volume': av = a.volume; bv = b.volume; break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [edges, sortKey, sortDir, hideFeeNegative])

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  const filteredCount = sorted.length
  const hiddenCount = hideFeeNegative ? edges.length - filteredCount : 0

  return (
    <>
      <div className="flex items-center justify-between text-xs px-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hideFeeNegative}
            onChange={(e) => onToggleHideFeeNegative(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className="label">HIDE FEE-NEGATIVE EDGES</span>
          {hiddenCount > 0 && (
            <span className="text-muted">· {hiddenCount} hidden</span>
          )}
        </label>
        <div className="label">{filteredCount} ROWS</div>
      </div>

      {filteredCount === 0 ? (
        <div className="p-12 text-center label border border-border bg-bg2 rounded">
          {edges.length === 0
            ? 'No edges detected. Markets are efficient or weather data unavailable.'
            : 'All edges are fee-negative — uncheck the filter to see them anyway.'}
        </div>
      ) : (
    <div className="border border-border bg-bg2 overflow-x-auto scrollbar-thin rounded">
      <table>
        <thead>
          <tr>
            <th onClick={() => toggle('rank')}>#</th>
            <th>Day</th>
            <th onClick={() => toggle('city')}>City</th>
            <th>Ticker</th>
            <th>Range</th>
            <th>Bid</th>
            <th onClick={() => toggle('kalshi')}>Kalshi %</th>
            <th onClick={() => toggle('nws')}>Forecast °F</th>
            <th>Consensus</th>
            <th>Model %</th>
            <th onClick={() => toggle('feeEv')}>Edge / Fee EV</th>
            <th>Signal</th>
            <th>Action</th>
            <th onClick={() => toggle('volume')}>Vol</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const positive = e.edgePct > 0
            const rowClass =
              e.edgeLabel === 'STRONG' ? 'row-strong'
              : e.edgeLabel === 'MODERATE' ? 'row-moderate'
              : 'row-weak'
            return (
              <tr key={e.ticker} className={rowClass}>
                <td className="text-muted font-bold">{e.rank}</td>
                <td>
                  <span
                    className={clsx(
                      'inline-block px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-full',
                      e.dayLabel === 'TODAY' && 'bg-strong text-bg',
                      e.dayLabel === 'TOMORROW' && 'bg-accent text-bg',
                      e.dayLabel === 'FUTURE' && 'bg-muted/30 text-muted border border-muted/30',
                      e.dayLabel === 'PAST' && 'bg-red/20 text-red border border-red/40',
                    )}
                    title={e.dateIso}
                  >
                    {e.dayLabel === 'FUTURE' ? `+${e.daysOut}D` : e.dayLabel}
                  </span>
                </td>
                <td>
                  <span className="font-bold text-text">{e.city}</span>
                </td>
                <td>
                  <a
                    href={`https://kalshi.com/markets/${e.kalshiSlug}/${e.eventTicker}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-accent"
                  >
                    {e.ticker}
                  </a>
                </td>
                <td className="text-soft">{e.subtitle}</td>
                <td className="whitespace-nowrap">
                  {priceCell(e.yesBid, 'green')}
                </td>
                <td className="font-bold">{(e.kalshiProb * 100).toFixed(1)}%</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text">{e.forecastTemp.toFixed(0)}°</span>
                    <span
                      className={clsx(
                        'px-1.5 py-0.5 text-[9px] font-bold tracking-wider rounded-sm',
                        e.forecastSource === 'wethr_actual' && 'bg-green text-bg',
                        e.forecastSource === 'model_consensus' && 'bg-accent text-bg',
                        e.forecastSource === 'wethr_nws_forecast' && 'bg-accent/20 text-accent border border-accent/40',
                        e.forecastSource === 'nws_fallback' && 'bg-yellow/20 text-yellow border border-yellow/40',
                      )}
                      title={
                        e.forecastSource === 'wethr_actual'
                          ? 'Wethr running high (NWS logic — OMO + CLI + DSM + 6hr)'
                          : e.forecastSource === 'model_consensus'
                            ? `Accuracy-weighted consensus of ${e.modelCount} models (${e.weightedBy === 'accuracy' ? 'accuracy-weighted' : 'equal weights — collecting data'})`
                            : e.forecastSource === 'wethr_nws_forecast'
                              ? `NWS forecast via Wethr${e.forecastVersion !== null ? ` (v${e.forecastVersion})` : ''}${e.forecastUpdatedAt ? ` · ${new Date(e.forecastUpdatedAt).toLocaleTimeString()}` : ''}`
                              : 'Direct NWS fallback (Wethr unavailable)'
                      }
                    >
                      {e.forecastSource === 'wethr_actual' ? 'ACTUAL'
                        : e.forecastSource === 'model_consensus' ? 'CONS'
                        : e.forecastSource === 'nws_fallback' ? 'FBK'
                        : 'FCST'}
                    </span>
                  </div>
                </td>
                <td>
                  {e.modelConsensus !== null ? (
                    <div className="flex flex-col leading-tight">
                      <span className="font-bold text-text">
                        {e.interModelSpread > 3 && (
                          <span className="text-red mr-1" title="Models disagree — low confidence">⚠️</span>
                        )}
                        {e.modelConsensus.toFixed(0)}°F
                      </span>
                      <span
                        className={clsx(
                          'text-[11px] font-bold',
                          e.interModelSpread < 1.5 && 'text-green',
                          e.interModelSpread >= 1.5 && e.interModelSpread <= 3 && 'text-yellow',
                          e.interModelSpread > 3 && 'text-red',
                        )}
                        title={`Weighted average of ${e.modelCount} models. Top: ${e.topModels.slice(0, 3).join(', ') || 'collecting data'}`}
                      >
                        ±{e.interModelSpread.toFixed(1)}°
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  <span className="font-bold">{(e.nwsProb * 100).toFixed(1)}%</span>
                  <span
                    className="label ml-1"
                    title={
                      e.forecastSource === 'model_consensus'
                        ? `Probability based on accuracy-weighted model consensus (${e.modelCount} models, ${e.weightedBy === 'accuracy' ? 'accuracy-weighted' : 'equal weights'}, σ = max(2, spread))`
                        : 'Probability based on NWS forecast'
                    }
                  >σ{e.stdDevUsed.toFixed(1)}</span>
                </td>
                <td>
                  <div
                    className={clsx(
                      'font-extrabold leading-none',
                      positive ? 'text-green' : 'text-red',
                    )}
                    style={{ fontSize: '18px' }}
                  >
                    {positive ? '+' : ''}{e.edgePct.toFixed(1)}%
                  </div>
                  {(() => {
                    const ev = formatFeeEv(e.feeAdjustedEvPct, e.entryCents)
                    return (
                      <div
                        className={clsx(
                          'text-[11px] font-bold mt-1',
                          ev.tone === 'green' && 'text-green',
                          ev.tone === 'red' && 'text-red',
                          ev.tone === 'yellow' && 'text-yellow',
                          ev.tone === 'muted' && 'text-muted',
                        )}
                        title={`Need NWS prob > ${(e.breakEvenProb * 100).toFixed(1)}% to be +EV after fees · Fee drag: ${
                          Math.abs(e.feeDragPct) > 200 ? 'HIGH FEES' : e.feeDragPct.toFixed(1) + '%'
                        }`}
                      >
                        {ev.label}
                      </div>
                    )
                  })()}
                </td>
                <td><EdgeBadge label={e.edgeLabel} /></td>
                <td>
                  <button
                    onClick={() => onLog(e)}
                    className={clsx(
                      'px-3 py-1.5 text-[11px] font-extrabold tracking-wider rounded',
                      e.feeAdjustedEvPct > 0
                        ? positive
                          ? 'bg-green text-bg hover:brightness-110'
                          : 'bg-red text-bg hover:brightness-110'
                        : 'bg-muted/30 text-muted border border-muted/40',
                    )}
                    title={
                      e.feeAdjustedEvPct > 0
                        ? `Break-even at ${(e.breakEvenProb * 100).toFixed(1)}% prob`
                        : `Negative EV after fees — break-even at ${(e.breakEvenProb * 100).toFixed(1)}%`
                    }
                  >
                    {e.direction}
                  </button>
                  <div className="label mt-1">{e.kellyPct}% KELLY</div>
                </td>
                <td className="text-muted">{e.volume.toLocaleString()}</td>
                <td>
                  <button
                    onClick={() => onLog(e)}
                    className="px-2.5 py-1 border border-accent/50 text-accent text-[10px] font-bold tracking-wider hover:bg-accent/15 rounded"
                  >
                    LOG
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
      )}
    </>
  )
}
