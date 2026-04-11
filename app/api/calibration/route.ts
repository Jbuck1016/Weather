import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const sb = getServerSupabase()
  const { searchParams } = new URL(req.url)
  const city = searchParams.get('city')
  const marketType = searchParams.get('market_type')

  let q = sb
    .from('calibration_buckets')
    .select('*')
    .order('prob_min', { ascending: true })

  if (city) q = q.eq('city', city)
  else q = q.is('city', null)

  if (marketType) q = q.eq('market_type', marketType)
  else q = q.is('market_type', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const totalSettled = (data ?? []).reduce((a, b) => a + (b.settled_signals ?? 0), 0)
  return NextResponse.json({ buckets: data ?? [], totalSettled })
}
