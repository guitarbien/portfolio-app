import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { repo } from '../data/repo'
import Loans from './Loans'

afterEach(cleanup)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('Loans', () => {
  it('新增質押借款（含擔保品與可編輯門檻）', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await user.type(screen.getByLabelText('借款名稱'), '永豐質押')
    await user.selectOptions(screen.getByLabelText('類型'), 'pledge')
    await user.type(screen.getByLabelText('借款餘額'), '600000')
    await user.type(screen.getByLabelText('年利率 %'), '4')
    await user.clear(screen.getByLabelText('追繳門檻 %'))
    await user.type(screen.getByLabelText('追繳門檻 %'), '140')
    await user.click(screen.getByLabelText('分母含應收利息'))
    await user.type(screen.getByLabelText('擔保品代號'), '0050')
    await user.type(screen.getByLabelText('擔保品股數'), '10000')
    await user.click(screen.getByRole('button', { name: '新增借款' }))
    expect((await repo.listLoans())[0]).toEqual(
      expect.objectContaining({
        name: '永豐質押', kind: 'pledge', balance: 600000, rate: 0.04,
        maintenanceThreshold: 140, restoreThreshold: 166,
        includeInterestInDenominator: true,
        collateral: [{ symbol: '0050', qty: 10000 }],
      }),
    )
  })

  it('mortgage 類型顯示核定額度欄並存入', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await user.type(screen.getByLabelText('借款名稱'), '理財房貸')
    await user.selectOptions(screen.getByLabelText('類型'), 'mortgage')
    await user.type(screen.getByLabelText('借款餘額'), '500000')
    await user.type(screen.getByLabelText('年利率 %'), '2.8')
    await user.type(screen.getByLabelText('核定額度'), '2000000')
    await user.click(screen.getByRole('button', { name: '新增借款' }))
    expect((await repo.listLoans())[0]).toEqual(
      expect.objectContaining({ kind: 'mortgage', creditLimit: 2000000, collateral: [] }),
    )
  })

  it('編輯借款餘額', async () => {
    await repo.addLoan({
      name: '質押A', kind: 'pledge', balance: 60_000, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [],
    })
    const user = userEvent.setup()
    render(<Loans />)
    const input = await screen.findByLabelText('質押A 餘額')
    await user.clear(input)
    await user.type(input, '50000')
    await user.click(screen.getByRole('button', { name: '儲存 質押A 餘額' }))
    expect((await repo.listLoans())[0].balance).toBe(50_000)
  })

  it('刪除借款', async () => {
    await repo.addLoan({
      name: '質押A', kind: 'pledge', balance: 1, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [],
    })
    const user = userEvent.setup()
    render(<Loans />)
    await user.click(await screen.findByRole('button', { name: '刪除 質押A' }))
    expect(await repo.listLoans()).toHaveLength(0)
  })
})
