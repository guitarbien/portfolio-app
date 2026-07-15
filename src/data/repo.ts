import { db } from './db'
import type { Account, CashFlow, FxRate, Instrument, Loan, Price, PriceMap, SnapshotPosition, Transaction } from '../domain/types'

// ponytail: 全表掃描選最新價，價格筆數破萬再改索引查詢
async function latestEffectivePrices(): Promise<PriceMap> {
  const all = await db.prices.toArray()
  const best = new Map<string, Price>()
  for (const p of all) {
    const cur = best.get(p.symbol)
    if (!cur || p.date > cur.date || (p.date === cur.date && p.source === 'manual')) {
      best.set(p.symbol, p)
    }
  }
  const map: PriceMap = new Map()
  for (const [symbol, p] of best) map.set(symbol, { close: p.close, date: p.date })
  return map
}

async function latestUsdTwd(): Promise<FxRate | undefined> {
  const all = await db.fxRates.where('pair').equals('USDTWD').toArray()
  return all.sort((a, b) => b.date.localeCompare(a.date))[0]
}

export const repo = {
  addAccount: (a: Account) => db.accounts.add(a),
  listAccounts: () => db.accounts.toArray(),
  putInstrument: (i: Instrument) => db.instruments.put(i),
  listInstruments: () => db.instruments.toArray(),
  addPosition: async (p: SnapshotPosition) => {
    const dup = await db.positions
      .where('symbol').equals(p.symbol)
      .and((x) => x.accountId === p.accountId)
      .first()
    if (dup) throw new Error('該帳戶已有此標的的開帳快照，後續變動請記在交易紀錄')
    return db.positions.add(p)
  },
  listPositions: () => db.positions.toArray(),
  deletePosition: (id: number) => db.positions.delete(id),
  addLoan: (l: Loan) => db.loans.add(l),
  listLoans: () => db.loans.toArray(),
  deleteLoan: (id: number) => db.loans.delete(id),
  addTransaction: (t: Transaction) => db.transactions.add(t),
  listTransactions: () => db.transactions.toArray(),
  deleteTransaction: (id: number) => db.transactions.delete(id),
  addCashFlow: (c: CashFlow) => db.cashFlows.add(c),
  addCashFlows: (rows: CashFlow[]) => db.cashFlows.bulkAdd(rows),
  listCashFlows: () => db.cashFlows.toArray(),
  deleteCashFlow: (id: number) => db.cashFlows.delete(id),
  updateAccount: (id: number, patch: Partial<Account>) => db.accounts.update(id, patch),
  updateLoan: (id: number, patch: Partial<Loan>) => db.loans.update(id, patch),
  upsertPrice: (p: Price) => db.prices.put(p),
  upsertFx: (f: FxRate) => db.fxRates.put(f),
  latestEffectivePrices,
  latestUsdTwd,
}
