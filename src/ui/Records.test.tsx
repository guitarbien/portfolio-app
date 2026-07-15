import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { repo } from '../data/repo'
import Records from './Records'

// 注意：user.type 對 <input type="date"> 不可靠（user-event 已知限制），日期欄一律用 fireEvent.change

afterEach(cleanup)
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
})

describe('Records 交易', () => {
  it('新增交易寫入資料庫並顯示於列表', async () => {
    const user = userEvent.setup()
    render(<Records />)
    await user.selectOptions((await screen.findAllByRole('combobox', { name: /帳戶/ }))[0], '永豐')
    fireEvent.change(screen.getByLabelText('交易日期'), { target: { value: '2026-07-15' } })
    await user.type(screen.getByLabelText('代號'), '0050')
    await user.type(screen.getByLabelText('股數（買正賣負）'), '-100')
    await user.type(screen.getByLabelText('成交價'), '101.5')
    await user.type(screen.getByLabelText('手續費'), '20')
    await user.type(screen.getByLabelText('交易稅'), '30')
    await user.click(screen.getByRole('button', { name: '新增交易' }))
    expect((await repo.listTransactions())[0]).toEqual(
      expect.objectContaining({ symbol: '0050', qty: -100, price: 101.5, fee: 20, tax: 30, date: '2026-07-15' }),
    )
    expect(await screen.findByRole('button', { name: '刪除交易 0050 2026-07-15' })).toBeInTheDocument()
  })

  it('刪除交易', async () => {
    await repo.addTransaction({ accountId: 1, date: '2026-07-15', symbol: '0050', qty: 100, price: 100, fee: 0, tax: 0 })
    const user = userEvent.setup()
    render(<Records />)
    await user.click(await screen.findByRole('button', { name: '刪除交易 0050 2026-07-15' }))
    expect(await repo.listTransactions()).toHaveLength(0)
  })
})

describe('Records 現金流', () => {
  it('新增股利現金流（外部、currency 取帳戶幣別）', async () => {
    const user = userEvent.setup()
    render(<Records />)
    await user.selectOptions((await screen.findAllByRole('combobox', { name: /帳戶/ }))[1], '永豐')
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-07-01' } })
    await user.type(screen.getByLabelText('金額（流入正流出負）'), '-1500')
    await user.selectOptions(screen.getByLabelText('類別'), 'dividend')
    await user.click(screen.getByRole('button', { name: '新增現金流' }))
    expect((await repo.listCashFlows())[0]).toEqual(
      expect.objectContaining({ amount: -1500, kind: 'dividend', is_external: true, currency: 'TWD', date: '2026-07-01' }),
    )
  })

  it('取消外部勾選 → is_external=false', async () => {
    const user = userEvent.setup()
    render(<Records />)
    await user.selectOptions((await screen.findAllByRole('combobox', { name: /帳戶/ }))[1], '永豐')
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-07-01' } })
    await user.type(screen.getByLabelText('金額（流入正流出負）'), '100')
    await user.click(screen.getByLabelText('外部現金流'))
    await user.click(screen.getByRole('button', { name: '新增現金流' }))
    expect((await repo.listCashFlows())[0].is_external).toBe(false)
  })

  it('刪除現金流', async () => {
    await repo.addCashFlow({ accountId: 1, date: '2026-07-01', amount: 500, currency: 'TWD', kind: 'contribution', is_external: true })
    const user = userEvent.setup()
    render(<Records />)
    await user.click(await screen.findByRole('button', { name: '刪除現金流 2026-07-01 500' }))
    expect(await repo.listCashFlows()).toHaveLength(0)
  })
})
