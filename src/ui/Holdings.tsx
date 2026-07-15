import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import { today } from '../lib/date'

export default function Holdings() {
  const accounts = useLiveQuery(repo.listAccounts, [], [])
  const positions = useLiveQuery(repo.listPositions, [], [])

  const [account, setAccount] = useState({ name: '', broker: '', currency: 'TWD' as const, cashBalance: 0 })
  const [pos, setPos] = useState({
    accountId: '', symbol: '', name: '', market: 'TW' as 'TW' | 'US', leverageFactor: 1, qty: 0,
  })

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    await repo.addAccount({ ...account })
    setAccount({ name: '', broker: '', currency: 'TWD', cashBalance: 0 })
  }

  const addPosition = async (e: React.FormEvent) => {
    e.preventDefault()
    await repo.putInstrument({
      symbol: pos.symbol, name: pos.name, market: pos.market,
      currency: pos.market === 'TW' ? 'TWD' : 'USD', leverageFactor: pos.leverageFactor,
    })
    await repo.addPosition({ date: today(), accountId: Number(pos.accountId), symbol: pos.symbol, qty: pos.qty })
    setPos({ accountId: pos.accountId, symbol: '', name: '', market: 'TW', leverageFactor: 1, qty: 0 })
  }

  return (
    <section>
      <h2>持倉</h2>
      <form onSubmit={addAccount}>
        <label>帳戶名稱<input value={account.name} required
          onChange={(e) => setAccount({ ...account, name: e.target.value })} /></label>
        <label>券商<input value={account.broker} required
          onChange={(e) => setAccount({ ...account, broker: e.target.value })} /></label>
        <label>幣別<select value={account.currency}
          onChange={(e) => setAccount({ ...account, currency: e.target.value as 'TWD' })}>
          <option value="TWD">TWD</option><option value="USD">USD</option>
        </select></label>
        <label>現金餘額<input type="number" value={account.cashBalance}
          onChange={(e) => setAccount({ ...account, cashBalance: Number(e.target.value) })} /></label>
        <button type="submit">新增帳戶</button>
      </form>

      <form onSubmit={addPosition}>
        <label>帳戶<select value={pos.accountId} required
          onChange={(e) => setPos({ ...pos, accountId: e.target.value })}>
          <option value="">選擇帳戶</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <label>代號<input value={pos.symbol} required
          onChange={(e) => setPos({ ...pos, symbol: e.target.value })} /></label>
        <label>名稱<input value={pos.name} required
          onChange={(e) => setPos({ ...pos, name: e.target.value })} /></label>
        <label>市場<select value={pos.market}
          onChange={(e) => setPos({ ...pos, market: e.target.value as 'TW' | 'US' })}>
          <option value="TW">TW</option><option value="US">US</option>
        </select></label>
        <label>槓桿倍數<input type="number" step="1" value={pos.leverageFactor}
          onChange={(e) => setPos({ ...pos, leverageFactor: Number(e.target.value) })} /></label>
        <label>股數<input type="number" value={pos.qty || ''} required
          onChange={(e) => setPos({ ...pos, qty: Number(e.target.value) })} /></label>
        <button type="submit">新增持倉</button>
      </form>

      <table>
        <thead><tr><th>代號</th><th>股數</th><th></th></tr></thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id}>
              <td>{p.symbol}</td>
              <td>{p.qty}</td>
              <td><button aria-label={`刪除 ${p.symbol}`}
                onClick={() => repo.deletePosition(p.id!)}>刪除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
