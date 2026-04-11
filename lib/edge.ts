export function normalCDF(x: number, mean: number, std: number): number {
  const z = (x - mean) / std
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
  const cdf = 1 - phi * poly
  return z >= 0 ? cdf : 1 - cdf
}

export const FORECAST_STD_DEV = 3.0
export const STD_DEV_TODAY = 1.5
export const STD_DEV_TOMORROW = 3.0

export interface MarketInfo {
  type: 'bracket' | 'threshold'
  value?: number
  low?: number
  high?: number
  day: number
  year: number
  direction?: 'greater' | 'less'
}

export function parseTicker(ticker: string): MarketInfo | null {
  const m = ticker.match(/-(\d{2})([A-Z]{3})(\d{2})-([TB])([\d.]+)$/)
  if (!m) return null
  const year = parseInt(m[1])
  const day = parseInt(m[3])
  const mtype = m[4]
  const value = parseFloat(m[5])
  if (mtype === 'B') {
    return { type: 'bracket', low: value - 0.5, high: value + 0.5, day, year }
  }
  return { type: 'threshold', value, day, year }
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
}

export function parseTickerDate(ticker: string): Date | null {
  const m = ticker.match(/-(\d{2})([A-Z]{3})(\d{2})-/)
  if (!m) return null
  const year = 2000 + parseInt(m[1])
  const month = MONTHS[m[2]]
  const day = parseInt(m[3])
  if (month === undefined) return null
  return new Date(year, month, day)
}

export function calcNwsProb(
  forecastTemp: number,
  marketInfo: MarketInfo,
  title: string,
  stdDev: number = STD_DEV_TOMORROW,
): number {
  if (marketInfo.type === 'bracket') {
    return normalCDF(marketInfo.high! + 0.5, forecastTemp, stdDev)
         - normalCDF(marketInfo.low! - 0.5, forecastTemp, stdDev)
  }
  const v = marketInfo.value!
  if (marketInfo.direction === 'greater') {
    return 1 - normalCDF(v, forecastTemp, stdDev)
  }
  if (marketInfo.direction === 'less') {
    return normalCDF(v, forecastTemp, stdDev)
  }
  const tl = title.toLowerCase()
  if (tl.includes('>') || tl.includes('above') || tl.includes('or above')) {
    return 1 - normalCDF(v, forecastTemp, stdDev)
  }
  if (tl.includes('<') || tl.includes('below') || tl.includes('or below')) {
    return normalCDF(v, forecastTemp, stdDev)
  }
  return 1 - normalCDF(v, forecastTemp, stdDev)
}

export function calcKelly(nwsProb: number, kalshiProb: number, bankroll: number, edgePct: number) {
  const isBuyYes = edgePct > 0
  const p  = isBuyYes ? nwsProb : 1 - nwsProb
  const mp = isBuyYes ? kalshiProb : 1 - kalshiProb
  const rawKelly  = Math.max(0, (p - mp) / Math.max(1 - mp, 0.001))
  const halfKelly = rawKelly * 0.5
  const absEdge   = Math.abs(edgePct)
  const maxFrac   = absEdge >= 15 ? 0.15 : absEdge >= 8 ? 0.08 : 0.04
  const kellyFrac = Math.min(halfKelly, maxFrac)
  const betDollars = kellyFrac * bankroll
  const costPer    = isBuyYes ? kalshiProb : (1 - kalshiProb)
  const contracts  = costPer > 0 ? Math.floor(betDollars / costPer) : 0
  return {
    kellyPct:   Math.round(kellyFrac * 1000) / 10,
    betDollars: Math.round(betDollars * 100) / 100,
    contracts,
    actualCost: Math.round(contracts * costPer * 100) / 100,
    maxProfit:  Math.round(contracts * (1 - costPer) * 100) / 100,
  }
}

export function americanOdds(priceCents: number): string {
  if (!Number.isFinite(priceCents) || priceCents <= 0 || priceCents >= 100) return '—'
  const p = priceCents / 100
  if (p >= 0.5) {
    const odds = Math.round((p / (1 - p)) * 100)
    return odds >= 10000 ? '-9999+' : `-${odds}`
  }
  const odds = Math.round(((1 - p) / p) * 100)
  return odds >= 10000 ? '+9999+' : `+${odds}`
}

export function edgeLabel(edgePct: number): 'STRONG' | 'MODERATE' | 'WEAK' | null {
  const abs = Math.abs(edgePct)
  if (abs >= 15) return 'STRONG'
  if (abs >= 8)  return 'MODERATE'
  if (abs >= 4)  return 'WEAK'
  return null
}

export interface FeeStructure {
  tradingFeePct: number
  settlementFeePct: number
}

export const DEFAULT_FEES: FeeStructure = {
  tradingFeePct: 0.01,
  settlementFeePct: 0.10,
}

export interface FeeAdjustedResult {
  feeAdjustedEV: number
  feeAdjustedEvPct: number
  breakEvenProb: number
  grossEdgePct: number
  feeDragPct: number
}

export function calcFeeAdjustedEV(
  nwsProb: number,
  kalshiProbYes: number,
  direction: 'BUY YES' | 'BUY NO',
  fees: FeeStructure = DEFAULT_FEES,
): FeeAdjustedResult {
  const { tradingFeePct, settlementFeePct } = fees

  if (direction === 'BUY YES') {
    const cost = kalshiProbYes
    const tradingFee = cost * tradingFeePct
    const grossWin = 1 - cost
    const settlementFee = grossWin * settlementFeePct
    const netWin = grossWin - settlementFee - tradingFee
    const netLoss = -(cost + tradingFee)
    const ev = nwsProb * netWin + (1 - nwsProb) * netLoss
    const evPct = cost > 0 ? (ev / cost) * 100 : 0
    const breakEven = (netWin - netLoss) !== 0 ? (-netLoss) / (netWin - netLoss) : 1
    const grossEdge = (nwsProb - kalshiProbYes) * 100
    return {
      feeAdjustedEV: ev,
      feeAdjustedEvPct: evPct,
      breakEvenProb: breakEven,
      grossEdgePct: grossEdge,
      feeDragPct: grossEdge - evPct,
    }
  }

  const noProb = 1 - nwsProb
  const kalshiProbNo = 1 - kalshiProbYes
  const cost = kalshiProbNo
  const tradingFee = cost * tradingFeePct
  const grossWin = 1 - cost
  const settlementFee = grossWin * settlementFeePct
  const netWin = grossWin - settlementFee - tradingFee
  const netLoss = -(cost + tradingFee)
  const ev = noProb * netWin + (1 - noProb) * netLoss
  const evPct = cost > 0 ? (ev / cost) * 100 : 0
  const breakEven = (netWin - netLoss) !== 0 ? (-netLoss) / (netWin - netLoss) : 1
  const grossEdge = (noProb - kalshiProbNo) * 100
  return {
    feeAdjustedEV: ev,
    feeAdjustedEvPct: evPct,
    breakEvenProb: breakEven,
    grossEdgePct: grossEdge,
    feeDragPct: grossEdge - evPct,
  }
}
