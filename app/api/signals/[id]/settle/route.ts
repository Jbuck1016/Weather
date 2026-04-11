import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { determineYesOutcome, rebuildCalibrationBuckets } from '@/lib/signalLogger'
import { settleModelForecasts } from '@/lib/modelForecasts'
import { getBotState, updateBotState } from '@/lib/bot'
import { CITIES } from '@/lib/cities'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sb = getServerSupabase()
  const body = await req.json()
  const settlementTemp = parseFloat(body.settlement_temp)
  if (!Number.isFinite(settlementTemp)) {
    return NextResponse.json({ error: 'invalid settlement_temp' }, { status: 400 })
  }

  const { data: signal, error: fetchErr } = await sb
    .from('edge_signals')
    .select('*')
    .eq('id', params.id)
    .single()
  if (fetchErr || !signal) {
    return NextResponse.json({ error: fetchErr?.message ?? 'not found' }, { status: 404 })
  }

  const yesOutcome = determineYesOutcome(
    signal.strike_type,
    signal.floor_strike,
    signal.cap_strike,
    settlementTemp,
  )

  const effectivePredicted =
    signal.direction === 'BUY YES' ? signal.predicted_prob : 1 - signal.predicted_prob
  const effectiveOutcome = signal.direction === 'BUY YES' ? yesOutcome : 1 - yesOutcome
  const brier = Math.pow(effectivePredicted - effectiveOutcome, 2)
  const result = effectiveOutcome === 1 ? 'WIN' : 'LOSS'

  // Settle this signal and any other unsettled signals for the same ticker
  await sb
    .from('edge_signals')
    .update({
      settled: true,
      settlement_temp: settlementTemp,
      settlement_result: result,
      settled_at: new Date().toISOString(),
      actual_outcome: yesOutcome,
      brier_score: brier,
    })
    .eq('market_ticker', signal.market_ticker)
    .eq('settled', false)

  // Cascade to positions table — settle any open position with the same ticker
  const { data: openPositions } = await sb
    .from('positions')
    .select('id, contracts, entry_price_cents, side, actual_cost')
    .eq('market_ticker', signal.market_ticker)
    .eq('status', 'open')

  if (openPositions && openPositions.length > 0) {
    for (const p of openPositions) {
      const posWins =
        p.side === 'YES' ? yesOutcome === 1 : yesOutcome === 0
      const entryCost = p.actual_cost ?? (p.contracts * p.entry_price_cents) / 100
      const pnl = posWins
        ? Math.round(p.contracts * (1 - p.entry_price_cents / 100) * 100) / 100
        : -entryCost
      await sb
        .from('positions')
        .update({
          status: 'settled',
          settlement_temp: settlementTemp,
          settlement_result: posWins ? 'WIN' : 'LOSS',
          pnl,
        })
        .eq('id', p.id)
    }
  }

  await rebuildCalibrationBuckets()

  // Cascade to model_forecasts: every model that projected this date+station gets graded
  const cityCfg = CITIES[signal.series]
  if (cityCfg) {
    await settleModelForecasts(cityCfg.wethrStation, signal.market_date, settlementTemp)
  }

  // Cascade to bot_trades: settle every paper trade for this ticker
  const { data: openBotTrades } = await sb
    .from('bot_trades')
    .select('id, contracts, entry_price_cents, side, cost, trading_fee')
    .eq('market_ticker', signal.market_ticker)
    .in('status', ['open', 'closed'])

  if (openBotTrades && openBotTrades.length > 0) {
    let totalSettlementProceeds = 0
    for (const t of openBotTrades) {
      const wins = t.side === 'YES' ? yesOutcome === 1 : yesOutcome === 0
      const grossProceeds = wins ? t.contracts * 1.0 : 0
      const grossPnl = grossProceeds - t.cost
      const settlementFee = wins ? grossPnl * 0.10 : 0
      const netPnl = Math.round((grossPnl - settlementFee) * 100) / 100

      await sb
        .from('bot_trades')
        .update({
          status: 'settled',
          settlement_temp: settlementTemp,
          settlement_result: wins ? 'WIN' : 'LOSS',
          gross_pnl: Math.round(grossPnl * 100) / 100,
          settlement_fee: Math.round(settlementFee * 100) / 100,
          net_pnl: netPnl,
          settled_at: new Date().toISOString(),
        })
        .eq('id', t.id)

      // Bankroll receives the settlement proceeds (cost was already deducted at entry)
      totalSettlementProceeds += grossProceeds - settlementFee
    }

    if (totalSettlementProceeds > 0) {
      const botState = await getBotState()
      if (botState) {
        const newBankroll = botState.paper_bankroll + totalSettlementProceeds
        await updateBotState({
          paper_bankroll: newBankroll,
          peak_bankroll: Math.max(botState.peak_bankroll ?? newBankroll, newBankroll),
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    settlement_temp: settlementTemp,
    yes_outcome: yesOutcome,
    result,
  })
}
