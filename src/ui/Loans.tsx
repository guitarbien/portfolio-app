import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import type { Loan } from '../domain/types'

function LoanBalanceEditor({ loan }: { loan: Loan }) {
  const [value, setValue] = useState(String(loan.balance))
  return (
    <>
      <label>{loan.name} 餘額
        <input type="number" aria-label={`${loan.name} 餘額`} value={value}
          onChange={(e) => setValue(e.target.value)} />
      </label>
      <button onClick={() => repo.updateLoan(loan.id!, { balance: Number(value) })}>
        儲存 {loan.name} 餘額
      </button>
    </>
  )
}

const empty = {
  name: '', kind: 'pledge' as 'pledge' | 'mortgage', balance: 0, ratePct: 0,
  maintenanceThreshold: 130, restoreThreshold: 166,
  includeInterestInDenominator: false, creditLimit: 0,
  collateral: [{ symbol: '', qty: 0 }],
}

export default function Loans() {
  const loans = useLiveQuery(repo.listLoans, [], [])
  const [form, setForm] = useState(empty)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await repo.addLoan({
      name: form.name, kind: form.kind, balance: form.balance, rate: form.ratePct / 100,
      maintenanceThreshold: form.maintenanceThreshold, restoreThreshold: form.restoreThreshold,
      includeInterestInDenominator: form.includeInterestInDenominator,
      creditLimit: form.kind === 'mortgage' ? form.creditLimit : undefined,
      collateral: form.kind === 'pledge'
        ? form.collateral.filter((c) => c.symbol !== '' && c.qty > 0)
        : [],
    })
    setForm(empty)
  }

  const setCollateral = (i: number, patch: Partial<{ symbol: string; qty: number }>) =>
    setForm({ ...form, collateral: form.collateral.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  return (
    <section>
      <h2>借款</h2>
      <form onSubmit={submit}>
        <label>借款名稱<input value={form.name} required
          onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>類型<select value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as 'pledge' | 'mortgage' })}>
          <option value="pledge">股票質押</option><option value="mortgage">理財型房貸</option>
        </select></label>
        <label>借款餘額<input type="number" value={form.balance || ''} required
          onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} /></label>
        <label>年利率 %<input type="number" step="0.01" value={form.ratePct || ''} required
          onChange={(e) => setForm({ ...form, ratePct: Number(e.target.value) })} /></label>
        {form.kind === 'pledge' && (
          <>
            <label>追繳門檻 %<input type="number" value={form.maintenanceThreshold}
              onChange={(e) => setForm({ ...form, maintenanceThreshold: Number(e.target.value) })} /></label>
            <label>回補標準 %<input type="number" value={form.restoreThreshold}
              onChange={(e) => setForm({ ...form, restoreThreshold: Number(e.target.value) })} /></label>
            <label>分母含應收利息<input type="checkbox" checked={form.includeInterestInDenominator}
              onChange={(e) => setForm({ ...form, includeInterestInDenominator: e.target.checked })} /></label>
            {form.collateral.map((c, i) => (
              <span key={i}>
                <label>擔保品代號<input value={c.symbol}
                  onChange={(e) => setCollateral(i, { symbol: e.target.value })} /></label>
                <label>擔保品股數<input type="number" value={c.qty || ''}
                  onChange={(e) => setCollateral(i, { qty: Number(e.target.value) })} /></label>
              </span>
            ))}
            <button type="button"
              onClick={() => setForm({ ...form, collateral: [...form.collateral, { symbol: '', qty: 0 }] })}>
              ＋擔保品
            </button>
          </>
        )}
        {form.kind === 'mortgage' && (
          <label>核定額度<input type="number" value={form.creditLimit || ''}
            onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} /></label>
        )}
        <button type="submit">新增借款</button>
      </form>

      <ul>
        {loans.map((l) => (
          <li key={l.id}>
            {l.name}
            <LoanBalanceEditor loan={l} />
            <button aria-label={`刪除 ${l.name}`} onClick={() => repo.deleteLoan(l.id!)}>刪除</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
