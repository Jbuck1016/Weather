import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { parseTicker } from '@/lib/edge'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function computeResult(
  ticker: string,
  side: 'YES' | 'NO',
  actualTemp: number,
  title: string,
): 'WIN' | 'LOSS' {
  const info = parseTicker(ticker)
  if (!info) return 'LOSS'
  let yesWins = false
  if (info.type === 'bracket') {
    yesWins = actualTemp >= info.low! && actualTemp <= info.high!
  } else {
    const tl = (title || '').toLowerCase()
    if (tl.includes('<') || tl.includes('below')) {
      yesWins = actualTemp < info.value!
    } else {
      yesWins = actualTemp >= info.value!
    }
  }
  const won = side === 'YES' ? yesWins : !yesWins
  return won ? 'WIN' : 'LOSS'
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const sb = getServerSupabase()
  const body = await req.json()

  const { data: existing, error: fetchErr } = await sb
    .from('positions')
    .select('*')
    .eq('id', params.id)
    .single()
  if (fetchErr || !existing) {
    return NextResponse.json({ error: fetchErr?.message ?? 'not found' }, { status: 404 })
  }

  const update: Record<string, any> = {}

  if (body.settlement_temp !== undefined) {
    const actualTemp = parseFloat(body.settlement_temp)
    const result = computeResult(
      existing.market_ticker,
      existing.side,
      actualTemp,
      existing.subtitle ?? '',
    )
    const entryCost = (existing.actual_cost ?? (existing.contracts * existing.entry_price_cents) / 100)
    const pnl = result === 'WIN'
      ? Math.round((existing.contracts * (1 - existing.entry_price_cents / 100)) * 100) / 100
      : -entryCost
    update.settlement_temp = actualTemp
    update.settlement_result = result
    update.pnl = pnl
    update.status = 'settled'
  }

  if (body.status !== undefined) update.status = body.status

  const { data, error } = await sb
    .from('positions')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ position: data })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const sb = getServerSupabase()
  const { error } = await sb.from('positions').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
