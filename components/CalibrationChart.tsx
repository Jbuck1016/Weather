'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell, LabelList,
} from 'recharts'
import type { CalibrationBucket } from '@/lib/types'

interface Props {
  buckets: CalibrationBucket[]
  totalSettled: number
}

const ALL_BUCKETS = [
  { label: '0-10%',   midpoint: 5  },
  { label: '10-20%',  midpoint: 15 },
  { label: '20-30%',  midpoint: 25 },
  { label: '30-40%',  midpoint: 35 },
  { label: '40-50%',  midpoint: 45 },
  { label: '50-60%',  midpoint: 55 },
  { label: '60-70%',  midpoint: 65 },
  { label: '70-80%',  midpoint: 75 },
  { label: '80-90%',  midpoint: 85 },
  { label: '90-100%', midpoint: 95 },
]

export function CalibrationChart({ buckets, totalSettled }: Props) {
  const data = ALL_BUCKETS.map((b) => {
    const found = buckets.find((x) => x.bucket_label === b.label)
    return {
      label: b.label,
      midpoint: b.midpoint,
      actual: found ? Math.round(found.actual_win_rate * 100 * 10) / 10 : 0,
      predicted: found ? Math.round(found.avg_predicted_prob * 100 * 10) / 10 : b.midpoint,
      n: found?.settled_signals ?? 0,
      hasData: !!found,
    }
  })

  return (
    <div className="border border-border bg-bg2 rounded p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="heading text-base text-text">MODEL CALIBRATION — Is My Edge Real?</h2>
        <span className="label">{totalSettled} SETTLED</span>
      </div>
      <p className="label mb-4" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
        Bars above the diagonal = model is underconfident in that range (good).
        Below = overconfident.
      </p>

      {totalSettled < 10 ? (
        <div className="h-64 flex items-center justify-center label text-center">
          Collecting data — calibration chart will populate as markets settle.
          {totalSettled > 0 && ` (${totalSettled} settled so far, need ${10 - totalSettled} more)`}
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 10 }} />
              <YAxis
                stroke="var(--muted)"
                tick={{ fontSize: 10 }}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  fontSize: 11,
                }}
                formatter={(value: any, name: string) => {
                  if (name === 'actual') return [`${value}%`, 'Actual win rate']
                  return [value, name]
                }}
              />
              <ReferenceLine
                segment={[{ x: '0-10%', y: 5 }, { x: '90-100%', y: 95 }]}
                stroke="var(--accent)"
                strokeDasharray="4 4"
                label={{ value: 'Perfect', fill: 'var(--accent)', fontSize: 10, position: 'insideTopRight' }}
              />
              <Bar dataKey="actual" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => {
                  let color = 'var(--border)'
                  if (d.hasData) {
                    color = d.actual >= d.predicted ? 'var(--green)' : 'var(--red)'
                  }
                  return <Cell key={i} fill={color} />
                })}
                <LabelList
                  dataKey="n"
                  position="insideTop"
                  fill="var(--bg)"
                  fontSize={10}
                  fontWeight={700}
                  formatter={(v: any) => (v > 0 ? `n=${v}` : '')}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
