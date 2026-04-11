import { NextResponse } from 'next/server'
import { getBotState, updateBotState, type BotState } from '@/lib/bot'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const state = await getBotState()
  if (!state) return NextResponse.json({ error: 'state not found' }, { status: 404 })
  return NextResponse.json({ state })
}

const ALLOWED_KEYS: (keyof BotState)[] = [
  'enabled',
  'min_fee_ev_pct',
  'max_inter_model_spread',
  'min_edge_pct',
  'min_volume',
  'max_daily_spend',
  'max_open_positions',
  'max_positions_per_city',
  'max_trade_dollars',
  'kelly_fraction',
  'profit_take_multiple',
  'stop_loss_pct',
  'min_hours_to_close',
]

export async function PATCH(req: Request) {
  const body = await req.json()
  const updates: Partial<BotState> = {}
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) (updates as any)[key] = body[key]
  }
  // Never let the API turn off paper_only
  await updateBotState(updates)
  const state = await getBotState()
  return NextResponse.json({ state })
}
