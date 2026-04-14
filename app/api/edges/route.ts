import { NextResponse } from 'next/server'
import { CITIES } from '@/lib/cities'
import { kalshiGet } from '@/lib/kalshi'
import { getNwsForecastTemp } from '@/lib/nws'
import { getCityWeatherData, type WethrCityData } from '@/lib/wethr'
import { getCityModelData, type CityModelData } from '@/lib/modelForecasts'
import {
  parseTickerDate,
  calcNwsProb,
  calcKelly,
  calcFeeAdjustedEV,
  edgeLabel,
  STD_DEV_TODAY,
  STD_DEV_TOMORROW,
  type MarketInfo,
} from '@/lib/edge'
import { logEdgeSignal } from '@/lib/signalLogger'
import type { EdgeResult, CityStatus, KalshiMarket, EdgesResponse } from '@/lib/types'

function dollarsToCents(s: string | undefined): number {
  if (s === undefined || s === null || s === '') return 0
  const v = parseFloat(s)
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 100)
}

function buildMarketInfo(m: KalshiMarket): MarketInfo | null {
  const t = m.strike_type
  if (t === 'between') {
    if (m.floor_strike === undefined || m.cap_strike === undefined) return null
    return { type: 'bracket', low: m.floor_strike, high: m.cap_strike, day: 0, year: 0 }
  }
  if (t === 'greater') {
    const v = m.floor_strike ?? m.cap_strike
    if (v === undefined) return null
    return { type: 'threshold', value: v, direction: 'greater', day: 0, year: 0 }
  }
  if (t === 'less') {
    const v = m.cap_strike ?? m.floor_strike
    if (v === undefined) return null
    return { type: 'threshold', value: v, direction: 'less', day: 0, year: 0 }
  }
  return null
}

