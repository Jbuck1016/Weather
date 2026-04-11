import { NextResponse } from 'next/server'
import { CITIES } from '@/lib/cities'
import { getCityModelData, getModelRankings, getModelFetchDiagnostics } from '@/lib/modelForecasts'
import { getWethrHigh } from '@/lib/wethr'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: { series: string } },
) {
  const cfg = CITIES[params.series]
  if (!cfg) return NextResponse.json({ error: 'unknown series' }, { status: 404 })

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  const [modelData, rankings, todayObs] = await Promise.all([
    getCityModelData(params.series, tomorrowStr),
    getModelRankings(cfg.wethrStation, 7),
    getWethrHigh(cfg.wethrStation),
  ])

  if (!modelData) {
    return NextResponse.json({
      series: params.series,
      stationCode: cfg.wethrStation,
      forecastDate: tomorrowStr,
      currentActualHigh: todayObs?.wethr_high ?? null,
      models: [],
      consensus: null,
      rankings,
      error: 'No model forecast data available',
      diagnostics: getModelFetchDiagnostics(cfg.wethrStation),
    })
  }

  const rankMap = new Map(rankings.map((r) => [r.model, r]))
  const weightMap = new Map(modelData.modelWeights.map((w) => [w.model, w]))

  const currentActualHigh = todayObs?.wethr_high ?? null

  const models = modelData.models.map((m) => {
    const rank = rankMap.get(m.model)
    const w = weightMap.get(m.model)
    return {
      model: m.model,
      runTime: m.runTime,
      projectedHigh: m.projectedHigh,
      projectedLow: m.projectedLow,
      forecastHour: m.forecastHour,
      insertedAt: m.insertedAt,
      paceVsActual: currentActualHigh !== null ? Math.round((m.projectedHigh - currentActualHigh) * 10) / 10 : null,
      rank: rank?.rank ?? null,
      mae: rank?.mae ?? null,
      bias: rank?.bias ?? null,
      n: rank?.n ?? 0,
      weight: w?.weight ?? 0,
    }
  }).sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank
    if (a.rank !== null) return -1
    if (b.rank !== null) return 1
    return b.weight - a.weight
  })

  return NextResponse.json({
    series: params.series,
    city: cfg.name,
    short: cfg.short,
    stationCode: cfg.wethrStation,
    forecastDate: tomorrowStr,
    currentActualHigh,
    models,
    consensus: {
      high: modelData.consensusHigh,
      low: modelData.consensusLow,
      weightedBy: modelData.weightedBy,
      interModelSpread: modelData.interModelSpread,
      topModels: modelData.topModels,
    },
    rankings,
    diagnostics: getModelFetchDiagnostics(cfg.wethrStation),
  })
}
