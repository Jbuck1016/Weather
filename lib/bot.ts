import { getServerSupabase } from './supabase'
import { kalshiGet } from './kalshi'
import type { EdgeResult } from './types'

export interface BotState {
  enabled: boolean
  paper_only: boolean
  paper_bankroll: number
  initial_bankroll: number
  peak_bankroll: number
  min_fee_ev_pct: number
  max_inter_model_spread: number
  min_edge_pct: number
  min_volume: number
  max_daily_spend: number
  max_open_positions: number
  max_positions_per_city: number
  max_trade_dollars: number
  kelly_fraction: number
  profit_take_multiple: number
  stop_loss_pct: number
  min_hours_to_close: number
  daily_spend_today: number
  daily_reset_date: string
  total_trades: number
  last_run_at: string | null
  last_cycle_id: string | null
  last_run_status: string | null
  last_run_signals_evaluated: number | null
  last_run_trades_placed: number | null
}

export type BotAction =
  | 'BUY' | 'SKIP' | 'HOLD' | 'SELL'
  | 'PROFIT_TAKE' | 'STOP_LOSS' | 'TIME_STOP' | 'NEEDS_SETTLEMENT'

export interface BotDecision {
  market_ticker: string
  city: string
  market_date: string
  subtitle: string
  edge_pct: number
  fee_ev_pct: number
  kalshi_prob: number
  model_prob: number
  inter_model_spread: number
  signal_label: string
  direction: string
  action: BotAction
  reason: string
  fee_ev_ok: boolean
  spread_ok: boolean
  volume_ok: boolean
  signal_strength_ok: boolean
  daily_limit_ok: boolean
  position_limit_ok: boolean
  city_limit_ok: boolean
  time_to_close_ok: boolean
  bot_trade_id?: string
}

export interface BotTrade {
  id: string
  market_ticker: string
  series: string
  city: string
  market_date: string
  market_type: 'high' | 'low'
  subtitle: string | null
  strike_type: string
  floor_strike: number | null
  cap_strike: number | null
  side: 'YES' | 'NO'
  contracts: number
  entry_price_cents: number
  cost: number
  edge_pct_at_entry: number
  fee_ev_at_entry: number
  kalshi_prob_at_entry: number
  model_prob_at_entry: number
  inter_model_spread: number
  status: 'open' | 'closed' | 'settled'
  close_time: string | null
  paper_bankroll_before: number
  paper_bankroll_after: number
  net_pnl: number | null
  cycle_id: string
  created_at: string
}

export async function getBotState(): Promise<BotState | null> {
  const sb = getServerSupabase()
  const { data, error } = await sb.from('bot_state').select('*').eq('id', 1).single()
  if (error) {
    console.error('[bot] getBotState failed:', error)
    return null
  }
  return data as BotState
}

export async function updateBotState(updates: Partial<BotState>): Promise<void> {
  const sb = getServerSupabase()
  const { error } = await sb
    .from('bot_state')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) console.error('[bot] updateBotState failed:', error)
}

export async function checkDailyReset(state: BotState): Promise<BotState> {
  const todayStr = new Date().toISOString().slice(0, 10)
  if (state.daily_reset_date !== todayStr) {
    await updateBotState({ daily_spend_today: 0, daily_reset_date: todayStr })
    return { ...state, daily_spend_today: 0, daily_reset_date: todayStr }
  }
  return state
}

