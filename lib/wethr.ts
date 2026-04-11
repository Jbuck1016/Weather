const WETHR_BASE = 'https://wethr.net/api/v2'

function wethrHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.WETHR_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function wethrFetch(endpoint: string): Promise<any> {
  const res = await fetch(`${WETHR_BASE}${endpoint}`, {
    headers: wethrHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Wethr ${res.status} ${endpoint}: ${await res.text()}`)
  }
  return res.json()
}

interface CacheEntry<T> { data: T; ts: number }
const obsCache = new Map<string, CacheEntry<WethrObservation>>()
const forecastCache = new Map<string, CacheEntry<WethrForecast>>()

const OBS_TTL = 5 * 60 * 1000
const FORECAST_TTL = 30 * 60 * 1000

export interface WethrObservation {
  station_code: string
  date: string
  wethr_high: number | null
  wethr_low: number | null
  time_of_high_utc: string | null
  time_of_low_utc: string | null
  calculation_logic: string
  units: string
}

export interface WethrForecast {
  station_code: string
  station_name: string
  forecast_date: string
  version: number
  hourly_temps: (number | null)[]
  high: number | null
  low: number | null
  units: string
  time_convention: string
  updated_at?: string
}

export interface WethrCityData {
  todayHigh: number | null
  todayLow: number | null
  todayTimeOfHigh: string | null
  tomorrowForecastHigh: number | null
  tomorrowForecastLow: number | null
  tomorrowForecastVersion: number | null
  tomorrowForecastUpdatedAt: string | null
}

export interface ModelForecastPoint {
  model: string
  location_name: string
  run_time: string
  valid_time: string
  forecast_hour: number
  temperature_f: number
  inserted_at: string
}

export async function getWethrHigh(stationCode: string): Promise<WethrObservation | null> {
  const cacheKey = `wethr_high_${stationCode}`
  const cached = obsCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < OBS_TTL) return cached.data
  try {
    const data = await wethrFetch(
      `/observations.php?station_code=${stationCode}&mode=wethr_high&logic=nws`,
    )
    obsCache.set(cacheKey, { data, ts: Date.now() })
    return data
  } catch (e) {
    console.error(`Wethr wethr_high failed for ${stationCode}:`, e)
    return null
  }
}

export async function getNwsForecast(
  stationCode: string,
  date: string,
): Promise<WethrForecast | null> {
  const cacheKey = `nws_forecast_${stationCode}_${date}`
  const cached = forecastCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < FORECAST_TTL) return cached.data
  try {
    const data = await wethrFetch(
      `/nws_forecasts.php?station_code=${stationCode}&date=${date}&mode=latest`,
    )
    forecastCache.set(cacheKey, { data, ts: Date.now() })
    return data
  } catch (e) {
    console.error(`Wethr nws_forecasts failed for ${stationCode} ${date}:`, e)
    return null
  }
}

export async function getModelForecasts(
  stationCode: string,
  startUtc: string,
  endUtc: string,
  models = 'HRRR,GFS,NBM,NAM,ECMWF-IFS',
): Promise<ModelForecastPoint[]> {
  try {
    const params = new URLSearchParams({
      location_name: stationCode,
      start_valid_time: startUtc,
      end_valid_time: endUtc,
      model: models,
    })
    const data = await wethrFetch(`/forecasts.php?${params}`)
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error(`Wethr model forecasts failed for ${stationCode}:`, e)
    return []
  }
}

export async function getCityWeatherData(
  stationCode: string,
  _todayDate: string,
  tomorrowDate: string,
): Promise<WethrCityData> {
  const [todayObs, tomorrowFcst] = await Promise.allSettled([
    getWethrHigh(stationCode),
    getNwsForecast(stationCode, tomorrowDate),
  ])

  const obs = todayObs.status === 'fulfilled' ? todayObs.value : null
  const fcst = tomorrowFcst.status === 'fulfilled' ? tomorrowFcst.value : null

  return {
    todayHigh: obs?.wethr_high ?? null,
    todayLow: obs?.wethr_low ?? null,
    todayTimeOfHigh: obs?.time_of_high_utc ?? null,
    tomorrowForecastHigh: fcst?.high ?? null,
    tomorrowForecastLow: fcst?.low ?? null,
    tomorrowForecastVersion: fcst?.version ?? null,
    tomorrowForecastUpdatedAt: fcst?.updated_at ?? null,
  }
}
