import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { repo } from '../data/repo'
import { refreshQuotes } from './refresh'
import type { QuoteResult } from './twse'
import type { FxRate, Price } from '../domain/types'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
  await repo.putInstrument({ symbol: 'VOO', name: 'VOO', market: 'US', currency: 'USD', leverageFactor: 1 })
})

const NOW = '2026-07-14'
const priceOk = (symbol: string): QuoteResult<Price> => ({
  ok: true, value: { symbol, date: NOW, close: 100, source: 'auto' },
})
const fxOk: QuoteResult<FxRate> = {
  ok: true, value: { pair: 'USDTWD', date: NOW, rate: 32, source: 'auto' },
}
import type { RefreshDeps } from './refresh'

const deps = (over: Partial<RefreshDeps> = {}): RefreshDeps => ({
  fetchTwse: async (s: string) => priceOk(s),
  fetchFx: async () => fxOk,
  fetchUs: async (s: string) => priceOk(s),
  getUsKey: () => 'test-key',
  now: () => NOW,
  ...over,
})

describe('refreshQuotes', () => {
  it('TW 與 US 都更新，成功寫入 Price 與 FxRate', async () => {
    const report = await refreshQuotes(deps())
    expect(report.updated.sort()).toEqual(['0050', 'USDTWD', 'VOO'])
    expect((await repo.latestEffectivePrices()).get('0050')!.close).toBe(100)
    expect((await repo.latestUsdTwd())!.rate).toBe(32)
  })

  it('當日已有價則跳過不抓（skipped）', async () => {
    await repo.upsertPrice({ symbol: '0050', date: NOW, close: 99, source: 'auto' })
    await repo.upsertPrice({ symbol: 'VOO', date: NOW, close: 500, source: 'auto' })
    await repo.upsertFx({ pair: 'USDTWD', date: NOW, rate: 31.9, source: 'auto' })
    let called = 0
    const report = await refreshQuotes(deps({
      fetchTwse: async (s: string) => { called++; return priceOk(s) },
    }))
    expect(called).toBe(0)
    expect(report.skipped.sort()).toEqual(['0050', 'USDTWD', 'VOO'])
  })

  it('單檔失敗記入 failed，不影響其他檔', async () => {
    await repo.putInstrument({ symbol: '2330', name: '台積電', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    const report = await refreshQuotes(deps({
      fetchTwse: async (s: string): Promise<QuoteResult<Price>> =>
        s === '2330' ? { ok: false, reason: 'HTTP 500' } : priceOk(s),
    }))
    expect(report.updated).toContain('0050')
    expect(report.failed).toEqual([{ symbol: '2330', reason: 'HTTP 500' }])
  })

  it('fetchFx 失敗記入 failed，USDTWD 不進 updated', async () => {
    const report = await refreshQuotes(deps({
      fetchFx: async () => ({ ok: false, reason: 'HTTP 500' }),
    }))
    expect(report.failed).toContainEqual({ symbol: 'USDTWD', reason: 'HTTP 500' })
    expect(report.updated).not.toContain('USDTWD')
  })

  it('無 API key → US 全記 failed 且不呼叫 fetchUs', async () => {
    let called = 0
    const report = await refreshQuotes(deps({
      getUsKey: () => null,
      fetchUs: async (s: string) => { called++; return priceOk(s) },
    }))
    expect(called).toBe(0)
    expect(report.failed).toContainEqual({ symbol: 'VOO', reason: '未設定 Twelve Data API key' })
    expect(report.updated).toContain('0050')
  })

  it('無 API key 但美股當日已有價 → skipped 不記 failed 且不呼叫 fetchUs', async () => {
    await repo.upsertPrice({ symbol: 'VOO', date: NOW, close: 500, source: 'manual' })
    let called = 0
    const report = await refreshQuotes(deps({
      getUsKey: () => null,
      fetchUs: async (s: string) => { called++; return priceOk(s) },
    }))
    expect(called).toBe(0)
    expect(report.skipped).toContain('VOO')
    expect(report.failed.map((f) => f.symbol)).not.toContain('VOO')
  })

  it('US 單檔失敗不影響 TW', async () => {
    const report = await refreshQuotes(deps({
      fetchUs: async () => ({ ok: false as const, reason: 'HTTP 429' }),
    }))
    expect(report.failed).toContainEqual({ symbol: 'VOO', reason: 'HTTP 429' })
    expect(report.updated).toContain('0050')
  })
})
