import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { repo } from '../data/repo'
import { today } from '../lib/date'
import Settings from './Settings'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

afterEach(cleanup)

describe('Settings', () => {
  it('儲存手動報價：寫入 manual price 並蓋過 auto', async () => {
    await repo.upsertPrice({ symbol: '0050', date: today(), close: 100, source: 'auto' })
    const user = userEvent.setup()
    render(<Settings />)
    await user.type(screen.getByLabelText('報價代號'), '0050')
    await user.type(screen.getByLabelText('收盤價'), '101')
    await user.click(screen.getByRole('button', { name: '儲存手動報價' }))
    const map = await repo.latestEffectivePrices()
    expect(map.get('0050')).toEqual({ close: 101, date: today() })
  })

  it('報價過期標示：有效價日期非今日顯示「過期」', async () => {
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.upsertPrice({ symbol: '0050', date: '2020-01-01', close: 90, source: 'auto' })
    render(<Settings />)
    expect(await screen.findByText('過期')).toBeInTheDocument()
  })

  it('重新抓取報價按鈕顯示更新結果', async () => {
    const refresh = vi.fn().mockResolvedValue({ updated: ['0050', 'USDTWD'], skipped: [], failed: [] })
    const user = userEvent.setup()
    render(<Settings refresh={refresh} />)
    await user.click(screen.getByRole('button', { name: '重新抓取報價' }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(await screen.findByText('更新 2 檔、失敗 0 檔')).toBeInTheDocument()
  })
})
