import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import {
  getBotState, checkDailyReset, getOpenPositions,
  checkExits, evaluateEntry, sizePaperTrade, executePaperBuy,
  updateBotState, type BotTrade,
} from '@/lib/bot'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function runCycle(req: Request) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? 'dev'
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
    const entryDecisions: any[] = []
    const newTrades: string[] = []

    for (const edge of edges) {
      if (freshOpen.some((p) => p.market_ticker === edge.ticker)) continue

      const decision = evaluateEntry(edge, state, freshOpen)
      entryDecisions.push(decision)

      if (decision.action === 'BUY') {
        const sizing = sizePaperTrade(edge, state)
        const tradeId = await executePaperBuy(edge, sizing, state, cycleId)
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
