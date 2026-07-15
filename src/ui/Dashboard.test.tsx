import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { db } from '../data/db'
import { repo } from '../data/repo'
import Dashboard from './Dashboard'

afterEach(cleanup)

async function seed() {
  const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 50_000 })
  await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
  await repo.addPosition({ date: '2026-07-14', accountId, symbol: '0050', qty: 1000 })
  await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 100, source: 'auto' })
  await repo.addLoan({
    name: '永豐質押', kind: 'pledge', balance: 60_000, rate: 0.04,
    maintenanceThreshold: 130, restoreThreshold: 166,
    includeInterestInDenominator: false, collateral: [{ symbol: '0050', qty: 1000 }],
  })
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('Dashboard', () => {
  it('顯示淨值、總曝險、槓桿倍率、維持率與距追繳跌幅', async () => {
    await seed()
    render(<Dashboard />)
    // NAV = 100,000 + 50,000 − 60,000 = 90,000；曝險 100,000；倍率 1.11
    expect(await screen.findByText('90,000')).toBeInTheDocument()
    expect(screen.getByText('100,000')).toBeInTheDocument()
    expect(screen.getByText('1.11')).toBeInTheDocument()
    expect(screen.getByText('維持率 166.7%')).toBeInTheDocument()
    expect(screen.getByText('還能跌 22.0%')).toBeInTheDocument() // X* = 0.22
  })

  it('壓力滑桿拉到 30%：顯示補繳金額與資金缺口', async () => {
    await seed()
    render(<Dashboard />)
    fireEvent.change(await screen.findByLabelText('大盤跌幅'), { target: { value: '30' } })
    // 壓後擔保 70,000 → 需補擔保 1.66×60,000−70,000 = 29,600；或還款 17,831
    expect(await screen.findByText('需補擔保 29,600')).toBeInTheDocument()
    expect(screen.getByText('或還款 17,831')).toBeInTheDocument()
    // 子彈 = 現金 50,000（無 mortgage）；缺口 = 0
    expect(screen.getByText('補繳子彈 50,000')).toBeInTheDocument()
    expect(screen.getByText('資金缺口 0')).toBeInTheDocument()
  })

  it('缺報價：顯示 alert 區塊而非錯誤數字（spec §10）', async () => {
    const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.putInstrument({ symbol: '2330', name: '台積電', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.addPosition({ date: '2026-07-14', accountId, symbol: '2330', qty: 100 })
    render(<Dashboard />)
    expect(await screen.findByRole('alert')).toHaveTextContent('2330')
  })

  it('估值包含快照後的交易（currentHoldings）', async () => {
    await seed() // 0050×1000 @100、現金 50,000、借款 60,000 → NAV 90,000
    const accounts = await repo.listAccounts()
    await repo.addTransaction({ accountId: accounts[0].id!, date: '2026-07-16', symbol: '0050', qty: 500, price: 100, fee: 0, tax: 0 })
    render(<Dashboard />)
    expect(await screen.findByText('140,000')).toBeInTheDocument() // NAV = 150,000 + 50,000 − 60,000
  })

  it('NAV ≤ 0：槓桿倍率顯示 —', async () => {
    const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.addPosition({ date: '2026-07-14', accountId, symbol: '0050', qty: 1000 })
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 100, source: 'auto' })
    await repo.addLoan({
      name: '超貸', kind: 'pledge', balance: 120_000, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [],
    })
    render(<Dashboard />)
    expect(await screen.findByText('—')).toBeInTheDocument()
  })
})
