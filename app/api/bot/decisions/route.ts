import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(req: Request) {
  const sb = getServerSupabase()
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const cycleId = searchParams.get('cycle_id')
  const limit = parseInt(searchParams.get('limit') || '200')

  let q = sb
    .from('bot_decisions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (action) q = q.eq('action', action)
  if (cycleId) q = q.eq('cycle_id', cycleId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  return NextResponse.json({ decisions: data ?? [] }, { headers: NO_CACHE })
}
