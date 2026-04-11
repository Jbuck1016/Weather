import crypto from 'crypto'

const BASE = 'https://api.elections.kalshi.com/trade-api/v2'

function getPem(): string {
  const raw = process.env.KALSHI_PRIVATE_KEY_PEM
  if (!raw) throw new Error('KALSHI_PRIVATE_KEY_PEM is not set')
  return raw.replace(/\\n/g, '\n')
}

function signRequest(privateKeyPem: string, method: string, path: string, timestampMs: string): string {
  const msg = timestampMs + method.toUpperCase() + path
  const sign = crypto.createSign('SHA256')
  sign.update(msg)
  sign.end()
  return sign.sign(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64',
  )
}

function kalshiHeaders(method: string, pathNoQuery: string): Record<string, string> {
  const pem = getPem()
  const ts = Date.now().toString()
  return {
    'KALSHI-ACCESS-KEY': process.env.KALSHI_API_KEY_ID!,
    'KALSHI-ACCESS-TIMESTAMP': ts,
    'KALSHI-ACCESS-SIGNATURE': signRequest(pem, method, pathNoQuery, ts),
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

export async function kalshiGet<T = any>(endpoint: string): Promise<T> {
  const withBase = `/trade-api/v2${endpoint}`
  const pathNoQuery = withBase.split('?')[0]
  const headers = kalshiHeaders('GET', pathNoQuery)
  const res = await fetch(`${BASE}${endpoint}`, { headers, cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Kalshi ${res.status} ${endpoint}: ${body}`)
  }
  return res.json() as Promise<T>
}

export interface KalshiRawResponse {
  url: string
  signedPath: string
  status: number
  ok: boolean
  responseHeaders: Record<string, string>
  body: any
  rawBody: string
  sentHeaders: {
    'KALSHI-ACCESS-KEY': string
    'KALSHI-ACCESS-TIMESTAMP': string
    'KALSHI-ACCESS-SIGNATURE': string
    Accept: string
    'Content-Type': string
  }
  signedMessage: string
  pemFingerprint: {
    length: number
    startsWith: string
    endsWith: string
    hasNewlines: boolean
  }
}

export async function kalshiGetRaw(endpoint: string): Promise<KalshiRawResponse> {
  const withBase = `/trade-api/v2${endpoint}`
  const pathNoQuery = withBase.split('?')[0]
  const pem = getPem()
  const ts = Date.now().toString()
  const signedMessage = ts + 'GET' + pathNoQuery
  const signature = signRequest(pem, 'GET', pathNoQuery, ts)
  const headers: Record<string, string> = {
    'KALSHI-ACCESS-KEY': process.env.KALSHI_API_KEY_ID!,
    'KALSHI-ACCESS-TIMESTAMP': ts,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const url = `${BASE}${endpoint}`
  const res = await fetch(url, { headers, cache: 'no-store' })
  const rawBody = await res.text()
  let parsed: any
  try { parsed = JSON.parse(rawBody) } catch { parsed = null }

  const respHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => { respHeaders[k] = v })

  return {
    url,
    signedPath: pathNoQuery,
    status: res.status,
    ok: res.ok,
    responseHeaders: respHeaders,
    body: parsed,
    rawBody,
    sentHeaders: {
      'KALSHI-ACCESS-KEY': process.env.KALSHI_API_KEY_ID!,
      'KALSHI-ACCESS-TIMESTAMP': ts,
      'KALSHI-ACCESS-SIGNATURE': '[REDACTED — len=' + signature.length + ']',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    signedMessage,
    pemFingerprint: {
      length: pem.length,
      startsWith: pem.slice(0, 32),
      endsWith: pem.slice(-32),
      hasNewlines: pem.includes('\n'),
    },
  }
}

export async function kalshiPost<T = any>(endpoint: string, payload: any): Promise<T> {
  const withBase = `/trade-api/v2${endpoint}`
  const pathNoQuery = withBase.split('?')[0]
  const headers = kalshiHeaders('POST', pathNoQuery)
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Kalshi ${res.status} ${endpoint}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function kalshiGetAllPaginated<T = any>(
  endpoint: string,
  itemsKey: string,
  pageLimit = 200,
): Promise<T[]> {
  const sep = endpoint.includes('?') ? '&' : '?'
  let cursor: string | null = null
  const out: T[] = []
  for (let i = 0; i < 50; i++) {
    const url = cursor
      ? `${endpoint}${sep}limit=${pageLimit}&cursor=${encodeURIComponent(cursor)}`
      : `${endpoint}${sep}limit=${pageLimit}`
    const data: any = await kalshiGet(url)
    const items = data?.[itemsKey] ?? []
    out.push(...items)
    cursor = data?.cursor || null
    if (!cursor) break
  }
  return out
}
