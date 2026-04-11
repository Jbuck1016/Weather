import { getServerSupabase } from './supabase'
import type { EdgeSignalInsert, EdgeSignalRow } from './types'

export async function logEdgeSignal(signal: EdgeSignalInsert): Promise<void> {
  try {
    const sb = getServerSupabase()
    const { data: existing } = await sb
      .from('edge_signals')
      .select('id')
      .eq('market_ticker', signal.market_ticker)
      .gt('captured_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1)
    if (existing && existing.length > 0) return
    await sb.from('edge_signals').insert(signal)
  } catch (e) {
    console.error('logEdgeSignal failed:', e)
  }
}

export function determineYesOutcome(
  strikeType: 'between' | 'greater' | 'less' | string,
  floorStrike: number | null,
  capStrike: number | null,
  settlementTemp: number,
): 0 | 1 {
  if (strikeType === 'between' && floorStrike !== null && capStrike !== null) {
    return settlementTemp >= floorStrike && settlementTemp <= capStrike ? 1 : 0
  }
  if (strikeType === 'greater' && floorStrike !== null) {
    return settlementTemp > floorStrike ? 1 : 0
  }
  if (strikeType === 'less' && capStrike !== null) {
    return settlementTemp < capStrike ? 1 : 0
  }
  return 0
}

export async function settleEdgeSignal(
  marketTicker: string,
  settlementTemp: number,
  yesOutcome: 0 | 1,
): Promise<void> {
  const sb = getServerSupabase()
  const { data: signals } = await sb
    .from('edge_signals')
    .select('id, predicted_prob, direction')
    .eq('market_ticker', marketTicker)
    .eq('settled', false)
  if (!signals?.length) return

  for (const s of signals as Pick<EdgeSignalRow, 'id' | 'predicted_prob' | 'direction'>[]) {
    const effectivePredicted = s.direction === 'BUY YES' ? s.predicted_prob : 1 - s.predicted_prob
    const effectiveOutcome = s.direction === 'BUY YES' ? yesOutcome : 1 - yesOutcome
    const brier = Math.pow(effectivePredicted - effectiveOutcome, 2)
    const result = effectiveOutcome === 1 ? 'WIN' : 'LOSS'
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
      .eq('id', s.id)
  }

  await rebuildCalibrationBuckets()
}

const BUCKETS = [
  { label: '0-10%',   min: 0.00, max: 0.10 },
  { label: '10-20%',  min: 0.10, max: 0.20 },
  { label: '20-30%',  min: 0.20, max: 0.30 },
  { label: '30-40%',  min: 0.30, max: 0.40 },
  { label: '40-50%',  min: 0.40, max: 0.50 },
  { label: '50-60%',  min: 0.50, max: 0.60 },
  { label: '60-70%',  min: 0.60, max: 0.70 },
  { label: '70-80%',  min: 0.70, max: 0.80 },
  { label: '80-90%',  min: 0.80, max: 0.90 },
  { label: '90-100%', min: 0.90, max: 1.00 },
] as const

export async function rebuildCalibrationBuckets(): Promise<void> {
  const sb = getServerSupabase()
  const { data: settled } = await sb
    .from('edge_signals')
    .select('nws_prob, actual_outcome, brier_score, direction')
    .eq('settled', true)
  if (!settled?.length) return

  for (const b of BUCKETS) {
    const inBucket = settled.filter((s: any) => {
      const p = s.direction === 'BUY YES' ? s.nws_prob : 1 - s.nws_prob
      return p >= b.min && p < (b.max === 1 ? 1.0001 : b.max)
    })
    const total = inBucket.length
    if (!total) continue

    const wins = inBucket.filter((s: any) =>
      s.direction === 'BUY YES' ? s.actual_outcome === 1 : s.actual_outcome === 0,
    ).length
    const avgPredicted =
      inBucket.reduce((sum: number, s: any) => {
        const p = s.direction === 'BUY YES' ? s.nws_prob : 1 - s.nws_prob
        return sum + p
      }, 0) / total
    const avgBrier =
      inBucket.reduce((sum: number, s: any) => sum + (s.brier_score ?? 0), 0) / total
    const actualWinRate = wins / total

    await sb
      .from('calibration_buckets')
      .upsert(
        {
          bucket_label: b.label,
          prob_min: b.min,
          prob_max: b.max,
          city: null,
          market_type: null,
          edge_label: null,
          total_signals: total,
          settled_signals: total,
          wins,
          losses: total - wins,
          actual_win_rate: actualWinRate,
          avg_predicted_prob: avgPredicted,
          avg_brier_score: avgBrier,
          calibration_error: Math.abs(actualWinRate - avgPredicted),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'bucket_label,city,market_type,edge_label' },
      )
  }
}
