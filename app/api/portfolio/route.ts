import { NextResponse } from 'next/server'
import { kalshiGet, kalshiGetAllPaginated } from '@/lib/kalshi'
import { citySeriesFromTicker, CITIES } from '@/lib/cities'
import { americanOdds } from '@/lib/edge'
import type { KalshiPosition, SettledBet, PortfolioResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function isWeather(ticker: string): boolean {
  return ticker.startsWith('KXHIGH') || ticker.startsWith('KXLOW')
}

function cityNameFromTicker(ticker: string): string {
  const series = citySeriesFromTicker(ticker)
  return series ? CITIES[series].name : 'Unknown'
}

export async function GET() {
  try {
    const [balanceData, positionsData, fills, settlements] = await Promise.all([
      kalshiGet<{ balance: number }>('/portfolio/balance').catch(() => ({ balance: 0 })),
      kalshiGet<{ market_positions: any[] }>(
        '/portfolio/positions?limit=200&count_filter=position',
      ).catch(() => ({ market_positions: [] })),
      kalshiGetAllPaginated<any>('/portfolio/fills', 'fills', 200).catch(() => []),
      kalshiGetAllPaginated<any>('/portfolio/settlements', 'settlements', 200).catch(() => []),
    ])

    const balance = (balanceData.balance ?? 0) / 100

    const allPositions = positionsData.market_positions ?? []
    const weatherPositions = allPositions.filter((p: any) => isWeather(p.ticker))

    const fillsByTicker = new Map<string, any[]>()
    for (const f of fills) {
      if (!isWeather(f.ticker)) continue
      const arr = fillsByTicker.get(f.ticker) ?? []
      arr.push(f)
      fillsByTicker.set(f.ticker, arr)
    }

    const openPositions: KalshiPosition[] = []
    for (const p of weatherPositions) {
      const contracts = p.position ?? 0
      if (contracts === 0) continue
      const ticker: string = p.ticker
      const tickerFills = fillsByTicker.get(ticker) ?? []
      const buyFills = tickerFills.filter((f: any) => f.action === 'buy')
      const totalBought = buyFills.reduce((a: number, f: any) => a + (f.count ?? 0), 0)
      const totalCost = buyFills.reduce(
        (a: number, f: any) => a + (f.count ?? 0) * (f.yes_price ?? 0),
        0,
      )
      const avgEntryCents = totalBought > 0 ? totalCost / totalBought : 0
      const currentPriceCents = p.market_exposure && contracts > 0
        ? Math.round((p.market_exposure / contracts) * 100) / 100
        : avgEntryCents
      const side: 'YES' | 'NO' = contracts > 0 ? 'YES' : 'NO'
      const absContracts = Math.abs(contracts)
      const unrealizedPnl = absContracts * (currentPriceCents - avgEntryCents) / 100

      openPositions.push({
        ticker,
        eventTicker: p.event_ticker ?? ticker.split('-').slice(0, 2).join('-'),
        city: cityNameFromTicker(ticker),
        side,
        contracts: absContracts,
        avgEntryCents: Math.round(avgEntryCents * 100) / 100,
        currentPriceCents,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        americanOdds: americanOdds(currentPriceCents),
      })
    }

    const settledBets: SettledBet[] = []
    let wins = 0
    let losses = 0
    let totalWagered = 0
    let totalPnl = 0

    for (const s of settlements) {
      if (!isWeather(s.ticker)) continue
      const revenue = (s.revenue ?? 0) / 100
      const cost = ((s.yes_total_cost ?? 0) + (s.no_total_cost ?? 0)) / 100
      const pnl = revenue - cost
      const isWin = pnl > 0
      if (isWin) wins++
      else losses++
      totalWagered += cost
      totalPnl += pnl

      const yesCount = s.yes_count ?? 0
      const noCount = s.no_count ?? 0
      const side: 'YES' | 'NO' = yesCount >= noCount ? 'YES' : 'NO'
      const contracts = Math.max(yesCount, noCount)

      settledBets.push({
        date: (s.settled_time || s.created_time || '').slice(0, 10),
        ticker: s.ticker,
        city: cityNameFromTicker(s.ticker),
        side,
        contracts,
        result: isWin ? 'WIN' : 'LOSS',
        pnl: Math.round(pnl * 100) / 100,
      })
    }

    settledBets.sort((a, b) => (a.date < b.date ? 1 : -1))

    const portfolioValue =
      balance +
      openPositions.reduce(
        (a, p) => a + (p.contracts * p.currentPriceCents) / 100,
        0,
      )

    const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0
    const roi = totalWagered > 0 ? (totalPnl / totalWagered) * 100 : 0

    const response: PortfolioResponse = {
      balance: Math.round(balance * 100) / 100,
      portfolioValue: Math.round(portfolioValue * 100) / 100,
      openPositions,
      settledBets,
      summary: {
        wins,
        losses,
        winRate: Math.round(winRate * 10) / 10,
        totalWagered: Math.round(totalWagered * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        roi: Math.round(roi * 10) / 10,
      },
    }

    return NextResponse.json(response)
  } catch (e: any) {
    console.error('portfolio error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
