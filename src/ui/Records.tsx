import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import { today } from '../lib/date'
import type { CashFlow } from '../domain/types'

const KINDS: { value: CashFlow['kind']; label: string }[] = [
  { value: 'contribution', label: '投入' },
  { value: 'withdrawal', label: '提領' },
  { value: 'dividend', label: '股利' },
  { value: 'interest', label: '利息' },
  { value: 'fee', label: '費用' },
  { value: 'transfer', label: '轉帳' },
]

export default function Records() {
  // ponytail: undefined default 讓 findAllByRole 等帳戶載入後才找到 combobox，避免 timing race
  const accounts = useLiveQuery(repo.listAccounts)
  const txs = useLiveQuery(repo.listTransactions, [], [])
  const flows = useLiveQuery(repo.listCashFlows, [], [])

  const [tx, setTx] = useState({ accountId: '', date: today(), symbol: '', qty: '', price: '', fee: '0', tax: '0' })
  const [cf, setCf] = useState({ accountId: '', date: today(), amount: '', kind: 'contribution' as CashFlow['kind'], external: true })

  if (accounts === undefined) return <section><h2>紀錄</h2></section>

  const addTx = async (e: React.FormEvent) => {
    e.preventDefault()
    await repo.addTransaction({
      accountId: Number(tx.accountId), date: tx.date, symbol: tx.symbol,
      qty: Number(tx.qty), price: Number(tx.price), fee: Number(tx.fee), tax: Number(tx.tax),
    })
    setTx({ ...tx, symbol: '', qty: '', price: '' })
  }

  const addCf = async (e: React.FormEvent) => {
    e.preventDefault()
    const account = accounts.find((a) => a.id === Number(cf.accountId))
    await repo.addCashFlow({
      accountId: Number(cf.accountId), date: cf.date, amount: Number(cf.amount),
      currency: account?.currency ?? 'TWD', kind: cf.kind, is_external: cf.external,
    })
    setCf({ ...cf, amount: '' })
  }

  const accountSelect = (value: string, onChange: (v: string) => void) => (
    <label>帳戶<select value={value} required onChange={(e) => onChange(e.target.value)}>
      <option value="">選擇帳戶</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select></label>
  )

  return (
    <section>
      <h2>紀錄</h2>

      <h3>交易</h3>
      <form onSubmit={addTx}>
        {accountSelect(tx.accountId, (v) => setTx({ ...tx, accountId: v }))}
        <label>交易日期<input type="date" value={tx.date} required onChange={(e) => setTx({ ...tx, date: e.target.value })} /></label>
        <label>代號<input value={tx.symbol} required onChange={(e) => setTx({ ...tx, symbol: e.target.value })} /></label>
        <label>股數（買正賣負）<input type="number" value={tx.qty} required onChange={(e) => setTx({ ...tx, qty: e.target.value })} /></label>
        <label>成交價<input type="number" step="0.01" value={tx.price} required onChange={(e) => setTx({ ...tx, price: e.target.value })} /></label>
        <label>手續費<input type="number" value={tx.fee} onChange={(e) => setTx({ ...tx, fee: e.target.value })} /></label>
        <label>交易稅<input type="number" value={tx.tax} onChange={(e) => setTx({ ...tx, tax: e.target.value })} /></label>
        <button type="submit">新增交易</button>
      </form>
      <ul>
        {txs.map((t) => (
          <li key={t.id}>
            {t.date} {t.symbol} {t.qty > 0 ? '買' : '賣'} {Math.abs(t.qty)} @ {t.price}
            <button aria-label={`刪除交易 ${t.symbol} ${t.date}`} onClick={() => repo.deleteTransaction(t.id!)}>刪除</button>
          </li>
        ))}
      </ul>

      <h3>現金流</h3>
      <form onSubmit={addCf}>
        {accountSelect(cf.accountId, (v) => setCf({ ...cf, accountId: v }))}
        <label>日期<input type="date" value={cf.date} required onChange={(e) => setCf({ ...cf, date: e.target.value })} /></label>
        <label>金額（流入正流出負）<input type="number" step="0.01" value={cf.amount} required onChange={(e) => setCf({ ...cf, amount: e.target.value })} /></label>
        <label>類別<select value={cf.kind} onChange={(e) => setCf({ ...cf, kind: e.target.value as CashFlow['kind'] })}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select></label>
        <label>外部現金流<input type="checkbox" checked={cf.external} onChange={(e) => setCf({ ...cf, external: e.target.checked })} /></label>
        <button type="submit">新增現金流</button>
      </form>
      <ul>
        {flows.map((f) => (
          <li key={f.id}>
            {f.date} {KINDS.find((k) => k.value === f.kind)?.label} {f.amount} {f.currency}
            <button aria-label={`刪除現金流 ${f.date} ${f.amount}`} onClick={() => repo.deleteCashFlow(f.id!)}>刪除</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
