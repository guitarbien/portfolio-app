import { describe, it, expect } from 'vitest'
import { fmtTwd, fmtPct } from './format'

describe('format', () => {
  it('fmtTwd 千分位無小數', () => {
    expect(fmtTwd(1234567.89)).toBe('1,234,568')
    expect(fmtTwd(-20000)).toBe('-20,000')
  })
  it('fmtPct 一位小數', () => {
    expect(fmtPct(166.666)).toBe('166.7%')
    expect(fmtPct(0.22 * 100)).toBe('22.0%')
  })
})
