import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { repo } from '../data/repo'
import ImportWizard from './ImportWizard'

afterEach(cleanup)
beforeEach(async () => {
  localStorage.clear()
  await Promise.all(db.tables.map((t) => t.clear()))
  await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
})

const CSV = [
  '日期,項目,金額',
  '2016/3/5,定期定額,3000',
  '2016/4/1,現金股利,"1,500"',
  '2016/4/2,午餐,120',
  '壞日期,定期定額,3000',
].join('\n')

async function uploadAndMap(user: ReturnType<typeof userEvent.setup>) {
  render(<ImportWizard />)
  // ponytail: findByRole instead of getByRole — Dexie liveQuery fires via setTimeout so
  // accounts are not available synchronously after render; findByRole polls until combobox appears
  await user.selectOptions(await screen.findByRole('combobox', { name: /匯入帳戶/ }), '永豐')
  await user.upload(screen.getByLabelText('選擇 CSV 檔'), new File([CSV], 'ledger.csv', { type: 'text/csv' }))
  await user.selectOptions(await screen.findByLabelText('日期欄'), '日期')
  await user.selectOptions(screen.getByLabelText('金額欄'), '金額')
  await user.selectOptions(screen.getByLabelText('類別欄'), '項目')
  await user.selectOptions(await screen.findByLabelText('類別 定期定額'), '投入')
  await user.selectOptions(screen.getByLabelText('類別 現金股利'), '股利')
  // 午餐維持預設 忽略
  await user.click(screen.getByRole('button', { name: '預覽' }))
}

describe('ImportWizard', () => {
  it('完整流程：上傳→對映→預覽（含錯誤列）→入庫（帶號正確）', async () => {
    const user = userEvent.setup()
    await uploadAndMap(user)
    expect(await screen.findByText('可匯入 2 筆')).toBeInTheDocument()
    expect(screen.getByText(/第 5 列：日期無法解析/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '匯入 2 筆' }))
    expect(await screen.findByText('已匯入 2 筆')).toBeInTheDocument()
    const flows = (await repo.listCashFlows()).sort((a, b) => a.date.localeCompare(b.date))
    expect(flows).toHaveLength(2)
    expect(flows[0]).toEqual(expect.objectContaining({
      date: '2016-03-05', amount: 3000, kind: 'contribution', is_external: true, currency: 'TWD',
    }))
    expect(flows[1]).toEqual(expect.objectContaining({
      date: '2016-04-01', amount: -1500, kind: 'dividend', is_external: true,
    }))
  })

  it('對映設定存入 localStorage 並於同表頭重載', async () => {
    const user = userEvent.setup()
    await uploadAndMap(user)
    const key = 'csvMapping:日期|項目|金額'
    const saved = JSON.parse(localStorage.getItem(key)!)
    expect(saved).toEqual({
      dateCol: '日期', amountCol: '金額', kindCol: '項目',
      kindMap: { 定期定額: '投入', 現金股利: '股利', 午餐: '忽略' },
    })
    cleanup()
    render(<ImportWizard />)
    // ponytail: same findByRole fix — fresh render needs to wait for accounts again
    await user.selectOptions(await screen.findByRole('combobox', { name: /匯入帳戶/ }), '永豐')
    await user.upload(screen.getByLabelText('選擇 CSV 檔'), new File([CSV], 'ledger.csv', { type: 'text/csv' }))
    expect(await screen.findByLabelText('日期欄')).toHaveValue('日期')
    expect(screen.getByLabelText('類別 定期定額')).toHaveValue('投入')
  })
})
