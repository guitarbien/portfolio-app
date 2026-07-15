import { describe, it, expect } from 'vitest'
import { buildXirrInput } from './xirrInput'
import { xirr } from './xirr'
import type { CashFlow } from './types'

const cf = (over: Partial<CashFlow>): CashFlow => ({
  accountId: 1, date: '2021-01-01', amount: 1000, currency: 'TWD',
  kind: 'contribution', is_external: true, ...over,
})

describe('buildXirrInput', () => {
  it('投入（組合視角 +）反轉為口袋視角 −，期末 NAV 為 +', () => {
    const r = buildXirrInput([cf({ amount: 1000 })], 1100, '2022-01-01')
    expect(r.flows).toEqual([
      { date: '2021-01-01', amount: -1000 },
      { date: '2022-01-01', amount: 1100 },
    ])
    expect(r.skipped).toEqual([])
    expect(xirr(r.flows)).toBeCloseTo(0.1, 6) // 與引擎串起來驗證方向正確
  })

  it('股利匯出（組合視角 −）反轉為口袋視角 +', () => {
    const r = buildXirrInput([cf({ amount: -500, kind: 'dividend', date: '2021-06-01' })], 0, '2022-01-01')
    expect(r.flows[0]).toEqual({ date: '2021-06-01', amount: 500 })
  })

  it('is_external=false 的內部事件不進流量', () => {
    const r = buildXirrInput([cf({ is_external: false })], 100, '2022-01-01')
    expect(r.flows).toEqual([{ date: '2022-01-01', amount: 100 }])
  })

  it('外幣流量以 fx_rate 換算 TWD', () => {
    const r = buildXirrInput([cf({ amount: 100, currency: 'USD', fx_rate: 32 })], 3520, '2022-01-01')
    expect(r.flows[0]).toEqual({ date: '2021-01-01', amount: -3200 })
  })

  it('外幣流量缺 fx_rate → skipped 並附原因', () => {
    const r = buildXirrInput([cf({ amount: 100, currency: 'USD' })], 3520, '2022-01-01')
    expect(r.flows).toEqual([{ date: '2022-01-01', amount: 3520 }])
    expect(r.skipped).toEqual([{ date: '2021-01-01', reason: '外幣流量缺發生日匯率' }])
  })

  it('無外部流量時只剩期末 NAV（xirr 會回 undefined）', () => {
    const r = buildXirrInput([], 100, '2022-01-01')
    expect(r.flows).toHaveLength(1)
    expect(xirr(r.flows)).toBeUndefined()
  })
})
