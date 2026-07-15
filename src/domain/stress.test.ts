import { describe, it, expect } from 'vitest'
import { stressTest } from './stress'
import type { Instrument, Loan, PriceMap } from './types'

const inst = (symbol: string, leverageFactor = 1): Instrument => ({
  symbol, name: symbol, market: 'TW', currency: 'TWD', leverageFactor,
})
const instruments = new Map<string, Instrument>([
  ['0050', inst('0050')],
  ['00631L', inst('00631L', 2)],
])
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
const mortgage = (over: Partial<Loan> = {}): Loan => ({
  name: '理財型房貸', kind: 'mortgage', balance: 500_000, rate: 0.028,
  maintenanceThreshold: 0, restoreThreshold: 0,
  includeInterestInDenominator: false, creditLimit: 2_000_000, collateral: [], ...over,
})
const run = (drop: number, loans: Loan[], cashTwd = 0) =>
  stressTest({ drop, loans, instruments, prices, cashTwd })

describe('stressTest', () => {
  it('β=1：壓後維持率＝壓後擔保市值÷餘額', () => {
    const r = run(0.3, [pledge()])
    expect(r.loans[0].stressedRatio).toBeCloseTo(70_000 / 60_000 * 100, 4) // 116.67 < 130
  })

  it('觸追繳跌幅 X*＝(V−T·B)÷Σ(市值×β)（spec §6.5 反解）', () => {
    const r = run(0, [pledge()])
    // (100000 − 1.30×60000) ÷ 100000 = 0.22
    expect(r.loans[0].marginCallDrop).toBeCloseTo(0.22, 6)
  })

  it('正2 擔保品 β=2：X* 減半效果', () => {
    const loan = pledge({ collateral: [{ symbol: '00631L', qty: 2500 }] }) // 市值 100,000
    const r = run(0, [loan])
    // (100000 − 78000) ÷ (100000×2) = 0.11
    expect(r.loans[0].marginCallDrop).toBeCloseTo(0.11, 6)
  })

  it('觸追繳時計算兩口徑補繳金額', () => {
    const r = run(0.3, [pledge()])
    expect(r.loans[0].topUpCollateral).toBeCloseTo(1.66 * 60_000 - 70_000, 4) // 29,600
    expect(r.loans[0].topUpRepay).toBeCloseTo(60_000 - 70_000 / 1.66, 4) // 17,831.33
  })

  it('未觸追繳時不產生補繳金額', () => {
    const r = run(0.1, [pledge()])
    expect(r.loans[0].topUpCollateral).toBeUndefined()
    expect(r.loans[0].topUpRepay).toBeUndefined()
  })

  it('現在已低於門檻 → marginCallDrop = 0', () => {
    const r = run(0, [pledge({ balance: 90_000 })]) // 現在 111% < 130%
    expect(r.loans[0].marginCallDrop).toBe(0)
  })

  it('β·X > 1 時擔保市值 clamp 至 0，不出現負市值', () => {
    const loan = pledge({ collateral: [{ symbol: '00631L', qty: 2500 }] })
    const r = run(0.6, [loan]) // 1 − 2×0.6 = −0.2 → clamp 0
    expect(r.loans[0].stressedRatio).toBe(0)
  })

  it('mortgage 不列入質押結果，未動用額度計入補繳子彈', () => {
    const r = run(0.3, [pledge(), mortgage()], 100_000)
    expect(r.loans).toHaveLength(1)
    expect(r.bullets).toBe(1_500_000 + 100_000)
  })

  it('shortfall＝max(0, 總補繳（補擔保口徑）−子彈)', () => {
    const r = run(0.3, [pledge()], 10_000)
    expect(r.totalTopUp).toBeCloseTo(29_600, 4)
    expect(r.shortfall).toBeCloseTo(19_600, 4)
    expect(run(0.3, [pledge()], 50_000).shortfall).toBe(0)
  })

  it('多筆質押依 marginCallDrop 升冪排序（誰先斷頭排前面）', () => {
    const safe = pledge({ id: 1, name: '安全', balance: 30_000 })
    const risky = pledge({ id: 2, name: '危險', balance: 70_000 })
    const r = run(0, [safe, risky])
    expect(r.loans.map((l) => l.id)).toEqual([2, 1])
    expect(r.loans.map((l) => l.name)).toEqual(['危險', '安全'])
    expect(r.loans[0].id).toBe(2) // id 透傳到結果物件
  })

  it('擔保品缺報價：該筆 stressedRatio/marginCallDrop undefined 並列 missing', () => {
    const loan = pledge({ collateral: [{ symbol: '2330', qty: 100 }] })
    const r = run(0.3, [loan])
    expect(r.loans[0].stressedRatio).toBeUndefined()
    expect(r.loans[0].missing).toEqual(['2330'])
  })

  it('balance=0（有擔保品有報價）→ 只有 name/missing，無 stressedRatio/marginCallDrop/topUp*', () => {
    const r = run(0.3, [pledge({ balance: 0 })])
    expect(r.loans[0].stressedRatio).toBeUndefined()
    expect(r.loans[0].marginCallDrop).toBeUndefined()
    expect(r.loans[0].topUpCollateral).toBeUndefined()
    expect(r.loans[0].topUpRepay).toBeUndefined()
    expect(r.loans[0].missing).toEqual([])
  })

  it('leverageFactor=0 的擔保品：marginCallDrop undefined，stressedRatio 正常計算', () => {
    const zeroInst = new Map<string, Instrument>([['ZERO', inst('ZERO', 0)]])
    const zeroPrices: PriceMap = new Map([['ZERO', { close: 100, date: '2026-07-14' }]])
    const loan = pledge({ collateral: [{ symbol: 'ZERO', qty: 1000 }] })
    const r = stressTest({ drop: 0.3, loans: [loan], instruments: zeroInst, prices: zeroPrices, cashTwd: 0 })
    expect(r.loans[0].marginCallDrop).toBeUndefined()
    expect(r.loans[0].stressedRatio).toBeCloseTo(100_000 / 60_000 * 100, 4)
  })

  it('mortgage 無 creditLimit → 不增加補繳子彈（?? 0 分支）', () => {
    const r = run(0, [mortgage({ creditLimit: undefined })], 50_000)
    expect(r.bullets).toBe(50_000)
  })

  it('排序：缺報價者（marginCallDrop undefined）排最後（?? Infinity 分支）', () => {
    const normal = pledge({ id: 1, name: '正常' })
    const noQuote = pledge({ id: 2, name: '缺價', collateral: [{ symbol: '2330', qty: 100 }] })
    const r = run(0, [noQuote, normal]) // 輸入順序：缺價在前
    expect(r.loans.map((l) => l.id)).toEqual([1, 2]) // 排序後：正常在前
  })
})
