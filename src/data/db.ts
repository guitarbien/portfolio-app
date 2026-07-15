import Dexie, { type Table } from 'dexie'
import type { Account, CashFlow, FxRate, Instrument, Loan, Price, SnapshotPosition, Transaction } from '../domain/types'

export class PortfolioDb extends Dexie {
  accounts!: Table<Account, number>
  instruments!: Table<Instrument, string>
  positions!: Table<SnapshotPosition, number>
  loans!: Table<Loan, number>
  prices!: Table<Price, [string, string, string]>
  fxRates!: Table<FxRate, [string, string, string]>
  transactions!: Table<Transaction, number>
  cashFlows!: Table<CashFlow, number>

  constructor() {
    super('portfolio')
    this.version(1).stores({
      accounts: '++id',
      instruments: 'symbol',
      positions: '++id, symbol',
      loans: '++id',
      prices: '[symbol+date+source], symbol',
      fxRates: '[pair+date+source], pair',
    })
    this.version(2).stores({
      transactions: '++id, symbol',
      cashFlows: '++id, date',
    })
  }
}

export const db = new PortfolioDb()
