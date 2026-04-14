import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(
  _req: Request,
  { params }: { params: { tradeId: string } },
) {
  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('position_snapshots')
    .select('*')
    .eq('bot_trade_id', params.tradeId)
    .order('captured_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }
  return NextResponse.json({ snapshots: data ?? [] }, { headers: NO_CACHE })
}