export function evaluateEntry(
  edge: EdgeResult,
  state: BotState,
  openPositions: BotTrade[],
): BotDecision {
  const cityPositions = openPositions.filter((p) => p.city === edge.city)

  const fee_ev_ok = (edge.feeAdjustedEvPct ?? 0) >= state.min_fee_ev_pct
  const spread_ok = (edge.interModelSpread ?? 99) <= state.max_inter_model_spread
  const volume_ok = (edge.volume ?? 0) >= state.min_volume
  const signal_strength_ok = Math.abs(edge.edgePct ?? 0) >= state.min_edge_pct
  const daily_limit_ok = state.daily_spend_today < state.max_daily_spend
  const position_limit_ok = openPositions.length < state.max_open_positions
  const city_limit_ok = cityPositions.length < state.max_positions_per_city
  const time_to_close_ok = (edge.hoursToClose ?? 24) >= state.min_hours_to_close

  const allPass =
    fee_ev_ok && spread_ok && volume_ok && signal_strength_ok &&
    daily_limit_ok && position_limit_ok && city_limit_ok && time_to_close_ok

  const failures: string[] = []
  if (!fee_ev_ok) failures.push(`Fee EV ${edge.feeAdjustedEvPct?.toFixed(1)}% < ${state.min_fee_ev_pct}% threshold`)
  if (!spread_ok) failures.push(`Model spread ${edge.interModelSpread?.toFixed(1)}°F > ${state.max_inter_model_spread}°F max`)
  if (!volume_ok) failures.push(`Volume ${edge.volume} < ${state.min_volume} minimum`)
  if (!signal_strength_ok) failures.push(`Edge ${edge.edgePct?.toFixed(1)}% < ${state.min_edge_pct}% minimum`)
  if (!daily_limit_ok) failures.push(`Daily spend $${state.daily_spend_today.toFixed(0)} at limit $${state.max_daily_spend}`)
  if (!position_limit_ok) failures.push(`${openPositions.length} open positions at max ${state.max_open_positions}`)
  if (!city_limit_ok) failures.push(`${cityPositions.length} ${edge.city} positions at city max ${state.max_positions_per_city}`)
  if (!time_to_close_ok) failures.push(`Only ${edge.hoursToClose?.toFixed(1)}h to close, need ${state.min_hours_to_close}h`)

  const reason = allPass
    ? `All filters passed — ${edge.direction} at ${edge.edgePct?.toFixed(1)}% edge, Fee EV ${edge.feeAdjustedEvPct?.toFixed(1)}%`
    : `SKIP: ${failures.join('; ')}`

  return {
    market_ticker: edge.ticker,
    city: edge.city,
    market_date: edge.dateIso,
    subtitle: edge.subtitle ?? '',
    edge_pct: edge.edgePct ?? 0,
    fee_ev_pct: edge.feeAdjustedEvPct ?? 0,
    kalshi_prob: edge.kalshiProb,
    model_prob: edge.nwsProb,
    inter_model_spread: edge.interModelSpread ?? 0,
    signal_label: edge.edgeLabel ?? '',
    direction: edge.direction ?? '',
    action: allPass ? 'BUY' : 'SKIP',
    reason,
    fee_ev_ok,
    spread_ok,
    volume_ok,
    signal_strength_ok,
    daily_limit_ok,
    position_limit_ok,
    city_limit_ok,
    time_to_close_ok,
  }
}

export interface SizingResult {
  contracts: number
  cost: number
  entryPriceCents: number
}

export function sizePaperTrade(edge: EdgeResult, state: BotState): SizingResult {
  const kellyDollars = (edge.kellyPct / 100) * state.paper_bankroll * state.kelly_fraction
  const cappedDollars = Math.min(kellyDollars, state.max_trade_dollars)
  const remainingBudget = state.max_daily_spend - state.daily_spend_today
  const tradeDollars = Math.min(cappedDollars, remainingBudget)

  const isBuyYes = edge.direction === 'BUY YES'
  const entryPriceCents = isBuyYes
    ? (edge.yesAsk > 0 ? edge.yesAsk : edge.yesBid)
    : (edge.noAsk > 0 ? edge.noAsk : 100 - edge.yesBid)

  if (entryPriceCents <= 0 || entryPriceCents >= 100) {
    return { contracts: 0, cost: 0, entryPriceCents: 0 }
  }

  const costPerContract = entryPriceCents / 100
  const contracts = Math.floor(tradeDollars / costPerContract)
  const cost = Math.round(contracts * costPerContract * 100) / 100
  return { contracts, cost, entryPriceCents }
}

