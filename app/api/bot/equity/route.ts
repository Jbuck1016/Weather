import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data ?? [] })
}
