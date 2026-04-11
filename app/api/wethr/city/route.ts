import { NextResponse } from 'next/server'
import { CITIES } from '@/lib/cities'
import { getCityWeatherData, getNwsForecast, getWethrHigh } from '@/lib/wethr'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const series = searchParams.get('series')
  if (!series || !CITIES[series]) {
    return NextResponse.json({ error: 'invalid series' }, { status: 400 })
  }
  const cfg = CITIES[series]
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const todayStr = today.toISOString().slice(0, 10)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  const [summary, todayObs, todayFcst] = await Promise.all([
    getCityWeatherData(cfg.wethrStation, todayStr, tomorrowStr),
    getWethrHigh(cfg.wethrStation),
    getNwsForecast(cfg.wethrStation, todayStr),
  ])

  return NextResponse.json({
    series,
    city: cfg.name,
    short: cfg.short,
    station: cfg.wethrStation,
    today: todayStr,
    tomorrow: tomorrowStr,
    summary,
    todayObservation: todayObs,
    todayForecast: todayFcst,
  })
}
