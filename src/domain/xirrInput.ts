import type { CashFlow } from './types'
import type { XirrFlow } from './xirr'

export interface XirrInputResult {
  flows: XirrFlow[]
  skipped: { date: string; reason: string }[]
}

export function buildXirrInput(cashFlows: CashFlow[], nav: number, asOf: string): XirrInputResult {
  const flows: XirrFlow[] = []
  const skipped: { date: string; reason: string }[] = []
  for (const cf of cashFlows) {
    if (!cf.is_external) continue
    let fx = 1
    if (cf.currency !== 'TWD') {
      if (cf.fx_rate === undefined) {
        skipped.push({ date: cf.date, reason: '外幣流量缺發生日匯率' })
        continue
      }
      fx = cf.fx_rate
    }
    flows.push({ date: cf.date, amount: -cf.amount * fx })
  }
  flows.push({ date: asOf, amount: nav })
  return { flows, skipped }
}