export async function getOpenPositions(): Promise<BotTrade[]> {
  const sb = getServerSupabase()
  const { data } = await sb.from('bot_trades').select('*').eq('status', 'open')
  return (data ?? []) as BotTrade[]
}

async function fetchCurrentPriceCents(
  ticker: string,
  side: 'YES' | 'NO',
  fallback: number,
): Promise<number> {
  try {
    const market: any = await kalshiGet(`/markets/${ticker}`)
    const m = market?.market
    if (!m) return fallback
    const yesBid = Math.round(parseFloat(m.yes_bid_dollars ?? '0') * 100)
    const yesAsk = Math.round(parseFloat(m.yes_ask_dollars ?? '0') * 100)
    if (yesBid === 0 && yesAsk === 0) return fallback
    const yesMid = (yesBid + yesAsk) / 2
    return side === 'YES' ? yesMid : 100 - yesMid
  } catch (e) {
    console.error(`[bot] price fetch failed for ${ticker}:`, e)
    return fallback
  }
}

export async function checkExits(
  openPositions: BotTrade[],
  state: BotState,
): Promise<BotDecision[]> {
  const sb = getServerSupabase()
  const decisions: BotDecision[] = []

  for (const pos of openPositions) {
    const currentPriceCents = await fetchCurrentPriceCents(pos.market_ticker, pos.side, pos.entry_price_cents)
    const priceRatio = currentPriceCents / pos.entry_price_cents
    const hoursToClose = pos.close_time
      ? (new Date(pos.close_time).getTime() - Date.now()) / 3600000
      : 24

    const todayStr = new Date().toISOString().slice(0, 10)
    const needsSettlement = pos.market_date < todayStr

    let action: BotAction = 'HOLD'
    let reason = `Holding — current ${currentPriceCents.toFixed(0)}¢ (${priceRatio.toFixed(2)}x entry)`

    if (needsSettlement) {
      action = 'NEEDS_SETTLEMENT'
      reason = `Market settled on ${pos.market_date} — awaiting NWS actual temp`
    } else if (priceRatio >= state.profit_take_multiple) {
      action = 'PROFIT_TAKE'
      reason = `Profit take — price ${currentPriceCents.toFixed(0)}¢ is ${priceRatio.toFixed(2)}x entry (${state.profit_take_multiple}x target)`
    } else if (priceRatio <= 1 - state.stop_loss_pct) {
      action = 'STOP_LOSS'
      reason = `Stop loss — price ${currentPriceCents.toFixed(0)}¢ dropped ${((1 - priceRatio) * 100).toFixed(0)}% from entry`
    } else if (hoursToClose < state.min_hours_to_close) {
      action = 'TIME_STOP'
      reason = `Time stop — ${hoursToClose.toFixed(1)}h to market close`
    }

    if (action === 'PROFIT_TAKE' || action === 'STOP_LOSS' || action === 'TIME_STOP') {
      const isProfitTake = action === 'PROFIT_TAKE'
      const contractsToSell = isProfitTake ? Math.floor(pos.contracts / 2) : pos.contracts
      const proceeds = (contractsToSell * currentPriceCents) / 100
      const tradingFee = proceeds * 0.01
      const portionCost = pos.cost * (contractsToSell / pos.contracts)
      const isWin = proceeds > portionCost
      const settlementFee = isWin ? (proceeds - portionCost) * 0.10 : 0
      const netProceeds = proceeds - tradingFee - settlementFee
      const netPnl = Math.round((netProceeds - portionCost) * 100) / 100

      const remainingContracts = pos.contracts - contractsToSell
      const stillOpen = isProfitTake && remainingContracts > 0

      await sb
        .from('bot_trades')
        .update({
          status: stillOpen ? 'open' : 'closed',
          exit_price_cents: currentPriceCents,
          exit_reason: action.toLowerCase(),
          exit_contracts: contractsToSell,
          exit_proceeds: Math.round(proceeds * 100) / 100,
          closed_at: stillOpen ? null : new Date().toISOString(),
          contracts: stillOpen ? remainingContracts : pos.contracts,
          net_pnl: ((pos as any).net_pnl ?? 0) + netPnl,
          trading_fee: ((pos as any).trading_fee ?? 0) + tradingFee,
          settlement_fee: ((pos as any).settlement_fee ?? 0) + settlementFee,
        })
        .eq('id', pos.id)

      const newBankroll = state.paper_bankroll + netProceeds
      await updateBotState({
        paper_bankroll: newBankroll,
        peak_bankroll: Math.max(state.peak_bankroll ?? newBankroll, newBankroll),
      })
      state.paper_bankroll = newBankroll
    }

    decisions.push({
      market_ticker: pos.market_ticker,
      city: pos.city,
      market_date: pos.market_date,
      subtitle: pos.subtitle ?? '',
      edge_pct: pos.edge_pct_at_entry,
      fee_ev_pct: pos.fee_ev_at_entry,
      kalshi_prob: pos.kalshi_prob_at_entry,
      model_prob: pos.model_prob_at_entry,
      inter_model_spread: pos.inter_model_spread,
      signal_label: '',
      direction: pos.side === 'YES' ? 'BUY YES' : 'BUY NO',
      action,
      reason,
      fee_ev_ok: true,
      spread_ok: true,
      volume_ok: true,
      signal_strength_ok: true,
      daily_limit_ok: true,
      position_limit_ok: true,
      city_limit_ok: true,
      time_to_close_ok: true,
      bot_trade_id: pos.id,
    })
  }

  return decisions
}

