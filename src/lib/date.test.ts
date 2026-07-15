import { describe, it, expect } from 'vitest'
import { today } from './date'

describe('today', () => {
  it('回傳本地 YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const d = new Date()
    expect(today()).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  })
})
