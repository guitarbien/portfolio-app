import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import { valuate } from '../domain/valuation'
import { maintenanceRatio } from '../domain/maintenance'
import { stressTest } from '../domain/stress'
import { fmtPct, fmtTwd } from '../lib/format'
import { today } from '../lib/date'
import { currentHoldings } from '../domain/holdings'
import { xirr } from '../domain/xirr'
import { buildXirrInput } from '../domain/xirrInput'

export default function Dashboard() {
  const [dropPct, setDropPct] = useState(0)
  const data = useLiveQuery(async () => {
    const [accounts, instrumentList, positions, transactions, loans, prices, fx, cashFlows] = await Promise.all([
      repo.listAccounts(), repo.listInstruments(), repo.listPositions(),
      repo.listTransactions(), repo.listLoans(), repo.latestEffectivePrices(), repo.latestUsdTwd(),
      repo.listCashFlows(),
    ])
    return { accounts, instruments: new Map(instrumentList.map((i) => [i.symbol, i])), positions, transactions, loans, prices, fx, cashFlows }
  }, [])

  if (!data) return <p>載入中…</p>

  const valuation = valuate({
    positions: currentHoldings(data.positions, data.transactions),
    instruments: data.instruments,
    prices: data.prices,
    usdTwd: data.fx?.rate,
    cash: data.accounts.map((a) => ({ currency: a.currency, amount: a.cashBalance })),
    loans: data.loans,
  })
  const xirrInput = buildXirrInput(data.cashFlows, valuation.nav, today())
  const rate = xirr(xirrInput.flows)
  const firstFlowDate = data.cashFlows
    .filter((c) => c.is_external)
    .map((c) => c.date)
    .sort()[0]

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
      {xirrInput.skipped.length > 0 && (
        <p role="alert">{xirrInput.skipped.length} 筆外幣流量缺匯率未計入</p>
      )}
      <dl>
        <dt>淨值</dt><dd>{fmtTwd(valuation.nav)}</dd>
        <dt>總曝險</dt><dd>{fmtTwd(valuation.exposure)}</dd>
        <dt>槓桿倍率</dt>
        <dd>{valuation.leverageRatio === undefined ? '—' : valuation.leverageRatio.toFixed(2)}</dd>
        <dt>年化報酬率（XIRR）</dt>
        <dd>
          {rate === undefined ? '—' : `${(rate * 100).toFixed(1)}%`}
          {firstFlowDate && <small>自 {firstFlowDate} 起</small>}
        </dd>
      </dl>

      {pledges.map((loan) => {
        const m = maintenanceRatio(loan, data.prices, today())
        const s = stress.loans.find((r) => r.id === loan.id)
        // 狀態分級：低於追繳門檻＝critical；門檻+15 內＝warning（券商預警線慣例）；其上＝good
        const status =
          m.ratio === undefined
            ? undefined
            : m.ratio < loan.maintenanceThreshold
              ? 'status-critical'
              : m.ratio < loan.maintenanceThreshold + 15
                ? 'status-warning'
                : 'status-good'
        return (
          <article key={loan.id} className={status}>
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
