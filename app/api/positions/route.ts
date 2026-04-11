import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('positions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ positions: data ?? [] })
}

export async function POST(req: Request) {
  const sb = getServerSupabase()
  const body = await req.json()
  const row = {
    market_ticker: body.market_ticker,
    city: body.city,
    market_type: body.market_type ?? 'high',
    date: body.date,
    subtitle: body.subtitle ?? null,
    side: body.side,
    contracts: body.contracts,
    entry_price_cents: body.entry_price_cents,
    limit_price_cents: body.limit_price_cents ?? null,
    edge_pct_at_entry: body.edge_pct_at_entry ?? null,
    nws_temp_at_entry: body.nws_temp_at_entry ?? null,
    nws_prob_at_entry: body.nws_prob_at_entry ?? null,
    kalshi_prob_at_entry: body.kalshi_prob_at_entry ?? null,
    kelly_pct: body.kelly_pct ?? null,
    actual_cost: body.actual_cost ?? null,
    status: body.status ?? 'open',
    source: body.source ?? 'manual',
  }
  const { data, error } = await sb.from('positions').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ position: data })
}
