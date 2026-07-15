import { describe, it, expect } from 'vitest'
import { parseCsv, parseFlexibleDate, parseAmount } from './csv'

describe('parseCsv', () => {
  it('基本逗號分隔與 LF', () => {
    expect(parseCsv('a,b\n1,2\n').rows).toEqual([['a', 'b'], ['1', '2']])
  })
  it('引號欄含逗號與換行、"" 逃逸', () => {
    const r = parseCsv('name,note\n"外食,午餐","說 ""好"" 的"\n')
    expect(r.rows[1]).toEqual(['外食,午餐', '說 "好" 的'])
  })
  it('CRLF 與 BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n').rows).toEqual([['a', 'b'], ['1', '2']])
  })
  it('空行跳過', () => {
    expect(parseCsv('a,b\n\n1,2\n\n').rows).toEqual([['a', 'b'], ['1', '2']])
  })
  it('未閉合引號 → errors 帶行號', () => {
    const r = parseCsv('a,b\n"x,2\n')
    expect(r.errors).toEqual([{ line: 2, reason: '引號未閉合' }])
  })
})

describe('parseFlexibleDate', () => {
  it('ISO 與斜線格式', () => {
    expect(parseFlexibleDate('2016-03-05')).toBe('2016-03-05')
    expect(parseFlexibleDate('2016/3/5')).toBe('2016-03-05')
  })
  it('民國年轉西元', () => {
    expect(parseFlexibleDate('105/3/5')).toBe('2016-03-05')
  })
  it('無法解析 → undefined', () => {
    expect(parseFlexibleDate('三月五日')).toBeUndefined()
    expect(parseFlexibleDate('2016-13-40')).toBeUndefined()
  })
})

describe('parseAmount', () => {
  it('千分位與空白', () => {
    expect(parseAmount('1,234.5')).toBe(1234.5)
    expect(parseAmount(' -3,000 ')).toBe(-3000)
  })
  it('非數字 → undefined', () => {
    expect(parseAmount('abc')).toBeUndefined()
    expect(parseAmount('')).toBeUndefined()
  })
})
