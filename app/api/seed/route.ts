import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getServerSupabase } from '@/lib/supabase'
import { citySeriesFromTicker, CITIES } from '@/lib/cities'
import { parseTickerDate } from '@/lib/edge'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RawTrade {
  ticker: string
  city?: string
  direction?: string
  contracts?: number
  cost_per?: number
  limit_price?: number
  edge_pct?: number
  nws_temp?: number
  nws_prob?: number
  kalshi_prob?: number
  actual_cost?: number
  date?: string
  time?: string
  status?: string
  type?: string
  subtitle?: string
}

function mapTrade(t: RawTrade) {
  if (t.type === 'profit_take') return null
  const series = citySeriesFromTicker(t.ticker)
  const cityCfg = series ? CITIES[series] : null
  const city = t.city || cityCfg?.name || 'Unknown'
  const date = parseTickerDate(t.ticker)
  const dateStr = date ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  const side: 'YES' | 'NO' = (t.direction || '').toUpperCase().includes('NO') ? 'NO' : 'YES'
  const status = t.status === 'settled' ? 'settled' : 'open'
  let createdAt: string | undefined
  if (t.date) {
    const ts = `${t.date}T${t.time || '00:00:00'}`
    const d = new Date(ts)
    if (!isNaN(d.getTime())) createdAt = d.toISOString()
  }
  return {
    market_ticker: t.ticker,
    city,
    market_type: 'high',
    date: dateStr,
    subtitle: t.subtitle ?? null,
    side,
    contracts: t.contracts ?? 0,
    entry_price_cents: t.cost_per ?? 0,
    limit_price_cents: t.limit_price ?? null,
    edge_pct_at_entry: t.edge_pct ?? null,
    nws_temp_at_entry: t.nws_temp ?? null,
    nws_prob_at_entry: typeof t.nws_prob === 'number' ? t.nws_prob / 100 : null,
    kalshi_prob_at_entry: typeof t.kalshi_prob === 'number' ? t.kalshi_prob / 100 : null,
    actual_cost: t.actual_cost ?? null,
    status,
    source: 'auto',
    ...(createdAt ? { created_at: createdAt } : {}),
  }
}

export async function GET() {
  const filePath = path.join(process.cwd(), 'trades.json')
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({
      ok: false,
      message: 'trades.json not found at project root. Drop your trades.json there and re-hit /api/seed.',
    })
  }
  let raw: RawTrade[]
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(text)
    raw = Array.isArray(parsed) ? parsed : parsed.trades ?? []
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 })
  }

  const rows = raw.map(mapTrade).filter((r): r is NonNullable<ReturnType<typeof mapTrade>> => r !== null)
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, message: 'no insertable rows' })
  }

  const sb = getServerSupabase()
  const { data, error } = await sb.from('positions').insert(rows).select('id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: data?.length ?? 0 })
}
