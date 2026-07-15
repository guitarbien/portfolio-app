import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from './data/db'
import App from './App'

vi.mock('./quotes/refresh', () => ({
  refreshQuotes: vi.fn().mockResolvedValue({ updated: [], skipped: [], failed: [] }),
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await Promise.all(db.tables.map((t) => t.clear()))
})

afterEach(cleanup)

describe('App', () => {
  it('預設顯示儀表板，可切換至持倉／借款／設定分頁', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: '儀表板' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '持倉' }))
    expect(screen.getByRole('heading', { name: '持倉' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '借款' }))
    expect(screen.getByRole('heading', { name: '借款' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '紀錄' }))
    expect(screen.getByRole('heading', { name: '紀錄' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '設定' }))
    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument()
  })

  it('開啟時呼叫一次 refreshQuotes', async () => {
    const { refreshQuotes } = await import('./quotes/refresh')
    render(<App />)
    expect(refreshQuotes).toHaveBeenCalledOnce()
  })
})
