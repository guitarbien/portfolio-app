import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { repo } from './repo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('repo 基本 CRUD', () => {
  it('account／instrument／position／loan 寫入後可讀回', async () => {
    const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 50_000 })
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.addPosition({ date: '2026-07-14', accountId, symbol: '0050', qty: 1000 })
    await repo.addLoan({
      name: '質押A', kind: 'pledge', balance: 60_000, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [{ symbol: '0050', qty: 1000 }],
    })
    expect(await repo.listAccounts()).toHaveLength(1)
    expect((await repo.listInstruments())[0].symbol).toBe('0050')
    expect((await repo.listPositions())[0].qty).toBe(1000)
    expect((await repo.listLoans())[0].collateral).toEqual([{ symbol: '0050', qty: 1000 }])
  })

  it('deletePosition／deleteLoan 移除資料', async () => {
    const pid = await repo.addPosition({ date: '2026-07-14', accountId: 1, symbol: '0050', qty: 1 })
    await repo.deletePosition(pid)
    expect(await repo.listPositions()).toHaveLength(0)
  })
})

describe('latestEffectivePrices', () => {
  it('每檔取最新日期的收盤價', async () => {
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-13', close: 99, source: 'auto' })
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 100, source: 'auto' })
    const map = await repo.latestEffectivePrices()
    expect(map.get('0050')).toEqual({ close: 100, date: '2026-07-14' })
  })

  it('同日 manual 優先於 auto（spec §7）', async () => {
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 100, source: 'auto' })
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 101, source: 'manual' })
    const map = await repo.latestEffectivePrices()
    expect(map.get('0050')!.close).toBe(101)
  })

  it('同 key 重複 upsert 覆蓋不重複', async () => {
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 100, source: 'auto' })
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 102, source: 'auto' })
    const map = await repo.latestEffectivePrices()
    expect(map.get('0050')!.close).toBe(102)
  })
})

describe('latestUsdTwd', () => {
  it('取最新日期匯率；無資料回 undefined', async () => {
    expect(await repo.latestUsdTwd()).toBeUndefined()
    await repo.upsertFx({ pair: 'USDTWD', date: '2026-07-13', rate: 31.9, source: 'auto' })
    await repo.upsertFx({ pair: 'USDTWD', date: '2026-07-14', rate: 32.2, source: 'auto' })
    expect((await repo.latestUsdTwd())!.rate).toBe(32.2)
  })
})

describe('cashFlows 與 transactions CRUD', () => {
  it('addCashFlows 批次寫入後可讀回、可刪除', async () => {
    await repo.addCashFlows([
      { accountId: 1, date: '2016-03-05', amount: 3000, currency: 'TWD', kind: 'contribution', is_external: true },
      { accountId: 1, date: '2016-04-05', amount: -500, currency: 'TWD', kind: 'dividend', is_external: true },
    ])
    const all = await repo.listCashFlows()
    expect(all).toHaveLength(2)
    await repo.deleteCashFlow(all[0].id!)
    expect(await repo.listCashFlows()).toHaveLength(1)
  })

  it('transaction CRUD', async () => {
    const id = await repo.addTransaction({ accountId: 1, date: '2026-07-15', symbol: '0050', qty: -100, price: 101, fee: 20, tax: 30 })
    expect((await repo.listTransactions())[0].qty).toBe(-100)
    await repo.deleteTransaction(id)
    expect(await repo.listTransactions()).toHaveLength(0)
  })
})

describe('updateAccount / updateLoan', () => {
  it('部分更新現金餘額與借款餘額', async () => {
    const aid = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.updateAccount(aid, { cashBalance: 99_000 })
    expect((await repo.listAccounts())[0].cashBalance).toBe(99_000)
    const lid = await repo.addLoan({
      name: '質押A', kind: 'pledge', balance: 60_000, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [],
    })
    await repo.updateLoan(lid, { balance: 50_000 })
    expect((await repo.listLoans())[0].balance).toBe(50_000)
  })
})

describe('addPosition 快照守衛', () => {
  it('同帳戶同標的重複建快照 → 拒絕', async () => {
    await repo.addPosition({ date: '2026-07-15', accountId: 1, symbol: '0050', qty: 1000 })
    await expect(
      repo.addPosition({ date: '2026-07-16', accountId: 1, symbol: '0050', qty: 500 }),
    ).rejects.toThrow('該帳戶已有此標的的開帳快照')
  })

  it('不同帳戶同標的可各自建快照', async () => {
    await repo.addPosition({ date: '2026-07-15', accountId: 1, symbol: '0050', qty: 1000 })
    await expect(repo.addPosition({ date: '2026-07-15', accountId: 2, symbol: '0050', qty: 300 })).resolves.toBeDefined()
  })
})
