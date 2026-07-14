import type { Instrument, Loan, PriceMap } from './types'

export interface StressInput {
  drop: number
  loans: Loan[]
  instruments: Map<string, Instrument>
  prices: PriceMap
  cashTwd: number
}

export interface StressLoanResult {
  name: string
  stressedRatio?: number
  marginCallDrop?: number
  topUpCollateral?: number
  topUpRepay?: number
  missing: string[]
}

export interface StressResult {
  drop: number
  loans: StressLoanResult[]
  bullets: number
  totalTopUp: number
  shortfall: number
}

export function stressTest(input: StressInput): StressResult {
  const results: StressLoanResult[] = []
  let bullets = input.cashTwd
  let totalTopUp = 0

  for (const loan of input.loans) {
    if (loan.kind === 'mortgage') {
      bullets += Math.max(0, (loan.creditLimit ?? 0) - loan.balance)
      continue
    }
    const missing: string[] = []
    let value = 0 // V：現值
    let weighted = 0 // W：Σ 市值×β
    let stressedValue = 0
    for (const c of loan.collateral) {
      const quote = input.prices.get(c.symbol)
      if (!quote) {
        missing.push(c.symbol)
        continue
      }
      const beta = Math.abs(input.instruments.get(c.symbol)?.leverageFactor ?? 1)
      const marketValue = c.qty * quote.close
      value += marketValue
      weighted += marketValue * beta
      stressedValue += Math.max(0, marketValue * (1 - beta * input.drop))
    }
    if (missing.length > 0 || loan.balance <= 0) {
      results.push({ name: loan.name, missing })
      continue
    }
    const thresholdValue = (loan.maintenanceThreshold / 100) * loan.balance
    const marginCallDrop =
      value <= thresholdValue ? 0 : weighted > 0 ? (value - thresholdValue) / weighted : undefined
    const stressedRatio = (stressedValue / loan.balance) * 100
    let topUpCollateral: number | undefined
    let topUpRepay: number | undefined
    if (stressedRatio < loan.maintenanceThreshold) {
      const restore = loan.restoreThreshold / 100
      topUpCollateral = restore * loan.balance - stressedValue
      topUpRepay = loan.balance - stressedValue / restore
      totalTopUp += topUpCollateral
    }
    results.push({ name: loan.name, stressedRatio, marginCallDrop, topUpCollateral, topUpRepay, missing })
  }

  results.sort((a, b) => (a.marginCallDrop ?? Infinity) - (b.marginCallDrop ?? Infinity))
  return { drop: input.drop, loans: results, bullets, totalTopUp, shortfall: Math.max(0, totalTopUp - bullets) }
}
