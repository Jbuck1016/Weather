import { CITIES } from './cities'
import { getServerSupabase } from './supabase'

const WETHR_BASE = 'https://wethr.net/api/v2'
const MODEL_CACHE_TTL = 60 * 60 * 1000

export const TRACKED_MODELS = [
  'HRRR', 'GFS', 'NBM', 'NAM', 'ECMWF-IFS',
  'GEFS', 'GFS-MOS', 'NAM-MOS', 'RAP', 'ICON',
  'NBS-MOS', 'UKMO', 'JMA', 'ARPEGE',
] as const

export interface ModelForecastResult {
  model: string
  runTime: string
  projectedHigh: number
  projectedLow: number
  insertedAt: string
  forecastHour: number
}

export interface CityModelData {
  stationCode: string
  forecastDate: string
  models: ModelForecastResult[]
  consensusHigh: number
  consensusLow: number
  topModels: string[]
  weightedBy: 'accuracy' | 'equal'
  modelWeights: { model: string; weight: number; projected: number; mae?: number }[]
  interModelSpread: number
  fetchedAt: number
}

const modelCache = new Map<string, CityModelData>()

function wethrHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.WETHR_API_KEY}` }
}

const TZ_OFFSETS: Record<string, number> = {
  'America/New_York': -5,
  'America/Chicago': -6,
  'America/Denver': -7,
  'America/Los_Angeles': -8,
  'America/Phoenix': -7,
}

function lstWindowToUtc(forecastDate: string, tz: string): { start: string; end: string } {
  const offset = TZ_OFFSETS[tz] ?? -6
  const start = new Date(`${forecastDate}T00:00:00Z`)
  start.setUTCHours(start.getUTCHours() - offset)
  const end = new Date(start)
  end.setUTCHours(end.getUTCHours() + 24)
  return {
    start: start.toISOString().replace('.000Z', 'Z'),
    end: end.toISOString().replace('.000Z', 'Z'),
  }
}

export interface ModelFetchDiagnostics {
  url: string
  status: number
  ok: boolean
  bodyPreview: string
  parsedShape: string
  rawCount: number
  modelsFound: string[]
  error?: string
}

let lastDiagnostics: Map<string, ModelFetchDiagnostics> = new Map()
export function getModelFetchDiagnostics(stationCode: string): ModelFetchDiagnostics | null {
  return lastDiagnostics.get(stationCode) ?? null
}

const REQUIRED_US_MODELS = ['GFS', 'HRRR', 'NAM', 'NBM']

const toIso = (s: string | undefined): string =>
  s ? s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z') : new Date().toISOString()

async function fetchAndParseWindow(
  stationCode: string,
  startIso: string,
  endIso: string,
  diag: ModelFetchDiagnostics,
  windowLabel: string,
): Promise<ModelForecastResult[]> {
  const params = new URLSearchParams({
    location_name: stationCode,
    start_valid_time: startIso,
    end_valid_time: endIso,
  })
  const url = `${WETHR_BASE}/forecasts.php?${params}`
  diag.url = url

  const res = await fetch(url, { headers: wethrHeaders(), cache: 'no-store' })
  diag.status = res.status
  diag.ok = res.ok
  const rawText = await res.text()
  diag.bodyPreview = rawText.slice(0, 600)

  if (!res.ok) {
    diag.error = `HTTP ${res.status}`
    console.error(`[modelForecasts] ${stationCode} ${windowLabel} HTTP ${res.status}: ${rawText.slice(0, 200)}`)
    return []
  }

  let parsed: any
  try {
    parsed = JSON.parse(rawText)
  } catch {
    diag.error = 'JSON parse error'
    console.error(`[modelForecasts] ${stationCode} ${windowLabel} JSON parse failed:`, rawText.slice(0, 200))
    return []
  }

  let data: any[]
  if (Array.isArray(parsed)) {
    data = parsed
    diag.parsedShape = 'array'
  } else if (Array.isArray(parsed?.data)) {
    data = parsed.data
    diag.parsedShape = 'object.data'
  } else if (Array.isArray(parsed?.forecasts)) {
    data = parsed.forecasts
    diag.parsedShape = 'object.forecasts'
  } else if (Array.isArray(parsed?.results)) {
    data = parsed.results
    diag.parsedShape = 'object.results'
  } else {
    diag.parsedShape = `object{${Object.keys(parsed ?? {}).join(',')}}`
    diag.error = `Unrecognized response shape`
    console.error(`[modelForecasts] ${stationCode} ${windowLabel} unknown shape:`, diag.parsedShape)
    return []
  }
  diag.rawCount = data.length
  if (data.length === 0) return []

  const groups = new Map<string, any[]>()
  for (const point of data) {
    const tempF = parseFloat(point.temperature_f as string)
    if (isNaN(tempF)) continue
    const runHour = (point.run_time as string).split(' ')[1]?.slice(0, 2) ?? '00'
    const key = `${point.model}__${runHour}z__${point.run_time}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(point)
  }

  console.log(
    `[modelForecasts] ${stationCode} ${windowLabel}: ${groups.size} groups, sample keys:`,
    [...groups.keys()].slice(0, 5),
  )

  const byModel = new Map<string, ModelForecastResult>()
  for (const [key, points] of groups.entries()) {
    const [model, runLabel] = key.split('__')
    const temps = points
      .map((p: any) => parseFloat(p.temperature_f as string))
      .filter((t: number) => !isNaN(t))
    if (!temps.length) continue
    const projectedHigh = Math.max(...temps)
    const projectedLow = Math.min(...temps)
    const peakPoint = points.find((p: any) => parseFloat(p.temperature_f as string) === projectedHigh)
    const insertedAt = points
      .map((p: any) => p.inserted_at as string)
      .filter(Boolean)
      .sort((a, b) => new Date(toIso(b)).getTime() - new Date(toIso(a)).getTime())[0]
      || new Date().toISOString()

    const result: ModelForecastResult = {
      model,
      runTime: runLabel,
      projectedHigh,
      projectedLow,
      insertedAt,
      forecastHour: peakPoint?.forecast_hour ?? 0,
    }
    const existing = byModel.get(model)
    if (
      !existing ||
      new Date(toIso(insertedAt)).getTime() > new Date(toIso(existing.insertedAt)).getTime()
    ) {
      byModel.set(model, result)
    }
  }

  return Array.from(byModel.values())
}

