import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const sb = getServerSupabase()
  const { searchParams } = new URL(req.url)

  const status = searchParams.get('status')
  const city = searchParams.get('city')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const edgeLabel = searchParams.get('edge_label')
  const marketType = searchParams.get('market_type')
  const limit = parseInt(searchParams.get('limit') || '500')

  let q = sb.from('edge_signals').select('*').order('captured_at', { ascending: false }).limit(limit)

  if (status === 'pending') q = q.eq('settled', false)
  if (status === 'won') q = q.eq('settlement_result', 'WIN')
  if (status === 'lost') q = q.eq('settlement_result', 'LOSS')
  if (city) q = q.eq('city', city)
  if (dateFrom) q = q.gte('market_date', dateFrom)
  if (dateTo) q = q.lte('market_date', dateTo)
  if (edgeLabel) q = q.eq('edge_label', edgeLabel)
  if (marketType) q = q.eq('market_type', marketType)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signals: data ?? [] })
}
