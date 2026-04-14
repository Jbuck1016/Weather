export async function sendWhatsApp(body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const to = process.env.TWILIO_WHATSAPP_TO
  if (!sid || !token || !from || !to) {
    console.warn('[twilio] skipping WhatsApp send — missing env vars')
    return
  }

  try {
    const form = new URLSearchParams({ From: from, To: to, Body: body })
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[twilio] send failed:', res.status, text)
    }
  } catch (e: any) {
    console.error('[twilio] send exception:', e?.message ?? String(e))
  }
}

export interface WeeklyDigestStats {
  tradesPlaced: number
  wins: number
  losses: number
  winRate: number
  avgEdgeAtEntry: number
  avgForecastError: number
  netPnl: number
  bestCity: string
  worstCity: string
  bankroll: number
}

export async function sendWeeklyDigest(stats: WeeklyDigestStats): Promise<void> {
  const msg = `📊 WeatherEdge Weekly Digest
Trades: ${stats.tradesPlaced} (${stats.wins}W / ${stats.losses}L)
Win Rate: ${(stats.winRate * 100).toFixed(0)}%
Avg Edge at Entry: ${stats.avgEdgeAtEntry.toFixed(1)}%
Avg Forecast Error: ${stats.avgForecastError > 0 ? '+' : ''}${stats.avgForecastError.toFixed(1)}°F
Net P&L: ${stats.netPnl >= 0 ? '+' : ''}$${stats.netPnl.toFixed(2)}
Best City: ${stats.bestCity}
Worst City: ${stats.worstCity}
Bankroll: $${stats.bankroll.toFixed(2)}
Dashboard: https://weather-brown-pi.vercel.app/bot`
  await sendWhatsApp(msg)
}
