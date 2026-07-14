import { describe, it, expect } from 'vitest'
import { valuate } from './valuation'
import type { Instrument, Loan, PriceMap } from './types'

const inst = (symbol: string, over: Partial<Instrument> = {}): Instrument => ({
  symbol, name: symbol, market: 'TW', currency: 'TWD', leverageFactor: 1, ...over,
})

const instruments = new Map<string, Instrument>([
  ['0050', inst('0050')],
  ['00631L', inst('00631L', { leverageFactor: 2 })],
  ['VOO', inst('VOO', { market: 'US', currency: 'USD' })],
])

const prices: PriceMap = new Map([
  ['0050', { close: 100, date: '2026-07-14' }],
  ['00631L', { close: 40, date: '2026-07-14' }],
  ['VOO', { close: 500, date: '2026-07-14' }],
])

const loan = (over: Partial<Loan> = {}): Loan => ({
  name: '質押A', kind: 'pledge', balance: 0, rate: 0.04,
  maintenanceThreshold: 130, restoreThreshold: 166,
  includeInterestInDenominator: false, collateral: [], ...over,
})

const base = { instruments, prices, cash: [], loans: [] as Loan[] }

describe('valuate', () => {
  it('一般持股：NAV＝市值＋現金，曝險＝市值（現金不計曝險）', () => {
    const v = valuate({ ...base, positions: [{ symbol: '0050', qty: 1000 }],
      cash: [{ currency: 'TWD', amount: 50_000 }] })
    expect(v.nav).toBe(150_000)
    expect(v.exposure).toBe(100_000)
    expect(v.leverageRatio).toBeCloseTo(100_000 / 150_000, 6)
    expect(v.missing).toEqual([])
  })

  it('槓桿 ETF 曝險＝市值×倍數', () => {
    const v = valuate({ ...base, positions: [{ symbol: '00631L', qty: 1000 }] })
    expect(v.nav).toBe(40_000)
    expect(v.exposure).toBe(80_000)
  })

  it('美股以 usdTwd 換算市值與現金', () => {
    const v = valuate({ ...base, positions: [{ symbol: 'VOO', qty: 10 }], usdTwd: 32,
      cash: [{ currency: 'USD', amount: 1000 }] })
    expect(v.nav).toBe(10 * 500 * 32 + 32_000)
    expect(v.exposure).toBe(160_000)
  })

  it('缺 usdTwd：美股部位與美元現金列入 missing、不計入 NAV', () => {
    const v = valuate({ ...base, positions: [{ symbol: 'VOO', qty: 10 }],
      cash: [{ currency: 'USD', amount: 1000 }] })
    expect(v.nav).toBe(0)
    expect(v.missing).toEqual(['USDTWD'])
  })

  it('缺報價：該檔列入 missing、不噴錯', () => {
    const v = valuate({ ...base, positions: [{ symbol: '2330', qty: 1000 }] })
    expect(v.nav).toBe(0)
    expect(v.missing).toEqual(['2330'])
  })

  it('借款使 NAV 下降但曝險不變', () => {
    const v = valuate({ ...base, positions: [{ symbol: '0050', qty: 1000 }],
      loans: [loan({ balance: 60_000 })] })
    expect(v.nav).toBe(40_000)
    expect(v.exposure).toBe(100_000)
  })

  it('NAV ≤ 0 時 leverageRatio 未定義（spec §6.3）', () => {
    const v = valuate({ ...base, positions: [{ symbol: '0050', qty: 1000 }],
      loans: [loan({ balance: 120_000 })] })
    expect(v.nav).toBe(-20_000)
    expect(v.leverageRatio).toBeUndefined()
  })
})
