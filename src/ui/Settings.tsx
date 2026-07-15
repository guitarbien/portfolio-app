import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import { refreshQuotes, type RefreshReport } from '../quotes/refresh'
import { today } from '../lib/date'

export default function Settings({ refresh = refreshQuotes }: { refresh?: () => Promise<RefreshReport> }) {
  const [manual, setManual] = useState({ symbol: '', close: 0 })
  const [usKey, setUsKey] = useState(localStorage.getItem('twelveDataApiKey') ?? '')
  const [report, setReport] = useState<RefreshReport>()
  const rows = useLiveQuery(async () => {
    const [instruments, prices] = await Promise.all([repo.listInstruments(), repo.latestEffectivePrices()])
    return instruments.map((i) => ({ symbol: i.symbol, date: prices.get(i.symbol)?.date }))
  }, [], [])

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault()
    await repo.upsertPrice({ symbol: manual.symbol, date: today(), close: manual.close, source: 'manual' })
    setManual({ symbol: '', close: 0 })
  }

  return (
    <section>
      <h2>設定</h2>
      <form onSubmit={saveManual}>
        <label>報價代號<input value={manual.symbol} required
          onChange={(e) => setManual({ ...manual, symbol: e.target.value })} /></label>
        <label>收盤價<input type="number" step="0.01" value={manual.close || ''} required
          onChange={(e) => setManual({ ...manual, close: Number(e.target.value) })} /></label>
        <button type="submit">儲存手動報價</button>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); localStorage.setItem('twelveDataApiKey', usKey) }}>
        <label>Twelve Data API key<input value={usKey} onChange={(e) => setUsKey(e.target.value)} /></label>
        <button type="submit">儲存 API key</button>
      </form>

      <button onClick={async () => setReport(await refresh())}>重新抓取報價</button>
      {report && <p>更新 {report.updated.length} 檔、失敗 {report.failed.length} 檔</p>}

      <ul>
        {rows.map((r) => (
          <li key={r.symbol}>
            {r.symbol}：{r.date ?? '無報價'} {r.date && r.date !== today() && <strong>過期</strong>}
          </li>
        ))}
      </ul>
    </section>
  )
}
