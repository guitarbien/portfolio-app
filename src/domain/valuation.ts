import type { Instrument, Loan, PriceMap } from './types'

export interface ValuationInput {
  positions: { symbol: string; qty: number }[]
  instruments: Map<string, Instrument>
  prices: PriceMap
  usdTwd?: number
  cash: { currency: 'TWD' | 'USD'; amount: number }[]
  loans: Loan[]
}

export interface Valuation {
  nav: number
  exposure: number
  leverageRatio?: number
  missing: string[]
}

export function valuate(input: ValuationInput): Valuation {
  const missing = new Set<string>()
  let assets = 0
  let exposure = 0

  for (const p of input.positions) {
    const instrument = input.instruments.get(p.symbol)
    const quote = input.prices.get(p.symbol)
    if (!instrument || !quote) {
      missing.add(p.symbol)
      continue
    }
    let fx = 1
    if (instrument.currency === 'USD') {
      if (input.usdTwd === undefined) {
        missing.add('USDTWD')
        continue
      }
      fx = input.usdTwd
    }
    const marketValue = p.qty * quote.close * fx
    assets += marketValue
    exposure += marketValue * Math.abs(instrument.leverageFactor)
  }

  for (const c of input.cash) {
    if (c.currency === 'USD') {
      if (input.usdTwd === undefined) {
        missing.add('USDTWD')
        continue
      }
      assets += c.amount * input.usdTwd
    } else {
      assets += c.amount
    }
  }

  const debt = input.loans.reduce((sum, l) => sum + l.balance, 0)
  const nav = assets - debt
  return {
    nav,
    exposure,
    leverageRatio: nav > 0 ? exposure / nav : undefined,
    missing: [...missing],
  }
}
