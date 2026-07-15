import { describe, it, expect } from 'vitest'
import { currentHoldings } from './holdings'
import type { SnapshotPosition, Transaction } from './types'

const snap = (accountId: number, symbol: string, qty: number): SnapshotPosition =>
  ({ date: '2026-07-15', accountId, symbol, qty })
const tx = (accountId: number, symbol: string, qty: number): Transaction =>
  ({ accountId, date: '2026-07-16', symbol, qty, price: 100, fee: 0, tax: 0 })

describe('currentHoldings', () => {
  it('僅快照', () => {
    expect(currentHoldings([snap(1, '0050', 1000)], [])).toEqual([{ accountId: 1, symbol: '0050', qty: 1000 }])
  })
  it('快照＋買進加總、賣出減少', () => {
    expect(currentHoldings([snap(1, '0050', 1000)], [tx(1, '0050', 500), tx(1, '0050', -200)]))
      .toEqual([{ accountId: 1, symbol: '0050', qty: 1300 }])
  })
  it('賣到 0 → 從清單消失', () => {
    expect(currentHoldings([snap(1, '0050', 100)], [tx(1, '0050', -100)])).toEqual([])
  })
  it('快照後才買進的新標的出現', () => {
    expect(currentHoldings([], [tx(1, '2330', 100)])).toEqual([{ accountId: 1, symbol: '2330', qty: 100 }])
  })
  it('跨帳戶隔離、輸出依 symbol 排序', () => {
    expect(currentHoldings([snap(2, '2330', 50), snap(1, '0050', 10)], [tx(1, '2330', 5)])).toEqual([
      { accountId: 1, symbol: '0050', qty: 10 },
      { accountId: 1, symbol: '2330', qty: 5 },
      { accountId: 2, symbol: '2330', qty: 50 },
    ])
  })
})
