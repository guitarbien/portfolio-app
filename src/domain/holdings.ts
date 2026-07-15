import type { SnapshotPosition, Transaction } from './types'

export interface Holding {
  accountId: number
  symbol: string
  qty: number
}

export function currentHoldings(snapshot: SnapshotPosition[], txs: Transaction[]): Holding[] {
  const map = new Map<string, Holding>()
  const bump = (accountId: number, symbol: string, qty: number) => {
    const key = `${accountId}:${symbol}`
    const cur = map.get(key) ?? { accountId, symbol, qty: 0 }
    cur.qty += qty
    map.set(key, cur)
  }
  for (const s of snapshot) bump(s.accountId, s.symbol, s.qty)
  for (const t of txs) bump(t.accountId, t.symbol, t.qty)
  return [...map.values()]
    .filter((h) => h.qty !== 0)
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.accountId - b.accountId)
}
