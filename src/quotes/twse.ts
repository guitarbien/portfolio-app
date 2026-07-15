import type { Price } from '../domain/types'

export type QuoteResult<T> = { ok: true; value: T } | { ok: false; reason: string }

const DATE_ROW = /^\d+\/\d+\/\d+$/

export function rocToIso(roc: string): string {
  const [y, m, d] = roc.split('/')
  return `${Number(y) + 1911}-${m}-${d}`
}

export async function fetchTwseClose(symbol: string, fetchFn: typeof fetch = fetch): Promise<QuoteResult<Price>> {
  try {
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_AVG?stockNo=${encodeURIComponent(symbol)}&response=json`
    const res = await fetchFn(url)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = (await res.json()) as { stat?: string; data?: string[][] }
    if (body.stat !== 'OK' || !body.data) return { ok: false, reason: body.stat ?? '回應格式異常' }
    const rows = body.data.filter((row) => DATE_ROW.test(row[0]))
    const last = rows[rows.length - 1]
    if (!last) return { ok: false, reason: '無日期資料列' }
    const close = Number(last[1].replaceAll(',', ''))
    if (!Number.isFinite(close)) return { ok: false, reason: `收盤價無法解析：${last[1]}` }
    return { ok: true, value: { symbol, date: rocToIso(last[0]), close, source: 'auto' } }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
