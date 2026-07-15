export interface Account {
  id?: number
  name: string
  broker: string
  currency: 'TWD' | 'USD'
  cashBalance: number
}

export interface Instrument {
  symbol: string
  name: string
  market: 'TW' | 'US'
  currency: 'TWD' | 'USD'
  leverageFactor: number // 一般股票 1、正2 ETF 2、反向 −1（spec §5）
}

export interface SnapshotPosition {
  id?: number
  date: string // YYYY-MM-DD
  accountId: number
  symbol: string
  qty: number
  cost?: number // 不影響報酬率計算（spec §5）
}

export interface Transaction {
  id?: number
  accountId: number
  date: string // YYYY-MM-DD
  symbol: string
  qty: number // 帶號：買正賣負
  price: number
  fee: number
  tax: number
}

export interface CashFlow {
  id?: number
  accountId: number
  date: string // YYYY-MM-DD
  amount: number // 組合視角帶號：錢進組合 +、錢出組合 −
  currency: 'TWD' | 'USD'
  kind: 'contribution' | 'withdrawal' | 'dividend' | 'interest' | 'fee' | 'transfer'
  is_external: boolean
  fx_rate?: number // 外幣流量的發生日匯率（選填）
}

export interface Loan {
  id?: number
  name: string
  kind: 'pledge' | 'mortgage'
  balance: number
  rate: number // 小數，如 0.04
  maintenanceThreshold: number // %，預設 130
  restoreThreshold: number // %，預設 166
  includeInterestInDenominator: boolean
  lastInterestSettleDate?: string
  creditLimit?: number // mortgage 專用
  collateral: { symbol: string; qty: number }[]
}

export interface Price {
  symbol: string
  date: string
  close: number
  source: 'auto' | 'manual'
}

export interface FxRate {
  pair: 'USDTWD'
  date: string
  rate: number
  source: 'auto' | 'manual'
}

export interface PriceQuote {
  close: number
  date: string
}

export type PriceMap = Map<string, PriceQuote>
