export interface KalshiMarket {
  ticker: string
  event_ticker: string
  title: string
  subtitle?: string
  yes_bid_dollars?: string
  yes_ask_dollars?: string
  no_bid_dollars?: string
  no_ask_dollars?: string
  yes_bid?: number
  yes_ask?: number
  no_bid?: number
  no_ask?: number
  volume?: number
  status?: string
  open_time?: string
  close_time?: string
  strike_type?: 'greater' | 'less' | 'between' | string
  floor_strike?: number
  cap_strike?: number
}

export interface EdgeResult {
  rank: number
  series: string
  city: string
  cityShort: string
  ticker: string
  eventTicker: string
  title: string
  subtitle: string
  kalshiSlug: string
  yesBid: number
  yesAsk: number
  noBid: number
  noAsk: number
  volume: number
  kalshiProb: number
  nwsTemp: number
  nwsProb: number
  edgePct: number
  edgeLabel: 'STRONG' | 'MODERATE' | 'WEAK'
  direction: 'BUY YES' | 'BUY NO'
  kellyPct: number
  betDollars: number
  contracts: number
  actualCost: number
  maxProfit: number
  entryCents: number
  marketType: 'bracket' | 'threshold'
  marketLow?: number
  marketHigh?: number
  marketValue?: number
  dateIso: string
  dayLabel: 'TODAY' | 'TOMORROW' | 'FUTURE' | 'PAST'
  daysOut: number
  forecastSource: 'wethr_actual' | 'model_consensus' | 'wethr_nws_forecast' | 'nws_fallback'
  forecastTemp: number
  wethrHigh: number | null
  wethrLow: number | null
  forecastHigh: number | null
  forecastLow: number | null
  forecastVersion: number | null
  forecastUpdatedAt: string | null
  stdDevUsed: number
  feeAdjustedEvPct: number
  breakEvenProb: number
  feeDragPct: number
  grossEdgePct: number
  isHighMarket: boolean
  strikeType: 'between' | 'greater' | 'less'
  floorStrike: number | null
  capStrike: number | null
  modelConsensus: number | null
  interModelSpread: number
  topModels: string[]
  modelCount: number
  weightedBy: 'accuracy' | 'equal' | null
  closeTime: string | null
  hoursToClose: number
}

export interface CityStatus {
  series: string
  name: string
  short: string
  count: number
  nwsTemp: number | null
  strongest: number
}

export interface EdgesResponse {
  edges: EdgeResult[]
  nwsTemps: Record<string, number>
  cityStatus: CityStatus[]
  bankroll: number
  updatedAt: string
  tomorrow: string
}

export interface Position {
  id: string
  created_at: string
  market_ticker: string
  city: string
  market_type: string
  date: string
  subtitle: string | null
  side: 'YES' | 'NO'
  contracts: number
  entry_price_cents: number
  limit_price_cents: number | null
  edge_pct_at_entry: number | null
  nws_temp_at_entry: number | null
  nws_prob_at_entry: number | null
  kalshi_prob_at_entry: number | null
  kelly_pct: number | null
  actual_cost: number | null
  status: 'open' | 'settled' | 'closed'
  settlement_result: 'WIN' | 'LOSS' | null
  settlement_temp: number | null
  pnl: number | null
  source: 'manual' | 'auto'
}

export interface KalshiPosition {
  ticker: string
  eventTicker: string
  city: string
  side: 'YES' | 'NO'
  contracts: number
  avgEntryCents: number
  currentPriceCents: number
  unrealizedPnl: number
  americanOdds: string
}

export interface SettledBet {
  date: string
  ticker: string
  city: string
  side: 'YES' | 'NO'
  contracts: number
  result: 'WIN' | 'LOSS'
  pnl: number
}

export interface EdgeSignalInsert {
  market_ticker: string
  series: string
  city: string
  market_date: string
  market_type: 'high' | 'low'
  subtitle: string
  strike_type: 'between' | 'greater' | 'less'
  floor_strike: number | null
  cap_strike: number | null
  yes_bid_cents: number
  yes_ask_cents: number
  kalshi_prob: number
  volume: number
  forecast_source: string
  forecast_temp: number
  nws_prob: number
  std_dev_used: number
  edge_pct: number
  edge_label: string
  direction: string
  fee_adjusted_ev_pct: number
  kelly_pct: number
  kelly_dollars: number
  predicted_prob: number
}

export interface EdgeSignalRow extends EdgeSignalInsert {
  id: string
  captured_at: string
  settled: boolean
  settlement_temp: number | null
  settlement_result: 'WIN' | 'LOSS' | null
  settled_at: string | null
  actual_outcome: 0 | 1 | null
  brier_score: number | null
}

export interface CalibrationBucket {
  bucket_label: string
  prob_min: number
  prob_max: number
  city: string | null
  market_type: string | null
  edge_label: string | null
  total_signals: number
  settled_signals: number
  wins: number
  losses: number
  actual_win_rate: number
  avg_predicted_prob: number
  avg_brier_score: number
  calibration_error: number
}

export interface PortfolioResponse {
  balance: number
  portfolioValue: number
  openPositions: KalshiPosition[]
  settledBets: SettledBet[]
  summary: {
    wins: number
    losses: number
    winRate: number
    totalWagered: number
    totalPnl: number
    roi: number
  }
}
