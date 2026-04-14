import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET() {
  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('trade_analysis')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  const rows = data ?? []
  const wins = rows.filter((t) => t.settlement_result === 'WIN').length
  const losses = rows.filter((t) => t.settlement_result === 'LOSS').length
  const netPnl = rows.reduce((s, t) => s + (t.net_pnl ?? 0), 0)
  const avgEdge = rows.length
    ? rows.reduce((s, t) => s + Math.abs(t.edge_at_entry ?? 0), 0) / rows.length
    : 0
  const avgForecastError = rows.length
    ? rows.reduce((s, t) => s + (t.forecast_error_f ?? 0), 0) / rows.length
    : 0

  const byCity: Record<
    string,
    { wins: number; losses: number; netPnl: number; avgEdge: number; count: number }
  > = {}
  rows.forEach((t) => {
    const key = t.city as string
    if (!byCity[key]) byCity[key] = { wins: 0, losses: 0, netPnl: 0, avgEdge: 0, count: 0 }
    if (t.settlement_result === 'WIN') byCity[key].wins++
    if (t.settlement_result === 'LOSS') byCity[key].losses++
    byCity[key].netPnl += t.net_pnl ?? 0
    byCity[key].avgEdge += Math.abs(t.edge_at_entry ?? 0)
    byCity[key].count++
  })
  for (const c of Object.values(byCity)) {
    if (c.count > 0) c.avgEdge = Math.round((c.avgEdge / c.count) * 10) / 10
  }

  const bySession: Record<string, { wins: number; losses: number }> = {}
  rows.forEach((t) => {
    const s = (t.entry_session as string) ?? 'unknown'
    if (!bySession[s]) bySession[s] = { wins: 0, losses: 0 }
    if (t.settlement_result === 'WIN') bySession[s].wins++
    if (t.settlement_result === 'LOSS') bySession[s].losses++
  })

  return NextResponse.json(
    {
      trades: rows,
      summary: { wins, losses, netPnl, avgEdge, avgForecastError },
      byCity,
      bySession,
    },
    { headers: NO_CACHE },
  )
}