export async function fetchModelForecasts(
  stationCode: string,
  forecastDate: string,
  timezone: string,
): Promise<ModelForecastResult[]> {
  const { start, end } = lstWindowToUtc(forecastDate, timezone)

  const diag: ModelFetchDiagnostics = {
    url: '',
    status: 0,
    ok: false,
    bodyPreview: '',
    parsedShape: 'unknown',
    rawCount: 0,
    modelsFound: [],
  }

  try {
    // Primary window: full LST day
    const primary = await fetchAndParseWindow(stationCode, start, end, diag, 'primary')
    const merged = new Map<string, ModelForecastResult>()
    for (const m of primary) merged.set(m.model, m)

    // If any of the key US models are missing, try a wider window starting 6h earlier
    // to catch later-running cycles (e.g. GFS 12z/18z whose valid_time may begin
    // outside the primary window for that station's LST day)
    // Try a wider window once if any of the priority US models are absent.
    // After this single retry, models still missing are simply not surfaced —
    // Wethr may not provide them for this station.
    const missing = REQUIRED_US_MODELS.filter((m) => !merged.has(m))
    if (missing.length > 0) {
      const startEarlier = new Date(start)
      startEarlier.setUTCHours(startEarlier.getUTCHours() - 6)
      const startEarlierIso = startEarlier.toISOString().replace('.000Z', 'Z')
      const extended = await fetchAndParseWindow(stationCode, startEarlierIso, end, diag, 'extended')
      for (const m of extended) {
        const existing = merged.get(m.model)
        if (
          !existing ||
          new Date(toIso(m.insertedAt)).getTime() > new Date(toIso(existing.insertedAt)).getTime()
        ) {
          merged.set(m.model, m)
        }
      }
    }

    const results = Array.from(merged.values())
    diag.modelsFound = results.map((r) => r.model)
    if (results.length === 0) {
      diag.error = diag.error ?? 'parsed but no usable models'
      console.warn(`[modelForecasts] ${stationCode} produced 0 models`)
    } else {
      console.log(`[modelForecasts] ${stationCode}: ${results.length} models — ${diag.modelsFound.join(', ')}`)
    }
    lastDiagnostics.set(stationCode, diag)
    return results
  } catch (e: any) {
    diag.error = e?.message ?? String(e)
    console.error(`[modelForecasts] ${stationCode} threw:`, e)
    lastDiagnostics.set(stationCode, diag)
    return []
  }
}

