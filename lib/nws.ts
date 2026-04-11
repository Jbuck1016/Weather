import { CITIES } from './cities'

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { temp: number; ts: number }>()

const UA = 'WeatherEdge/1.0 contact@weatheredge.app'

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/geo+json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`NWS ${res.status} ${url}`)
  return res.json()
}

export async function getNwsForecastTemp(series: string): Promise<number | null> {
  const now = Date.now()
  const cached = cache.get(series)
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.temp

  const city = CITIES[series]
  if (!city) return null

  try {
    const pointData = await fetchJson(`https://api.weather.gov/points/${city.lat},${city.lon}`)
    const hourlyUrl: string | undefined = pointData.properties?.forecastHourly
    const dailyUrl: string | undefined = pointData.properties?.forecast

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowDay = tomorrow.getDate()

    if (hourlyUrl) {
      try {
        const hourly = await fetchJson(hourlyUrl)
        const temps: number[] = (hourly.properties?.periods ?? [])
          .filter((p: any) => new Date(p.startTime).getDate() === tomorrowDay)
          .map((p: any) => parseFloat(p.temperature))
          .filter((n: number) => Number.isFinite(n))
        if (temps.length > 0) {
          const temp = Math.max(...temps)
          cache.set(series, { temp, ts: now })
          return temp
        }
      } catch (e) {
        console.error(`NWS hourly failed for ${series}:`, e)
      }
    }

    if (dailyUrl) {
      const daily = await fetchJson(dailyUrl)
      for (const p of daily.properties?.periods ?? []) {
        if (!p.isDaytime) continue
        if (new Date(p.startTime).getDate() === tomorrowDay) {
          const temp = parseFloat(p.temperature)
          if (Number.isFinite(temp)) {
            cache.set(series, { temp, ts: now })
            return temp
          }
        }
      }
    }
  } catch (e) {
    console.error(`NWS failed for ${series}:`, e)
  }
  return null
}

export async function getAllNwsTemps(seriesList: string[]): Promise<Record<string, number>> {
  const results = await Promise.all(
    seriesList.map(async (s) => [s, await getNwsForecastTemp(s)] as const),
  )
  const out: Record<string, number> = {}
  for (const [s, t] of results) if (t !== null) out[s] = t
  return out
}
