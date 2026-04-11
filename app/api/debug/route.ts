import { NextResponse } from 'next/server'
import { kalshiGetRaw } from '@/lib/kalshi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const endpoint =
    searchParams.get('endpoint') ||
    '/markets?series_ticker=KXHIGHNY&status=open&limit=5'

  const env = {
    KALSHI_API_KEY_ID: process.env.KALSHI_API_KEY_ID
      ? `${process.env.KALSHI_API_KEY_ID.slice(0, 8)}…${process.env.KALSHI_API_KEY_ID.slice(-4)}`
      : null,
    KALSHI_PRIVATE_KEY_PEM_PRESENT: !!process.env.KALSHI_PRIVATE_KEY_PEM,
    KALSHI_PRIVATE_KEY_PEM_LENGTH: process.env.KALSHI_PRIVATE_KEY_PEM?.length ?? 0,
    KALSHI_PRIVATE_KEY_PEM_HAS_LITERAL_BACKSLASH_N:
      process.env.KALSHI_PRIVATE_KEY_PEM?.includes('\\n') ?? false,
    KALSHI_PRIVATE_KEY_PEM_HAS_REAL_NEWLINE:
      process.env.KALSHI_PRIVATE_KEY_PEM?.includes('\n') ?? false,
  }

  try {
    const result = await kalshiGetRaw(endpoint)
    return NextResponse.json({
      env,
      endpoint,
      ...result,
      bodyPreview:
        typeof result.body === 'object' && result.body !== null
          ? {
              keys: Object.keys(result.body),
              marketCount: Array.isArray(result.body.markets) ? result.body.markets.length : null,
              sampleMarket: Array.isArray(result.body.markets) ? result.body.markets[0] : null,
            }
          : null,
    }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({
      env,
      endpoint,
      error: e.message,
      stack: e.stack,
    }, { status: 500 })
  }
}