export async function executePaperBuy(
  edge: EdgeResult,
  sizing: SizingResult,
  state: BotState,
  cycleId: string,
): Promise<string | null> {
  if (sizing.contracts <= 0) return null
  const sb = getServerSupabase()

  const tradingFee = sizing.cost * 0.01
  const totalCost = sizing.cost + tradingFee

  const { data: trade, error } = await sb
    .from('bot_trades')
    .insert({
      market_ticker: edge.ticker,
      series: edge.series,
      city: edge.city,
      market_date: edge.dateIso,
      market_type: edge.isHighMarket ? 'high' : 'low',
      subtitle: edge.subtitle,
      strike_type: edge.strikeType,
      floor_strike: edge.floorStrike,
      cap_strike: edge.capStrike,
      side: edge.direction === 'BUY YES' ? 'YES' : 'NO',
      contracts: sizing.contracts,
      entry_price_cents: sizing.entryPriceCents,
      cost: sizing.cost,
      trading_fee: tradingFee,
      edge_pct_at_entry: edge.edgePct,
      fee_ev_at_entry: edge.feeAdjustedEvPct,
      kalshi_prob_at_entry: edge.kalshiProb,
      model_prob_at_entry: edge.nwsProb,
      model_consensus_temp: edge.modelConsensus,
      inter_model_spread: edge.interModelSpread,
      model_count: edge.modelCount,
      std_dev_used: edge.stdDevUsed,
      forecast_source: edge.forecastSource,
      top_models: edge.topModels,
      kelly_pct: edge.kellyPct,
      kelly_dollars: edge.betDollars,
      close_time: edge.closeTime,
      status: 'open',
      paper_bankroll_before: state.paper_bankroll,
      paper_bankroll_after: state.paper_bankroll - totalCost,
      bot_version: 'v1',
      cycle_id: cycleId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[bot] insert bot_trade failed:', error)
    return null
  }

  await updateBotState({
    paper_bankroll: state.paper_bankroll - totalCost,
    daily_spend_today: state.daily_spend_today + sizing.cost,
    total_trades: (state.total_trades ?? 0) + 1,
  })

  return trade?.id ?? null
}
