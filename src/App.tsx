import { useEffect, useState } from 'react'
import Dashboard from './ui/Dashboard'
import Holdings from './ui/Holdings'
import Loans from './ui/Loans'
import Records from './ui/Records'
import Settings from './ui/Settings'
import { refreshQuotes } from './quotes/refresh'

const TABS = [
  { key: 'dashboard', label: '儀表板', view: <Dashboard /> },
  { key: 'holdings', label: '持倉', view: <Holdings /> },
  { key: 'loans', label: '借款', view: <Loans /> },
  { key: 'records', label: '紀錄', view: <Records /> },
  { key: 'settings', label: '設定', view: <Settings /> },
] as const

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('dashboard')

  useEffect(() => {
    refreshQuotes().catch(() => {
      /* 開機補抓失敗不阻斷 UI；設定頁可手動重抓（spec §7） */
    })
  }, [])

  return (
    <main>
      <h1>投資組合</h1>
      <nav role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      {TABS.find((t) => t.key === tab)!.view}
    </main>
  )
}
