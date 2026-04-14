import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(req: Request) {
  const sb = getServerSupabase()
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '7')

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { data, error } = await sb
    .from('bot_equity')
    .select('*')
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  return NextResponse.json({ snapshots: data ?? [] }, { headers: NO_CACHE })
}