export async function getModelRankings(
  stationCode: string,
  windowDays: 7 | 14 | 30 = 7,
): Promise<{ model: string; mae: number; bias: number; rank: number; n: number }[]> {
  try {
    const sb = getServerSupabase()
    const { data } = await sb
      .from('model_accuracy')
      .select('model, mae, bias, rank, sample_size')
      .eq('station_code', stationCode)
      .eq('window_days', windowDays)
      .order('rank', { ascending: true })
    return (data ?? []).map((r: any) => ({
      model: r.model,
      mae: r.mae,
      bias: r.bias,
      rank: r.rank,
      n: r.sample_size,
    }))
  } catch (e) {
    console.error('getModelRankings failed:', e)
    return []
  }
}

export interface ConsensusResult {
  consensusHigh: number
  weightedBy: 'accuracy' | 'equal'
  modelWeights: { model: string; weight: number; projected: number; mae?: number }[]
  interModelSpread: number
}

export function calcWeightedConsensus(
  modelResults: ModelForecastResult[],
  rankings: { model: string; mae: number; bias: number; n: number }[],
): ConsensusResult {
  if (!modelResults.length) {
    return { consensusHigh: 0, weightedBy: 'equal', modelWeights: [], interModelSpread: 0 }
  }

  const rankMap = new Map(rankings.map((r) => [r.model, r]))
  const hasAccuracyData = rankings.length >= 3 && rankings.every((r) => r.n >= 2)

  let weights: number[]
  let weightedBy: 'accuracy' | 'equal' = 'equal'

  if (hasAccuracyData) {
    const avgMae = rankings.reduce((s, r) => s + r.mae, 0) / rankings.length
    weights = modelResults.map((m) => {
      const rank = rankMap.get(m.model)
      return rank ? 1 / Math.max(rank.mae, 0.1) : 1 / Math.max(avgMae, 0.1)
    })
    weightedBy = 'accuracy'
  } else {
    weights = modelResults.map(() => 1)
  }

  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const normalized = weights.map((w) => w / totalWeight)

  let consensusHigh = modelResults.reduce((sum, m, i) => sum + m.projectedHigh * normalized[i], 0)

  // Bias correction only when we have ≥7 samples and ≥3 models
  const enoughForBias = rankings.length >= 3 && rankings.slice(0, 3).every((r) => r.n >= 7)
  if (hasAccuracyData && enoughForBias) {
    const topThree = rankings.slice(0, 3)
    const avgBias = topThree.reduce((s, r) => s + r.bias, 0) / topThree.length
    consensusHigh += avgBias
  }

  // Inter-model spread (simple unweighted std dev)
  const mean = modelResults.reduce((s, m) => s + m.projectedHigh, 0) / modelResults.length
  const variance =
    modelResults.reduce((s, m) => s + Math.pow(m.projectedHigh - mean, 2), 0) / modelResults.length
  const interModelSpread = Math.sqrt(variance)

  const modelWeights = modelResults.map((m, i) => ({
    model: m.model,
    weight: Math.round(normalized[i] * 1000) / 10,
    projected: m.projectedHigh,
    mae: rankMap.get(m.model)?.mae,
  }))

  return {
    consensusHigh: Math.round(consensusHigh * 10) / 10,
    weightedBy,
    modelWeights,
    interModelSpread: Math.round(interModelSpread * 10) / 10,
  }
}

