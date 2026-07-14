import Dexie, { type Table } from 'dexie'
import type { Account, FxRate, Instrument, Loan, Price, SnapshotPosition } from '../domain/types'

export class PortfolioDb extends Dexie {
  accounts!: Table<Account, number>
  instruments!: Table<Instrument, string>
  positions!: Table<SnapshotPosition, number>
  loans!: Table<Loan, number>
  prices!: Table<Price, [string, string, string]>
  fxRates!: Table<FxRate, [string, string, string]>

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
  }
}

export const db = new PortfolioDb()
