import { repo } from '../data/repo'
import { today } from '../lib/date'
import { fetchTwseClose } from './twse'
import { fetchUsdTwd } from './erApi'
import { fetchTwelveClose } from './twelveData'

export interface RefreshDeps {
  fetchTwse: typeof fetchTwseClose
  fetchFx: typeof fetchUsdTwd
  fetchUs: typeof fetchTwelveClose
  getUsKey: () => string | null
  now: () => string
}

export interface RefreshReport {
  updated: string[]
  skipped: string[]
  failed: { symbol: string; reason: string }[]
}

const defaults: RefreshDeps = {
  fetchTwse: fetchTwseClose,
  fetchFx: fetchUsdTwd,
  fetchUs: fetchTwelveClose,
  getUsKey: () => localStorage.getItem('twelveDataApiKey'),
  now: today,
}

export async function refreshQuotes(deps: RefreshDeps = defaults): Promise<RefreshReport> {
  const report: RefreshReport = { updated: [], skipped: [], failed: [] }
  const [instruments, prices, fx] = await Promise.all([
    repo.listInstruments(),
    repo.latestEffectivePrices(),
    repo.latestUsdTwd(),
  ])

  for (const inst of instruments.filter((i) => i.market === 'TW')) {
    if (prices.get(inst.symbol)?.date === deps.now()) {
      report.skipped.push(inst.symbol)
      continue
    }
    const r = await deps.fetchTwse(inst.symbol)
    if (r.ok) {
      await repo.upsertPrice(r.value)
      report.updated.push(inst.symbol)
    } else {
      report.failed.push({ symbol: inst.symbol, reason: r.reason })
    }
  }

  const usKey = deps.getUsKey()
  for (const inst of instruments.filter((i) => i.market === 'US')) {
    // 當日已有價即 skip——先於 key 檢查：資料已新鮮就沒有「抓不到」可言
    if (prices.get(inst.symbol)?.date === deps.now()) {
      report.skipped.push(inst.symbol)
      continue
    }
    if (!usKey) {
      report.failed.push({ symbol: inst.symbol, reason: '未設定 Twelve Data API key' })
      continue
    }
    const r = await deps.fetchUs(inst.symbol, usKey)
    if (r.ok) {
      await repo.upsertPrice(r.value)
      report.updated.push(inst.symbol)
    } else {
      report.failed.push({ symbol: inst.symbol, reason: r.reason })
    }
  }

  if (fx?.date === deps.now()) {
    report.skipped.push('USDTWD')
  } else {
    const r = await deps.fetchFx()
    if (r.ok) {
      await repo.upsertFx(r.value)
      report.updated.push('USDTWD')
    } else {
      report.failed.push({ symbol: 'USDTWD', reason: r.reason })
    }
  }
  return report
}
