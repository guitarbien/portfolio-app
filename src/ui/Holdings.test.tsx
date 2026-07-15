import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { repo } from '../data/repo'
import Holdings from './Holdings'

afterEach(cleanup)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('Holdings', () => {
  it('新增帳戶後寫入資料庫並出現在帳戶下拉', async () => {
    const user = userEvent.setup()
    render(<Holdings />)
    await user.type(screen.getByLabelText('帳戶名稱'), '永豐')
    await user.type(screen.getByLabelText('券商'), '永豐金')
    await user.selectOptions(screen.getByLabelText('幣別'), 'TWD')
    await user.clear(screen.getByLabelText('現金餘額'))
    await user.type(screen.getByLabelText('現金餘額'), '50000')
    await user.click(screen.getByRole('button', { name: '新增帳戶' }))
    expect(await repo.listAccounts()).toEqual([
      expect.objectContaining({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 50000 }),
    ])
    expect(await screen.findByRole('option', { name: '永豐' })).toBeInTheDocument()
  })

  it('新增持倉同時建立 instrument 與 position，並顯示於列表', async () => {
    await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    const user = userEvent.setup()
    render(<Holdings />)
    await screen.findByRole('option', { name: '永豐' })
    await user.selectOptions(await screen.findByLabelText('帳戶'), '永豐')
    await user.type(screen.getByLabelText('代號'), '00631L')
    await user.type(screen.getByLabelText('名稱'), '元大台灣50正2')
    await user.selectOptions(screen.getByLabelText('市場'), 'TW')
    await user.clear(screen.getByLabelText('槓桿倍數'))
    await user.type(screen.getByLabelText('槓桿倍數'), '2')
    await user.type(screen.getByLabelText('股數'), '1000')
    await user.click(screen.getByRole('button', { name: '新增持倉' }))
    expect((await repo.listInstruments())[0]).toEqual(
      expect.objectContaining({ symbol: '00631L', leverageFactor: 2 }),
    )
    expect((await repo.listPositions())[0]).toEqual(
      expect.objectContaining({ symbol: '00631L', qty: 1000 }),
    )
    expect(await screen.findByText('00631L')).toBeInTheDocument()
  })

  it('刪除持倉', async () => {
    const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.addPosition({ date: '2026-07-14', accountId, symbol: '0050', qty: 1000 })
    const user = userEvent.setup()
    render(<Holdings />)
    await user.click(await screen.findByRole('button', { name: '刪除 0050' }))
    expect(await repo.listPositions()).toHaveLength(0)
  })
})
