export interface CityConfig {
  name: string
  short: string
  lat: number
  lon: number
  station: string
  wethrStation: string
  kalshiSlug: string
  timezone: string
}

export const CITIES: Record<string, CityConfig> = {
  KXHIGHNY:   { name: 'New York City',  short: 'NYC', lat: 40.7128, lon: -74.0060,  station: 'KNYC', wethrStation: 'KNYC', kalshiSlug: 'kxhighny/highest-temperature-in-nyc',                    timezone: 'America/New_York' },
  KXHIGHCHI:  { name: 'Chicago',        short: 'CHI', lat: 41.8827, lon: -87.6233,  station: 'KMDW', wethrStation: 'KMDW', kalshiSlug: 'kxhighchi/highest-temperature-in-chicago',                timezone: 'America/Chicago' },
  KXHIGHDEN:  { name: 'Denver',         short: 'DEN', lat: 39.7392, lon: -104.9903, station: 'KDEN', wethrStation: 'KDEN', kalshiSlug: 'kxhighden/highest-temperature-in-denver',                 timezone: 'America/Denver' },
  KXHIGHMIA:  { name: 'Miami',          short: 'MIA', lat: 25.7617, lon: -80.1918,  station: 'KMIA', wethrStation: 'KMIA', kalshiSlug: 'kxhighmia/highest-temperature-in-miami',                  timezone: 'America/New_York' },
  KXHIGHAUS:  { name: 'Austin',         short: 'AUS', lat: 30.2672, lon: -97.7431,  station: 'KAUS', wethrStation: 'KAUS', kalshiSlug: 'kxhighaus/highest-temperature-in-austin',                 timezone: 'America/Chicago' },
  KXHIGHLAX:  { name: 'Los Angeles',    short: 'LAX', lat: 34.0522, lon: -118.2437, station: 'KLAX', wethrStation: 'KLAX', kalshiSlug: 'kxhighlax/highest-temperature-in-los-angeles',            timezone: 'America/Los_Angeles' },
  KXHIGHSEA:  { name: 'Seattle',        short: 'SEA', lat: 47.6062, lon: -122.3321, station: 'KSEA', wethrStation: 'KSEA', kalshiSlug: 'kxhighsea/highest-temperature-in-seattle',                timezone: 'America/Los_Angeles' },
  KXHIGHPHX:  { name: 'Phoenix',        short: 'PHX', lat: 33.4484, lon: -112.0740, station: 'KPHX', wethrStation: 'KPHX', kalshiSlug: 'kxhighphx/highest-temperature-in-phoenix',                timezone: 'America/Phoenix' },
  KXHIGHDFW:  { name: 'Dallas',         short: 'DFW', lat: 32.7767, lon: -96.7970,  station: 'KDFW', wethrStation: 'KDFW', kalshiSlug: 'kxhighdfw/highest-temperature-in-dallas',                 timezone: 'America/Chicago' },
  KXHIGHBOS:  { name: 'Boston',         short: 'BOS', lat: 42.3601, lon: -71.0589,  station: 'KBOS', wethrStation: 'KBOS', kalshiSlug: 'kxhighbos/highest-temperature-in-boston',                 timezone: 'America/New_York' },
  KXHIGHATL:  { name: 'Atlanta',        short: 'ATL', lat: 33.7490, lon: -84.3880,  station: 'KATL', wethrStation: 'KATL', kalshiSlug: 'kxhighatl/highest-temperature-in-atlanta',                timezone: 'America/New_York' },
  KXHIGHPHIL: { name: 'Philadelphia',   short: 'PHL', lat: 39.9526, lon: -75.1652,  station: 'KPHL', wethrStation: 'KPHL', kalshiSlug: 'kxhighphil/highest-temperature-in-philadelphia',          timezone: 'America/New_York' },
  KXHIGHTMIN: { name: 'Minneapolis',    short: 'MSP', lat: 44.8848, lon: -93.2223,  station: 'KMSP', wethrStation: 'KMSP', kalshiSlug: 'kxhightmin/minneapolis-daily-high-temperature',           timezone: 'America/Chicago' },
  KXHIGHTHOU: { name: 'Houston',        short: 'HOU', lat: 29.9902, lon: -95.3368,  station: 'KHOU', wethrStation: 'KHOU', kalshiSlug: 'kxhighthou/daily-high-temperature-houston',               timezone: 'America/Chicago' },
  KXHIGHTSFO: { name: 'San Francisco',  short: 'SFO', lat: 37.6213, lon: -122.3790, station: 'KSFO', wethrStation: 'KSFO', kalshiSlug: 'kxhightsfo/san-francisco-high-temperature-daily',        timezone: 'America/Los_Angeles' },
  KXHIGHTDC:  { name: 'Washington DC',  short: 'DCA', lat: 38.8521, lon: -77.0377,  station: 'KDCA', wethrStation: 'KDCA', kalshiSlug: 'kxhightdc/washington-dc-daily-max-temp',                  timezone: 'America/New_York' },
  KXHIGHTOKC: { name: 'Oklahoma City',  short: 'OKC', lat: 35.3931, lon: -97.6008,  station: 'KOKC', wethrStation: 'KOKC', kalshiSlug: 'kxhightokc/oklahoma-city-maximum-high-temperature',       timezone: 'America/Chicago' },
}

export function citySeriesFromTicker(ticker: string): string | null {
  const match = ticker.match(/^(KXHIGH[A-Z]+)-/)
  if (!match) return null
  return CITIES[match[1]] ? match[1] : null
}
