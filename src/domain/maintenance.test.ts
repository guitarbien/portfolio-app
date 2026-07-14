import { describe, it, expect } from 'vitest'
import { accruedInterest, maintenanceRatio } from './maintenance'
import type { Loan, PriceMap } from './types'

const prices: PriceMap = new Map([
  ['0050', { close: 100, date: '2026-07-14' }],
  ['00631L', { close: 40, date: '2026-07-14' }],
])

const pledge = (over: Partial<Loan> = {}): Loan => ({
  name: '質押A', kind: 'pledge', balance: 60_000, rate: 0.04,
  maintenanceThreshold: 130, restoreThreshold: 166,
  includeInterestInDenominator: false,
  collateral: [{ symbol: '0050', qty: 1000 }], ...over,
})

describe('accruedInterest', () => {
  it('依日息累計：balance×rate÷365×天數', () => {
    const loan = pledge({ lastInterestSettleDate: '2026-04-05' }) // 至 7/14 共 100 天
    expect(accruedInterest(loan, '2026-07-14')).toBeCloseTo((60_000 * 0.04 * 100) / 365, 6)
  })

  it('未填 lastInterestSettleDate 視為 0（spec §6.4）', () => {
    expect(accruedInterest(pledge(), '2026-07-14')).toBe(0)
  })
})

describe('maintenanceRatio', () => {
  it('基本：擔保市值÷借款餘額×100', () => {
    const r = maintenanceRatio(pledge(), prices, '2026-07-14')
    expect(r.ratio).toBeCloseTo(100_000 / 60_000 * 100, 4) // 166.67%
    expect(r.missing).toEqual([])
  })

  it('分母含應收利息（元大證金口徑）', () => {
    const loan = pledge({ includeInterestInDenominator: true, lastInterestSettleDate: '2026-04-05' })
    const interest = (60_000 * 0.04 * 100) / 365
    const r = maintenanceRatio(loan, prices, '2026-07-14')
    expect(r.ratio).toBeCloseTo(100_000 / (60_000 + interest) * 100, 4)
  })

  it('多檔擔保品市值加總', () => {
    const loan = pledge({ collateral: [{ symbol: '0050', qty: 500 }, { symbol: '00631L', qty: 1000 }] })
    const r = maintenanceRatio(loan, prices, '2026-07-14')
    expect(r.ratio).toBeCloseTo((50_000 + 40_000) / 60_000 * 100, 4)
  })

  it('mortgage 無維持率', () => {
    const loan = pledge({ kind: 'mortgage', collateral: [] })
    expect(maintenanceRatio(loan, prices, '2026-07-14').ratio).toBeUndefined()
  })

  it('balance ≤ 0 無維持率（無債即無追繳）', () => {
    expect(maintenanceRatio(pledge({ balance: 0 }), prices, '2026-07-14').ratio).toBeUndefined()
  })

  it('擔保品缺報價：ratio undefined 並列出 missing，不以錯誤數字充數（spec §10）', () => {
    const loan = pledge({ collateral: [{ symbol: '0050', qty: 500 }, { symbol: '2330', qty: 100 }] })
    const r = maintenanceRatio(loan, prices, '2026-07-14')
    expect(r.ratio).toBeUndefined()
    expect(r.missing).toEqual(['2330'])
  })
})