function rangeLabel(info: MarketInfo): string {
  if (info.type === 'bracket') {
    return info.low === info.high
      ? `${info.low}°F`
      : `${info.low}° to ${info.high}°F`
  }
  return info.direction === 'less' ? `≤ ${info.value}°F` : `≥ ${info.value}°F`
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function getTodayPacific(): Date {
  const now = new Date()
  const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  return new Date(pacific.getFullYear(), pacific.getMonth(), pacific.getDate())
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const bankroll = parseFloat(searchParams.get('bankroll') || '750')

  const seriesList = Object.keys(CITIES)
  const today = getTodayPacific()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const todayStr = today.toISOString().slice(0, 10)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  const cityDataPromise = Promise.all(
    seriesList.map(async (s) => {
      const cfg = CITIES[s]
      const data = await getCityWeatherData(cfg.wethrStation, todayStr, tomorrowStr)
      let usedFallback = false
      if (data.todayHigh === null && data.tomorrowForecastHigh === null) {
        const fallback = await getNwsForecastTemp(s)
        if (fallback !== null) {
          data.tomorrowForecastHigh = fallback
          usedFallback = true
        }
      }
      return { series: s, data, usedFallback }
    }),
  )

  const modelDataPromise = Promise.all(
    seriesList.map(async (s) => {
      const data = await getCityModelData(s, tomorrowStr)
      return { series: s, data }
    }),
  )

  const marketsPromise = Promise.all(
    seriesList.map(async (s) => {
      const endpoint = `/markets?series_ticker=${s}&status=open&limit=200`
      try {
        const data = await kalshiGet<{ markets: KalshiMarket[] }>(endpoint)
        const count = data.markets?.length ?? 0
        console.log(`[edges] ${s}: ${count} markets`)
        return data
      } catch (e: any) {
        console.error(`[edges] ${s} FAILED: ${e.message}`)
        return { markets: [] as KalshiMarket[] }
      }
    }),
  )

  const [cityDataResults, modelDataResults, marketResults] = await Promise.all([
    cityDataPromise,
    modelDataPromise,
    marketsPromise,
  ])

  const cityDataMap = new Map<string, WethrCityData>()
  const fallbackSeries = new Set<string>()
  for (const { series, data, usedFallback } of cityDataResults) {
    cityDataMap.set(series, data)
    if (usedFallback) fallbackSeries.add(series)
  }

  const modelDataMap = new Map<string, CityModelData | null>()
  for (const { series, data } of modelDataResults) {
    modelDataMap.set(series, data)
  }

  const cityStatus: CityStatus[] = []
  const edges: EdgeResult[] = []

  seriesList.forEach((series, i) => {
    const cityCfg = CITIES[series]
    const markets = marketResults[i].markets ?? []
    const cityData = cityDataMap.get(series)!
    const modelData = modelDataMap.get(series) ?? null
    const isFallback = fallbackSeries.has(series)
    const tempForCity =
      cityData.todayHigh ?? modelData?.consensusHigh ?? cityData.tomorrowForecastHigh ?? null

    let edgeCount = 0
    let strongest = 0

    for (const m of markets) {
      const info = buildMarketInfo(m)
      if (!info) continue

      const mktDate = parseTickerDate(m.ticker)
      if (!mktDate) continue

      const rawYesBid = dollarsToCents(m.yes_bid_dollars)
      const rawYesAsk = dollarsToCents(m.yes_ask_dollars)
      const rawNoBid = dollarsToCents(m.no_bid_dollars)
      const rawNoAsk = dollarsToCents(m.no_ask_dollars)

      if (
        rawYesBid === 0 && rawYesAsk === 0 &&
        rawNoBid === 0 && rawNoAsk === 0
      ) continue

      const clampPrice = (c: number) => (Number.isFinite(c) && c > 0 && c < 100 ? c : 0)
      const yesBid = clampPrice(rawYesBid > 0 ? rawYesBid : (rawNoAsk > 0 ? 100 - rawNoAsk : 0))
      const yesAsk = clampPrice(rawYesAsk > 0 ? rawYesAsk : (rawNoBid > 0 ? 100 - rawNoBid : 0))
      const noBid = clampPrice(rawNoBid > 0 ? rawNoBid : (rawYesAsk > 0 ? 100 - rawYesAsk : 0))
      const noAsk = clampPrice(rawNoAsk > 0 ? rawNoAsk : (rawYesBid > 0 ? 100 - rawYesBid : 0))

      const isHighMarket = series.startsWith('KXHIGH')
      const marketDateStr = mktDate.toISOString().slice(0, 10)
      const isToday = marketDateStr === todayStr
      const isTomorrow = marketDateStr === tomorrowStr

      let forecastTemp: number | null = null
      let forecastSource: EdgeResult['forecastSource'] = 'wethr_nws_forecast'
      let stdDevUsed = STD_DEV_TOMORROW

      if (isToday) {
        forecastTemp = isHighMarket ? cityData.todayHigh : cityData.todayLow
        forecastSource = 'wethr_actual'
        stdDevUsed = STD_DEV_TODAY
      } else if (isTomorrow || !isToday) {
        const haveModels = modelData && modelData.models.length > 0
        if (haveModels && isHighMarket) {
          forecastTemp = modelData!.consensusHigh
          forecastSource = 'model_consensus'
          stdDevUsed = Math.max(2.0, modelData!.interModelSpread)
        } else if (haveModels && !isHighMarket) {
          forecastTemp = modelData!.consensusLow
          forecastSource = 'model_consensus'
          stdDevUsed = Math.max(2.0, modelData!.interModelSpread)
        } else {
          forecastTemp = isHighMarket ? cityData.tomorrowForecastHigh : cityData.tomorrowForecastLow
          forecastSource = isFallback ? 'nws_fallback' : 'wethr_nws_forecast'
          stdDevUsed = STD_DEV_TOMORROW
        }
      }

      if (forecastTemp === null) continue

      // Skip degenerate today-markets where Kalshi hasn't priced yet
      // (1-2 cent asks with actual observed temps produce huge fake edges)
      if (forecastSource === 'wethr_actual' && rawYesAsk <= 2 && rawNoAsk <= 2) continue

      const kalshiProb = ((yesBid + yesAsk) / 2) / 100
      const subtitle = m.subtitle || rangeLabel(info)
      const nwsProb = calcNwsProb(forecastTemp, info, m.title || '', stdDevUsed)
      const edgePct = (nwsProb - kalshiProb) * 100
      const label = edgeLabel(edgePct)
      if (!label) continue

      const kelly = calcKelly(nwsProb, kalshiProb, bankroll, edgePct)
      const direction = edgePct > 0 ? 'BUY YES' : 'BUY NO'
      const entryCents = edgePct > 0 ? yesAsk : noAsk

      // Fee EV uses the price you actually PAY (the ask), not the midpoint
      const askProbYes = direction === 'BUY YES' ? yesAsk / 100 : 1 - noAsk / 100
      const feeResult = calcFeeAdjustedEV(nwsProb, askProbYes, direction)

      edges.push({
        rank: 0,
        series,
        city: cityCfg.name,
        cityShort: cityCfg.short,
        ticker: m.ticker,
        eventTicker: m.event_ticker,
        title: m.title || '',
        subtitle,
        kalshiSlug: cityCfg.kalshiSlug,
        yesBid,
        yesAsk,
        noBid,
        noAsk,
        volume: m.volume ?? 0,
        kalshiProb,
        nwsTemp: forecastTemp,
        nwsProb,
        edgePct: Math.round(edgePct * 10) / 10,
        edgeLabel: label,
        direction,
        kellyPct: kelly.kellyPct,
        betDollars: kelly.betDollars,
        contracts: kelly.contracts,
        actualCost: kelly.actualCost,
        maxProfit: kelly.maxProfit,
        entryCents,
        marketType: info.type,
        marketLow: info.low,
        marketHigh: info.high,
        marketValue: info.value,
        dateIso: mktDate.toISOString().slice(0, 10),
        dayLabel:
          mktDate.getTime() === today.getTime()
            ? 'TODAY'
            : mktDate.getTime() === tomorrow.getTime()
              ? 'TOMORROW'
              : mktDate.getTime() < today.getTime()
                ? 'PAST'
                : 'FUTURE',
        daysOut: Math.round(
          (mktDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
        ),
        forecastSource,
        forecastTemp,
        wethrHigh: cityData.todayHigh,
        wethrLow: cityData.todayLow,
        forecastHigh: cityData.tomorrowForecastHigh,
        forecastLow: cityData.tomorrowForecastLow,
        forecastVersion: cityData.tomorrowForecastVersion,
        forecastUpdatedAt: cityData.tomorrowForecastUpdatedAt,
        stdDevUsed,
        feeAdjustedEvPct: Math.round(feeResult.feeAdjustedEvPct * 10) / 10,
        breakEvenProb: Math.round(feeResult.breakEvenProb * 10000) / 10000,
        feeDragPct: Math.round(feeResult.feeDragPct * 10) / 10,
        grossEdgePct: Math.round(feeResult.grossEdgePct * 10) / 10,
        isHighMarket,
        strikeType: (m.strike_type as 'between' | 'greater' | 'less') ?? 'greater',
        floorStrike: m.floor_strike ?? null,
        capStrike: m.cap_strike ?? null,
        modelConsensus: modelData?.consensusHigh ?? null,
        interModelSpread: modelData?.interModelSpread ?? 0,
        topModels: modelData?.topModels ?? [],
        modelCount: modelData?.models.length ?? 0,
        weightedBy: modelData?.weightedBy ?? null,
        closeTime: m.close_time ?? null,
        hoursToClose: m.close_time
          ? Math.max(0, (new Date(m.close_time).getTime() - Date.now()) / 3600000)
          : 24,
      })

      // fire-and-forget signal logging — never let a Supabase write crash this route
      void logEdgeSignal({
        market_ticker: m.ticker,
        series,
        city: cityCfg.name,
        market_date: marketDateStr,
        market_type: isHighMarket ? 'high' : 'low',
        subtitle,
        strike_type: (m.strike_type as 'between' | 'greater' | 'less') ?? 'greater',
        floor_strike: m.floor_strike ?? null,
        cap_strike: m.cap_strike ?? null,
        yes_bid_cents: yesBid,
        yes_ask_cents: yesAsk,
        kalshi_prob: kalshiProb,
        volume: m.volume ?? 0,
        forecast_source: forecastSource,
        forecast_temp: forecastTemp,
        nws_prob: nwsProb,
        std_dev_used: stdDevUsed,
        edge_pct: edgePct,
        edge_label: label,
        direction,
        fee_adjusted_ev_pct: feeResult.feeAdjustedEvPct,
        kelly_pct: kelly.kellyPct,
        kelly_dollars: kelly.betDollars,
        predicted_prob: nwsProb,
      })

      edgeCount++
      if (Math.abs(edgePct) > Math.abs(strongest)) strongest = edgePct
    }

    cityStatus.push({
      series,
      name: cityCfg.name,
      short: cityCfg.short,
      count: edgeCount,
      nwsTemp: tempForCity,
      strongest,
    })
  })

  const activeEdges = edges.filter((e) => e.dayLabel !== 'PAST')
  activeEdges.sort((a, b) => Math.abs(b.edgePct) - Math.abs(a.edgePct))
  activeEdges.forEach((e, i) => (e.rank = i + 1))

  for (const cs of cityStatus) {
    cs.count = activeEdges.filter((e) => e.series === cs.series).length
  }

  const nwsTempsByShort: Record<string, number> = {}
  for (const [series, data] of cityDataMap.entries()) {
    const t = data.todayHigh ?? data.tomorrowForecastHigh
    if (t !== null) nwsTempsByShort[CITIES[series].short] = t
  }

  const response: EdgesResponse = {
    edges: activeEdges,
    nwsTemps: nwsTempsByShort,
    cityStatus,
    bankroll,
    updatedAt: new Date().toISOString(),
    tomorrow: tomorrow.toISOString().slice(0, 10),
  }

  return NextResponse.json(response)
}
