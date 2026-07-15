const twd = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })

export function fmtTwd(n: number): string {
  return twd.format(n)
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}
