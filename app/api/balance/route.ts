import { NextResponse } from 'next/server'
import { kalshiGet } from '@/lib/kalshi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const data = await kalshiGet<{ balance: number }>('/portfolio/balance')
    return NextResponse.json({ balance: (data.balance ?? 0) / 100 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, balance: 0 }, { status: 500 })
  }
}
