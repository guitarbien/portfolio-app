import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import { valuate } from '../domain/valuation'
import { maintenanceRatio } from '../domain/maintenance'
import { stressTest } from '../domain/stress'
import { fmtPct, fmtTwd } from '../lib/format'
import { today } from '../lib/date'

export default function Dashboard() {
  const [dropPct, setDropPct] = useState(0)
  const data = useLiveQuery(async () => {
    const [accounts, instrumentList, positions, loans, prices, fx] = await Promise.all([
      repo.listAccounts(), repo.listInstruments(), repo.listPositions(),
      repo.listLoans(), repo.latestEffectivePrices(), repo.latestUsdTwd(),
    ])
    return { accounts, instruments: new Map(instrumentList.map((i) => [i.symbol, i])), positions, loans, prices, fx }
  }, [])

  if (!data) return <p>載入中…</p>

  const valuation = valuate({
    positions: data.positions,
    instruments: data.instruments,
    prices: data.prices,
    usdTwd: data.fx?.rate,
    cash: data.accounts.map((a) => ({ currency: a.currency, amount: a.cashBalance })),
    loans: data.loans,
  })
  const cashTwd = data.accounts
    .filter((a) => a.currency === 'TWD')
    .reduce((s, a) => s + a.cashBalance, 0)
  const stress = stressTest({
    drop: dropPct / 100, loans: data.loans,
    instruments: data.instruments, prices: data.prices, cashTwd,
  })
  const pledges = data.loans.filter((l) => l.kind === 'pledge')
  const missing = new Set(valuation.missing)
  for (const l of pledges) maintenanceRatio(l, data.prices, today()).missing.forEach((s) => missing.add(s))

  return (
    <section>
      <h2>儀表板</h2>
      {missing.size > 0 && <p role="alert">報價缺失：{[...missing].join('、')}</p>}
      <dl>
        <dt>淨值</dt><dd>{fmtTwd(valuation.nav)}</dd>
        <dt>總曝險</dt><dd>{fmtTwd(valuation.exposure)}</dd>
        <dt>槓桿倍率</dt>
        <dd>{valuation.leverageRatio === undefined ? '—' : valuation.leverageRatio.toFixed(2)}</dd>
      </dl>

      {pledges.map((loan) => {
        const m = maintenanceRatio(loan, data.prices, today())
        const s = stress.loans.find((r) => r.id === loan.id)
        return (
          <article key={loan.id}>
            <h3>{loan.name}</h3>
            {m.ratio !== undefined && <p>維持率 {fmtPct(m.ratio)}</p>}
            {m.missing.length > 0 && <p>報價缺失：{m.missing.join('、')}</p>}
            {s?.marginCallDrop !== undefined && <p>還能跌 {fmtPct(s.marginCallDrop * 100)}</p>}
            {s?.topUpCollateral !== undefined && (
              <>
                <p>需補擔保 {fmtTwd(s.topUpCollateral)}</p>
                <p>或還款 {fmtTwd(s.topUpRepay!)}</p>
              </>
            )}
          </article>
        )
      })}

      <label>
        大盤跌幅
        <input type="range" min={0} max={50} step={1} value={dropPct} aria-label="大盤跌幅"
          onChange={(e) => setDropPct(Number(e.target.value))} />
      </label>
      <span>{dropPct}%</span>
      <p>補繳子彈 {fmtTwd(stress.bullets)}</p>
      <p>資金缺口 {fmtTwd(stress.shortfall)}</p>
    </section>
  )
}
