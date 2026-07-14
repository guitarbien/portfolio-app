import type { Loan, PriceMap } from './types'

export interface MaintenanceResult {
  ratio?: number // %
  accruedInterest: number
  missing: string[]
}

const MS_PER_DAY = 86_400_000

export function accruedInterest(loan: Loan, asOf: string): number {
  if (!loan.lastInterestSettleDate) return 0
  const days = (Date.parse(asOf) - Date.parse(loan.lastInterestSettleDate)) / MS_PER_DAY
  if (days <= 0) return 0
  return (loan.balance * loan.rate * days) / 365
}

export function maintenanceRatio(loan: Loan, prices: PriceMap, asOf: string): MaintenanceResult {
  const interest = accruedInterest(loan, asOf)
  if (loan.kind !== 'pledge' || loan.balance <= 0) {
    return { accruedInterest: interest, missing: [] }
  }
  const missing: string[] = []
  let collateralValue = 0
  for (const c of loan.collateral) {
    const quote = prices.get(c.symbol)
    if (!quote) {
      missing.push(c.symbol)
      continue
    }
    collateralValue += c.qty * quote.close
  }
  if (missing.length > 0) return { accruedInterest: interest, missing }
  const denominator = loan.balance + (loan.includeInterestInDenominator ? interest : 0)
  return { ratio: (collateralValue / denominator) * 100, accruedInterest: interest, missing: [] }
}
