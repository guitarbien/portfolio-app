import type { Price } from '../domain/types'
import type { QuoteResult } from './twse'

export async function fetchTwelveClose(symbol: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<QuoteResult<Price>> {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=1&apikey=${encodeURIComponent(apiKey)}`
    const res = await fetchFn(url)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = (await res.json()) as { status?: string; message?: string; values?: { datetime: string; close: string }[] }
    if (body.status === 'error') return { ok: false, reason: body.message ?? 'API 錯誤' }
    const last = body.values?.[0]
    if (!last) return { ok: false, reason: '回應缺少 values' }
    const close = Number(last.close)
    if (!Number.isFinite(close)) return { ok: false, reason: `收盤價無法解析：${last.close}` }
    return { ok: true, value: { symbol, date: last.datetime, close, source: 'auto' } }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
