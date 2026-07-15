export interface XirrFlow {
  date: string // YYYY-MM-DD
  amount: number // 口袋視角：投入為負、取回與期末 NAV 為正
}

const MS_PER_YEAR = 86_400_000 * 365

export function xirr(flows: XirrFlow[]): number | undefined {
  // 同日加總
  const byDate = new Map<string, number>()
  for (const f of flows) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount)
  const merged = [...byDate.entries()]
    .map(([date, amount]) => ({ t: Date.parse(date), amount }))
    .filter((f) => f.amount !== 0)
    .sort((a, b) => a.t - b.t)
  if (merged.length < 2) return undefined
  const hasPos = merged.some((f) => f.amount > 0)
  const hasNeg = merged.some((f) => f.amount < 0)
  if (!hasPos || !hasNeg) return undefined

  const t0 = merged[0].t
  const items = merged.map((f) => ({ y: (f.t - t0) / MS_PER_YEAR, a: f.amount }))
  const npv = (r: number) => items.reduce((s, f) => s + f.a * (1 + r) ** -f.y, 0)
  const dnpv = (r: number) => items.reduce((s, f) => s - f.y * f.a * (1 + r) ** (-f.y - 1), 0)

  // 牛頓法
  let r = 0.1
  for (let i = 0; i < 50; i++) {
    const v = npv(r)
    if (Math.abs(v) < 1e-9) return r
    const d = dnpv(r)
    if (Math.abs(d) < 1e-12) break
    const next = r - v / d
    if (next <= -1 || !Number.isFinite(next)) break
    r = next
  }

  // bisection fallback：上界倍增找變號
  const lo0 = -0.999999
  let hi = 10
  while (Math.sign(npv(lo0)) === Math.sign(npv(hi))) {
    hi *= 2
    if (hi > 1e6) return undefined
  }
  let lo = lo0
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const v = npv(mid)
    if (Math.abs(v) < 1e-9 || hi - lo < 1e-12) return mid
    if (Math.sign(v) === Math.sign(npv(lo))) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
