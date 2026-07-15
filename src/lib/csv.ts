export interface CsvResult {
  rows: string[][]
  errors: { line: number; reason: string }[]
}

export function parseCsv(text: string): CsvResult {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  const errors: CsvResult['errors'] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let fieldStartLine = 1

  const endField = () => { row.push(field); field = '' }
  const endRow = () => {
    endField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        if (c === '\n') line++
        field += c
      }
    } else if (c === '"' && field === '') {
      inQuotes = true
      fieldStartLine = line
    } else if (c === ',') {
      endField()
    } else if (c === '\n') {
      endRow(); line++
    } else if (c !== '\r') {
      field += c
    }
  }
  if (inQuotes) {
    errors.push({ line: fieldStartLine, reason: '引號未閉合' })
    return { rows, errors }
  }
  if (field !== '' || row.length > 0) endRow()
  return { rows, errors }
}

export function parseFlexibleDate(s: string): string | undefined {
  const m = s.trim().match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!m) return undefined
  let year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (year < 1900) year += 1911 // 民國年
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return Number.isNaN(Date.parse(iso)) ? undefined : iso
}

export function parseAmount(s: string): number | undefined {
  const cleaned = s.replaceAll(',', '').trim()
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}
