import { db } from './db'
import type { Account, FxRate, Instrument, Loan, Price, PriceMap, SnapshotPosition } from '../domain/types'

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
  addPosition: (p: SnapshotPosition) => db.positions.add(p),
  listPositions: () => db.positions.toArray(),
  deletePosition: (id: number) => db.positions.delete(id),
  addLoan: (l: Loan) => db.loans.add(l),
  listLoans: () => db.loans.toArray(),
  deleteLoan: (id: number) => db.loans.delete(id),
  upsertPrice: (p: Price) => db.prices.put(p),
  upsertFx: (f: FxRate) => db.fxRates.put(f),
  latestEffectivePrices,
  latestUsdTwd,
}