export async function getCityModelData(
  series: string,
  forecastDate: string,
): Promise<CityModelData | null> {
  const city = CITIES[series]
  if (!city) return null

  const cacheKey = `${city.wethrStation}_${forecastDate}`
  const cached = modelCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL) return cached

  const [modelResults, rankings] = await Promise.all([
    fetchModelForecasts(city.wethrStation, forecastDate, city.timezone),
    getModelRankings(city.wethrStation, 7),
  ])

  if (!modelResults.length) return null

  const consensus = calcWeightedConsensus(modelResults, rankings)

  const consensusLowMean =
    modelResults.reduce((s, m) => s + m.projectedLow, 0) / modelResults.length

  const result: CityModelData = {
    stationCode: city.wethrStation,
    forecastDate,
    models: modelResults,
    consensusHigh: consensus.consensusHigh,
    consensusLow: Math.round(consensusLowMean * 10) / 10,
    topModels: rankings.slice(0, 3).map((r) => r.model),
    weightedBy: consensus.weightedBy,
    modelWeights: consensus.modelWeights,
    interModelSpread: consensus.interModelSpread,
    fetchedAt: Date.now(),
  }

  modelCache.set(cacheKey, result)

  // Persist asynchronously
  void persistModelForecasts(series, city.wethrStation, forecastDate, modelResults)

  return result
}

async function persistModelForecasts(
  series: string,
  stationCode: string,
  forecastDate: string,
  models: ModelForecastResult[],
): Promise<void> {
  try {
    const sb = getServerSupabase()
    const rows = models.map((m) => ({
      station_code: stationCode,
      series,
      forecast_date: forecastDate,
      model: m.model,
      run_time: m.runTime,
      projected_high: m.projectedHigh,
      projected_low: m.projectedLow,
      raw_forecast_temp: m.projectedHigh,
      forecast_hour: m.forecastHour,
      inserted_at_wethr: m.insertedAt,
    }))
    await sb
      .from('model_forecasts')
      .upsert(rows, { onConflict: 'station_code,forecast_date,model,run_time' })
  } catch (e) {
    console.error('persistModelForecasts failed:', e)
  }
}

export async function settleModelForecasts(
  stationCode: string,
  forecastDate: string,
  actualHigh: number,
): Promise<void> {
  try {
    const sb = getServerSupabase()
    const { data: forecasts } = await sb
      .from('model_forecasts')
      .select('id, model, projected_high')
      .eq('station_code', stationCode)
      .eq('forecast_date', forecastDate)
      .eq('settled', false)
    if (!forecasts?.length) return

    for (const f of forecasts as any[]) {
      const error = actualHigh - f.projected_high
      const absError = Math.abs(error)
      await sb
        .from('model_forecasts')
        .update({ actual_high: actualHigh, error_f: error, abs_error_f: absError, settled: true })
        .eq('id', f.id)
    }

    await rebuildModelAccuracy(stationCode)
  } catch (e) {
    console.error('settleModelForecasts failed:', e)
  }
}

export async function rebuildModelAccuracy(stationCode: string): Promise<void> {
  const sb = getServerSupabase()
  for (const windowDays of [7, 14, 30] as const) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - windowDays)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const { data: settled } = await sb
      .from('model_forecasts')
      .select('model, error_f, abs_error_f')
      .eq('station_code', stationCode)
      .eq('settled', true)
      .gte('forecast_date', cutoffStr)
    if (!settled?.length) continue

    const byModel = new Map<string, { errors: number[]; absErrors: number[] }>()
    for (const row of settled as any[]) {
      if (!byModel.has(row.model)) byModel.set(row.model, { errors: [], absErrors: [] })
      byModel.get(row.model)!.errors.push(row.error_f)
      byModel.get(row.model)!.absErrors.push(row.abs_error_f)
    }

    const stats: { model: string; mae: number; bias: number; rmse: number; n: number }[] = []
    for (const [model, d] of byModel.entries()) {
      if (d.absErrors.length < 2) continue
      const mae = d.absErrors.reduce((s, e) => s + e, 0) / d.absErrors.length
      const bias = d.errors.reduce((s, e) => s + e, 0) / d.errors.length
      const rmse = Math.sqrt(d.errors.reduce((s, e) => s + e * e, 0) / d.errors.length)
      stats.push({ model, mae, bias, rmse, n: d.absErrors.length })
    }
    stats.sort((a, b) => a.mae - b.mae)

    for (let i = 0; i < stats.length; i++) {
      const { model, mae, bias, rmse, n } = stats[i]
      await sb.from('model_accuracy').upsert(
        {
          station_code: stationCode,
          model,
          window_days: windowDays,
          sample_size: n,
          mae: Math.round(mae * 1000) / 1000,
          bias: Math.round(bias * 1000) / 1000,
          rmse: Math.round(rmse * 1000) / 1000,
          rank: i + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'station_code,model,window_days' },
      )
    }
  }
}
