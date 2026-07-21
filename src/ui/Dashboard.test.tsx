import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { db } from '../data/db'
import { repo } from '../data/repo'
import Dashboard from './Dashboard'
import { today } from '../lib/date'

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

  it('NAV ≤ 0：槓桿倍率與 XIRR 顯示 —', async () => {
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
    expect(await screen.findAllByText('—')).toHaveLength(2)
  })

  it('NAV ≤ 0 但有提領流量：XIRR 仍顯示負報酬率而非 —', async () => {
    const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.addPosition({ date: '2026-07-14', accountId, symbol: '0050', qty: 1000 })
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-14', close: 100, source: 'auto' })
    await repo.addLoan({
      name: '超貸', kind: 'pledge', balance: 120_000, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [],
    })
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const d1 = new Date()
    d1.setDate(d1.getDate() - 365 * 5)
    const d2 = new Date()
    d2.setDate(d2.getDate() - 365 * 2)
    await repo.addCashFlow({ accountId, date: fmt(d1), amount: 300_000, currency: 'TWD', kind: 'contribution', is_external: true })
    await repo.addCashFlow({ accountId, date: fmt(d2), amount: -250_000, currency: 'TWD', kind: 'withdrawal', is_external: true })
    render(<Dashboard />)
    // nav = 100,000 − 120,000 = −20,000；口袋流量 −300,000 / +250,000 / −20,000 → XIRR 有解（負值，約 −9%）
    expect(await screen.findByText(/-\d+\.\d%/)).toBeInTheDocument()
  })

  it('XIRR 卡：一年前投入 100,000、現值 110,000 → 10.0%', async () => {
    await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 110_000 })
    const d = new Date()
    d.setDate(d.getDate() - 365)
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await repo.addCashFlow({ accountId: 1, date: start, amount: 100_000, currency: 'TWD', kind: 'contribution', is_external: true })
    render(<Dashboard />)
    expect(await screen.findByText('10.0%')).toBeInTheDocument()
    expect(screen.getByText(`自 ${start} 起`)).toBeInTheDocument()
  })

  it('無流量時 XIRR 顯示 —', async () => {
    await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 100 })
    render(<Dashboard />)
    expect((await screen.findAllByText('—')).length).toBeGreaterThanOrEqual(1)
  })

  it('外幣流量缺匯率 → 警示筆數', async () => {
    await repo.addAccount({ name: 'IB', broker: 'IB', currency: 'USD', cashBalance: 0 })
    await repo.addCashFlow({ accountId: 1, date: '2020-01-01', amount: 100, currency: 'USD', kind: 'contribution', is_external: true })
    render(<Dashboard />)
    expect(await screen.findByText(/1 筆外幣流量缺匯率未計入/)).toBeInTheDocument()
  })
})

describe('質押卡狀態色', () => {
  it('維持率高於門檻+15 → status-good', async () => {
    await seed() // 166.7%、門檻 130
    render(<Dashboard />)
    const card = (await screen.findByText('維持率 166.7%')).closest('article')
    expect(card).toHaveClass('status-good')
  })

  it('維持率低於門檻 → status-critical', async () => {
    await seed()
    await repo.upsertPrice({ symbol: '0050', date: today(), close: 70, source: 'manual' }) // 116.7% < 130
    render(<Dashboard />)
    const card = (await screen.findByText('維持率 116.7%')).closest('article')
    expect(card).toHaveClass('status-critical')
  })
})
