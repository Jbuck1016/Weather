import { NextResponse } from 'next/server'
import { getModelRankings } from '@/lib/modelForecasts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const station = searchParams.get('station')
  const window = parseInt(searchParams.get('window') || '7')
  if (!station) return NextResponse.json({ error: 'station required' }, { status: 400 })
  if (![7, 14, 30].includes(window)) {
    return NextResponse.json({ error: 'window must be 7, 14, or 30' }, { status: 400 })
  }

  const rankings = await getModelRankings(station, window as 7 | 14 | 30)
  return NextResponse.json({ station, window, rankings })
}
