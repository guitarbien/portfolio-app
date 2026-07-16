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

  it('高倍數案例：[-1, +100000] 跨 2020 閏年（y=366/365），牛頓 21 步收斂至實際根 96902', () => {
    // 2020-01-01 → 2021-01-01 = 366 天（2020 閏年），y = 366/365 ≠ 1
    // 真實根 r = 100000^(365/366) - 1 ≈ 96902；牛頓 21 步以 |NPV|<1e-9 返回，未走 bisection 擴張
    expect(
      xirr([
        { date: '2020-01-01', amount: -1 },
        { date: '2021-01-01', amount: 100000 },
      ]),
    ).toBeCloseTo(96902, 0)
  })

  it('bisection 上界擴張（lines 42-44）：極短期高倍數使牛頓導數趨零跳出，hi 倍增超過 1e6 → undefined', () => {
    // [-1 投入, 次日 +1e8]；y≈1/365；真實根≈10^(8×365) >> 1e6
    // 牛頓第 7 步 r→~9.7e17 後 |d|<1e-12 跳出；bisection hi 從 10 連倍增 17 次到 1310720 > 1e6 → undefined
    // 覆蓋 xirr.ts 42-44 行（hi *= 2 與 if hi > 1e6 return undefined）
    expect(
      xirr([
        { date: '2020-01-01', amount: -1 },
        { date: '2020-01-02', amount: 1e8 },
      ]),
    ).toBeUndefined()
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
