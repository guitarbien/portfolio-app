import { describe, it, expect } from 'vitest'
import { xirr } from './xirr'

describe('xirr', () => {
  it('基本案例：投入 1000、365 天後值 1100 → 10%', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -1000 },
        { date: '2022-01-01', amount: 1100 },
      ]),
    ).toBeCloseTo(0.1, 6)
  })

  it('深度虧損（牛頓法跳出定義域 → bisection）：1000 剩 10、5 年 → −60.19%', () => {
    // 2020-01-01 → 2024-12-30 = 1825 天 = 5.0 年；(10/1000)^(1/5) − 1 = −0.601893
    expect(
      xirr([
        { date: '2020-01-01', amount: -1000 },
        { date: '2024-12-30', amount: 10 },
      ]),
    ).toBeCloseTo(-0.601893, 5)
  })

  it('多重根（10% 與 15% 皆為根）→ 取最靠近 0 者 10%', () => {
    expect(
      xirr([
        { date: '2020-01-01', amount: -1000 },
        { date: '2020-12-31', amount: 2250 },
        { date: '2021-12-31', amount: -1265 },
      ]),
    ).toBeCloseTo(0.1, 4)
  })

  it('全同號流量無根 → undefined', () => {
    expect(xirr([{ date: '2021-01-01', amount: 100 }, { date: '2022-01-01', amount: 200 }])).toBeUndefined()
  })

  it('空陣列與單筆 → undefined', () => {
    expect(xirr([])).toBeUndefined()
    expect(xirr([{ date: '2021-01-01', amount: -100 }])).toBeUndefined()
  })

  it('同日流量先加總：兩筆 −1000 同日＋一年後 +2200 → 10%', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -1000 },
        { date: '2021-01-01', amount: -1000 },
        { date: '2022-01-01', amount: 2200 },
      ]),
    ).toBeCloseTo(0.1, 6)
  })

  it('同日正負抵銷成全同號 → undefined', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -100 },
        { date: '2021-01-01', amount: 100 },
        { date: '2022-01-01', amount: 50 },
      ]),
    ).toBeUndefined()
  })
})
