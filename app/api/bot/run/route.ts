import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  getBotState, checkDailyReset, getOpenPositions,
  checkExits, evaluateEntry, sizePaperTrade, executePaperBuy,
  updateBotState, type BotTrade,
} from '@/lib/bot'
import { getServerSupabase } from '@/lib/supabase'
import { sendWeeklyDigest } from '@/lib/twilio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function runCycle(req: Request) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET ?? 'dev').trim()
  if (authHeader !== `Bearer ${cronSecret}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cycleId = uuidv4()
  const sb = getServerSupabase()
  const startTime = Date.now()

  try {
    let state = await getBotState()
    if (!state) return NextResponse.json({ error: 'Bot state not found' }, { status: 500 })
    if (!state.enabled) return NextResponse.json({ skipped: true, reason: 'Bot is disabled' })

    state = await checkDailyReset(state)

    const openPositions = await getOpenPositions()
    const exitDecisions = await checkExits(openPositions, state)

    state = (await getBotState()) ?? state

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const edgesRes = await fetch(`${baseUrl}/api/edges?bankroll=${state.paper_bankroll}`, {
      headers: { 'x-bot-internal': 'true' },
      cache: 'no-store',
    })
    const edgesData = await edgesRes.json()
    const edges = edgesData.edges ?? []

    const freshOpen: BotTrade[] = await getOpenPositions()

    // Snapshot open positions — record edge decay over time.
    // Look up latest edge_signals row per position rather than relying on
    // the current /api/edges result (which filters PAST markets and may drop
    // tickers the bot already holds).
    const snapshotRows: any[] = []
    for (const pos of freshOpen) {
      const { data: latestSignal } = await sb
        .from('edge_signals')
        .select('*')
        .eq('market_ticker', pos.market_ticker)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!latestSignal) {
        console.warn('[bot] no edge_signal found for open position:', pos.market_ticker)
        continue
      }

      const hoursSinceEntry = pos.created_at
        ? Math.round((Date.now() - new Date(pos.created_at).getTime()) / 360000) / 10
        : null

      snapshotRows.push({
        bot_trade_id: pos.id,
        market_ticker: pos.market_ticker,
        city: pos.city,
        hours_since_entry: hoursSinceEntry,
        hours_to_close: null,
        yes_bid_cents: latestSignal.yes_bid_cents,
        yes_ask_cents: latestSignal.yes_ask_cents,
        kalshi_prob: latestSignal.kalshi_prob,
        nws_prob: latestSignal.nws_prob,
        edge_pct: latestSignal.edge_pct,
        fee_adjusted_ev_pct: latestSignal.fee_adjusted_ev_pct,
        inter_model_spread: latestSignal.std_dev_used,
        forecast_temp: latestSignal.forecast_temp,
        volume: latestSignal.volume ?? 0,
      })
    }
    if (snapshotRows.length > 0) {
      const { error: snapErr } = await sb.from('position_snapshots').insert(snapshotRows)
      if (snapErr) console.error('[bot] snapshot insert failed:', snapErr)
      else console.log(`[bot] snapshotted ${snapshotRows.length} open positions`)
    }

    const entryDecisions: any[] = []
    const newTrades: string[] = []

    for (const edge of edges) {
      if (freshOpen.some((p) => p.market_ticker === edge.ticker)) continue

      const decision = evaluateEntry(edge, state, freshOpen)
      entryDecisions.push(decision)

      if (decision.action === 'BUY') {
        const sizing = sizePaperTrade(edge, state)
        if (!sizing || sizing.contracts <= 0 || sizing.cost <= 0) {
          console.warn('[bot] sizing returned zero for', edge.ticker, JSON.stringify(sizing))
          continue
        }
        console.log('[bot] attempting BUY:', edge.ticker, 'sizing:', JSON.stringify(sizing))
        const tradeId = await executePaperBuy(edge, sizing, state, cycleId)
        console.log('[bot] executePaperBuy result:', tradeId ?? 'NULL — insert failed')
        if (tradeId) {
          decision.bot_trade_id = tradeId
          newTrades.push(tradeId)
          state.daily_spend_today += sizing.cost
          state.paper_bankroll -= sizing.cost * 1.01
          freshOpen.push({
            id: tradeId,
            city: edge.city,
            market_ticker: edge.ticker,
          } as BotTrade)
        }
      }
    }

    const allDecisions = [...exitDecisions, ...entryDecisions]
    if (allDecisions.length > 0) {
      const { error: insErr } = await sb.from('bot_decisions').insert(
        allDecisions.map((d) => ({ ...d, cycle_id: cycleId })),
      )
      if (insErr) console.error('[bot] decisions insert failed:', insErr)
    }

    const currentState = (await getBotState()) ?? state
    const openValue = freshOpen.reduce((s, p) => s + (p.cost ?? 0), 0)

    await sb.from('bot_equity').insert({
      cycle_id: cycleId,
      paper_bankroll: currentState.paper_bankroll,
      open_positions_value: openValue,
      total_equity: currentState.paper_bankroll + openValue,
      open_trades: freshOpen.length,
      total_pnl: currentState.paper_bankroll - (currentState.initial_bankroll ?? 500),
    })

    await updateBotState({
      last_run_at: new Date().toISOString(),
      last_cycle_id: cycleId,
      last_run_status: 'success',
      last_run_signals_evaluated: edges.length,
      last_run_trades_placed: newTrades.length,
    })

    // Weekly WhatsApp digest — Sundays at 9am Pacific
    const nowPacific = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
    )
    if (nowPacific.getDay() === 0 && nowPacific.getHours() === 9) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { data: weekTrades } = await sb
        .from('trade_analysis')
        .select('*')
        .gte('created_at', sevenDaysAgo)

      if (weekTrades && weekTrades.length > 0) {
        const wins = weekTrades.filter((t) => t.settlement_result === 'WIN').length
        const losses = weekTrades.filter((t) => t.settlement_result === 'LOSS').length
        const netPnl = weekTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0)
        const avgEdge =
          weekTrades.reduce((s, t) => s + Math.abs(t.edge_at_entry ?? 0), 0) / weekTrades.length
        const avgErr =
          weekTrades.reduce((s, t) => s + (t.forecast_error_f ?? 0), 0) / weekTrades.length

        const cityPnl: Record<string, number> = {}
        weekTrades.forEach((t) => {
          cityPnl[t.city] = (cityPnl[t.city] ?? 0) + (t.net_pnl ?? 0)
        })
        const cities = Object.entries(cityPnl).sort((a, b) => b[1] - a[1])

        void sendWeeklyDigest({
          tradesPlaced: weekTrades.length,
          wins,
          losses,
          winRate: weekTrades.length > 0 ? wins / weekTrades.length : 0,
          avgEdgeAtEntry: avgEdge,
          avgForecastError: avgErr,
          netPnl,
          bestCity: cities[0]?.[0] ?? '—',
          worstCity: cities[cities.length - 1]?.[0] ?? '—',
          bankroll: currentState.paper_bankroll,
        })
      }
    }

    return NextResponse.json({
      cycleId,
      elapsed_ms: Date.now() - startTime,
      signals_evaluated: edges.length,
      exits_processed: exitDecisions.filter((d) => d.action !== 'HOLD' && d.action !== 'NEEDS_SETTLEMENT').length,
      new_trades: newTrades.length,
      skipped: entryDecisions.filter((d) => d.action === 'SKIP').length,
      current_bankroll: currentState.paper_bankroll,
    })
  } catch (e: any) {
    console.error('[bot] cycle failed:', e)
    await updateBotState({ last_run_status: `error: ${e.message ?? String(e)}` })
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return runCycle(req)
}

export async function GET(req: Request) {
  return runCycle(req)
}
