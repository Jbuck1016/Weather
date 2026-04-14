'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EdgeTable } from '@/components/EdgeTable'
import { CityTabs } from '@/components/CityTabs'
import { PositionForm } from '@/components/PositionForm'
import { RefreshButton } from '@/components/RefreshButton'
import { ModelPanel } from '@/components/ModelPanel'
import type { EdgesResponse, EdgeResult } from '@/lib/types'

const REFRESH_MS = 5 * 60 * 1000

export default function Dashboard() {
  const [data, setData] = useState<EdgesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [bankroll, setBankroll] = useState(750)
  const [bankrollInput, setBankrollInput] = useState('750')
  const [balance, setBalance] = useState<number | null>(null)
  const [selectedCity, setSelectedCity] = useState('ALL')
  const [logEdge, setLogEdge] = useState<EdgeResult | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000)
  const [toast, setToast] = useState<string | null>(null)
  const [hideFeeNegative, setHideFeeNegative] = useState(true)

  const handleSelectCity = useCallback((s: string) => {
    setSelectedCity(s)
  }, [])

  const modelPanelSeries = selectedCity !== 'ALL' ? selectedCity : null

  const load = useCallback(async (br: number) => {
    setLoading(true)
    try {
      const [edgesRes, balRes] = await Promise.all([
        fetch(`/api/edges?bankroll=${br}`).then((r) => r.json()),
        fetch('/api/balance').then((r) => r.json()).catch(() => ({ balance: 0 })),
      ])
      setData(edgesRes)
      setBalance(balRes.balance ?? 0)
      setCountdown(REFRESH_MS / 1000)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(bankroll)
  }, [load, bankroll])

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          load(bankroll)
          return REFRESH_MS / 1000
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [load, bankroll])

  const filteredEdges = useMemo(() => {
    if (!data) return []
    if (selectedCity === 'ALL') return data.edges
    return data.edges.filter((e) => e.series === selectedCity)
  }, [data, selectedCity])

  const stats = useMemo(() => {
    if (!data) return { cities: 0, scanned: 0, found: 0, strongest: 0, avg: 0 }
    const cities = data.cityStatus.length
    const scanned = data.edges.length
    const found = data.edges.length
    const strongest = data.edges[0]?.edgePct ?? 0
    const avg = found > 0
      ? data.edges.reduce((a, e) => a + Math.abs(e.edgePct), 0) / found
      : 0
    return { cities, scanned, found, strongest, avg: Math.round(avg * 10) / 10 }
  }, [data])

  const applyBankroll = () => {
    const v = parseFloat(bankrollInput)
    if (Number.isFinite(v) && v > 0) setBankroll(v)
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-bg2 border border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="pulse-dot" />
          <span className="label">
            UPDATED {data ? new Date(data.updatedAt).toLocaleTimeString() : '—'}
          </span>
          {data && <span className="label">· TOMORROW {data.tomorrow}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {balance !== null && (
            <span className="px-4 py-2 bg-green text-bg text-sm font-extrabold rounded">
              ${balance.toFixed(2)}
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="label">BANKROLL</span>
            <input
              type="number"
              value={bankrollInput}
              onChange={(e) => setBankrollInput(e.target.value)}
              onBlur={applyBankroll}
              onKeyDown={(e) => e.key === 'Enter' && applyBankroll()}
              className="w-20 text-center"
            />
          </div>
          <RefreshButton
            onClick={() => load(bankroll)}
            loading={loading}
            countdown={countdown}
          />
        </div>
      </div>

      {data && (
        <CityTabs
          cityStatus={data.cityStatus}
          selected={selectedCity}
          onSelect={handleSelectCity}
          totalEdges={data.edges.length}
        />
      )}

      {modelPanelSeries && (
        <ModelPanel
          series={modelPanelSeries}
          onClose={() => setSelectedCity('ALL')}
        />
      )}

      <EdgeTable
        edges={filteredEdges}
        onLog={setLogEdge}
        hideFeeNegative={hideFeeNegative}
        onToggleHideFeeNegative={setHideFeeNegative}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-bg2 border border-border p-3 text-xs">
        <Stat label="Cities Scanned" value={stats.cities.toString()} />
        <Stat label="Markets Scanned" value={stats.scanned.toString()} />
        <Stat label="Edges Found" value={stats.found.toString()} />
        <Stat
          label="Strongest"
          value={`${stats.strongest > 0 ? '+' : ''}${stats.strongest.toFixed(1)}%`}
          color={stats.strongest >= 0 ? 'text-green' : 'text-red'}
        />
        <Stat label="Avg Edge" value={`${stats.avg}%`} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted px-1">
        <span>
          DATA · <a href="https://wethr.net" target="_blank" rel="noopener noreferrer" className="text-accent">Wethr.net</a>{' '}
          (NWS logic high · running observations + NWS forecasts)
        </span>
        {data && (
          <span>WETHR SYNC {new Date(data.updatedAt).toLocaleTimeString()}</span>
        )}
      </div>

      <PositionForm
        edge={logEdge}
        onClose={() => setLogEdge(null)}
        onSuccess={() => showToast('Position logged')}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 bg-green/90 text-bg px-4 py-2 font-bold tracking-wider z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`text-lg font-bold ${color || 'text-text'}`}>{value}</div>
    </div>
  )
}
