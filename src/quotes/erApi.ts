import type { FxRate } from '../domain/types'
import type { QuoteResult } from './twse'

export async function fetchUsdTwd(fetchFn: typeof fetch = fetch): Promise<QuoteResult<FxRate>> {
  try {
    const res = await fetchFn('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = (await res.json()) as { time_last_update_utc?: string; rates?: Record<string, number> }
    const rate = body.rates?.TWD
    if (typeof rate !== 'number') return { ok: false, reason: '回應缺少 TWD 匯率' }
    const parsed = Date.parse(body.time_last_update_utc ?? '')
    if (Number.isNaN(parsed)) return { ok: false, reason: '更新時間無法解析' }
    const date = new Date(parsed).toISOString().slice(0, 10)
    return { ok: true, value: { pair: 'USDTWD', date, rate, source: 'auto' } }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
