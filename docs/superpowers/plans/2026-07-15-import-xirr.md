# 歷史匯入與 XIRR（Plan 2/4）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用者匯入十年記帳現金流（CSV）後，儀表板顯示十年年化報酬率（XIRR）；並補上紀錄頁（交易/現金流）、美股自動報價、餘額編輯與 Plan 1 記債清理（spec §2.5 的 A3、B2 之 XIRR 半、B3、D 組、E1 之美股半）。

**Architecture:** 沿用 Plan 1 三層：純函式引擎（xirr、xirrInput、currentHoldings）→ Dexie 資料層 v2（新增 transactions/cashFlows 表）→ React UI（新增 紀錄 分頁與匯入精靈）。CSV 解析器手寫（RFC4180 子集，不加依賴）。

**Tech Stack:** 同 Plan 1（React 19 + TS + Vite、Dexie 4、Vitest 3 + Testing Library + fake-indexeddb）。新增外部服務：Twelve Data（美股日收盤，使用者自備免費 key 存 localStorage）。

**本計畫不含**（後續計畫範圍，勿提前實作）：TWR 與每日價格回補管線（Plan 4）、PWA/JSON 備份/部署（Plan 3）、現金餘額由交易自動推導（餘額維持手動編輯欄）。

## Global Constraints

- 全程 TDD：先寫失敗測試 → 驗證失敗 → 最小實作 → 驗證通過 → commit（spec §11）
- 覆蓋率門檻 85% 由 vite.config.ts 強制（勿動門檻、勿用 v8 ignore）；引擎與 adapter 以接近 100% 為準
- 依賴白名單不變：runtime 僅 react/react-dom/dexie/dexie-react-hooks；CSV 解析手寫
- SOLID 落點：UI 只經 `repo` 存取資料（測試檔可 import db 清資料）；引擎純函式無 I/O；報價 adapter 統一 `QuoteResult`、絕不 throw
- 測試不打真實 API；UI 測試檔含 `afterEach(cleanup)`（Plan 1 既定決策）
- UI 文案繁體中文；金額 `fmtTwd`（千分位無小數）、比率 `fmtPct`（1 位小數）
- **帶號約定（本計畫的核心契約）**：`CashFlow.amount` 為**組合視角**——錢進組合為正（投入 +）、錢出組合為負（提領 −、股利匯出交割戶 −）。XIRR 使用**口袋視角**（投入為負、取回與期末 NAV 為正），由 `buildXirrInput` 統一做 `×(−1)` 反轉。除該函式外，任何地方不得再反轉正負號
- 所有檔案以換行符結尾（POSIX）；commit 訊息中文、一事一 commit，結尾附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 工作目錄即 repo 根目錄；現有 71 個測試在每個 task 結束時必須仍全數通過

---

### Task 1: XIRR 引擎

**Files:**
- Create: `src/domain/xirr.ts`
- Test: `src/domain/xirr.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `XirrFlow { date: string; amount: number }`（口袋視角帶號）；`xirr(flows: XirrFlow[]): number | undefined`。演算法：同日流量先加總 → 全同號回 undefined → 牛頓法自 r=0.1 起（最多 50 迭代、容差 1e-9、迭代值 ≤ −1 或導數過小即中止）→ 失敗降級 bisection（下界 −0.999999、上界自 10 倍增至 1e6 找變號，找不到回 undefined）

- [ ] **Step 1: 寫失敗測試**

`src/domain/xirr.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { xirr } from './xirr'

describe('xirr', () => {
  it('基本案例：投入 1000、365 天後值 1100 → 10%', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -1000 },
        { date: '2022-01-01', amount: 1100 },
      ]),
    ).toBeCloseTo(0.1, 6)
  })

  it('深度虧損（牛頓法跳出定義域 → bisection）：1000 剩 10、5 年 → −60.19%', () => {
    // 2020-01-01 → 2024-12-30 = 1825 天 = 5.0 年；(10/1000)^(1/5) − 1 = −0.601893
    expect(
      xirr([
        { date: '2020-01-01', amount: -1000 },
        { date: '2024-12-30', amount: 10 },
      ]),
    ).toBeCloseTo(-0.601893, 5)
  })

  it('多重根（10% 與 15% 皆為根）→ 取最靠近 0 者 10%', () => {
    expect(
      xirr([
        { date: '2020-01-01', amount: -1000 },
        { date: '2020-12-31', amount: 2250 },
        { date: '2021-12-31', amount: -1265 },
      ]),
    ).toBeCloseTo(0.1, 4)
  })

  it('全同號流量無根 → undefined', () => {
    expect(xirr([{ date: '2021-01-01', amount: 100 }, { date: '2022-01-01', amount: 200 }])).toBeUndefined()
  })

  it('空陣列與單筆 → undefined', () => {
    expect(xirr([])).toBeUndefined()
    expect(xirr([{ date: '2021-01-01', amount: -100 }])).toBeUndefined()
  })

  it('同日流量先加總：兩筆 −1000 同日＋一年後 +2200 → 10%', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -1000 },
        { date: '2021-01-01', amount: -1000 },
        { date: '2022-01-01', amount: 2200 },
      ]),
    ).toBeCloseTo(0.1, 6)
  })

  it('同日正負抵銷成全同號 → undefined', () => {
    expect(
      xirr([
        { date: '2021-01-01', amount: -100 },
        { date: '2021-01-01', amount: 100 },
        { date: '2022-01-01', amount: 50 },
      ]),
    ).toBeUndefined()
  })
})
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/domain/xirr.test.ts`
預期：FAIL（`Cannot find module './xirr'`）

- [ ] **Step 3: 最小實作**

`src/domain/xirr.ts`：

```ts
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
```

- [ ] **Step 4: 驗證通過**

執行：`npx vitest run src/domain/xirr.test.ts`
預期：PASS（7 passed）

- [ ] **Step 5: Commit**

```bash
git add src/domain/xirr.ts src/domain/xirr.test.ts
git commit -m "新增 XIRR 引擎（牛頓法＋bisection fallback）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: XIRR 輸入組裝（現金流 → 口袋視角 TWD 流量）

**Files:**
- Create: `src/domain/xirrInput.ts`
- Test: `src/domain/xirrInput.test.ts`

**Interfaces:**
- Consumes: `CashFlow`（types.ts）、`XirrFlow`（Task 1）
- Produces: `buildXirrInput(cashFlows: CashFlow[], nav: number, asOf: string): XirrInputResult`；`XirrInputResult { flows: XirrFlow[], skipped: { date: string; reason: string }[] }`
- 規則：只取 `is_external === true`；TWD 流量 fx=1；外幣流量必須有 `fx_rate`，缺 → 整筆進 skipped；**口袋視角反轉：flow.amount = −cf.amount × fx**；期末追加 `{ date: asOf, amount: nav }`（nav ≤ 0 也照加，xirr 自會處理）；flows 未合併同日（xirr 內部會做）

- [ ] **Step 1: 寫失敗測試**

`src/domain/xirrInput.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildXirrInput } from './xirrInput'
import { xirr } from './xirr'
import type { CashFlow } from './types'

const cf = (over: Partial<CashFlow>): CashFlow => ({
  accountId: 1, date: '2021-01-01', amount: 1000, currency: 'TWD',
  kind: 'contribution', is_external: true, ...over,
})

describe('buildXirrInput', () => {
  it('投入（組合視角 +）反轉為口袋視角 −，期末 NAV 為 +', () => {
    const r = buildXirrInput([cf({ amount: 1000 })], 1100, '2022-01-01')
    expect(r.flows).toEqual([
      { date: '2021-01-01', amount: -1000 },
      { date: '2022-01-01', amount: 1100 },
    ])
    expect(r.skipped).toEqual([])
    expect(xirr(r.flows)).toBeCloseTo(0.1, 6) // 與引擎串起來驗證方向正確
  })

  it('股利匯出（組合視角 −）反轉為口袋視角 +', () => {
    const r = buildXirrInput([cf({ amount: -500, kind: 'dividend', date: '2021-06-01' })], 0, '2022-01-01')
    expect(r.flows[0]).toEqual({ date: '2021-06-01', amount: 500 })
  })

  it('is_external=false 的內部事件不進流量', () => {
    const r = buildXirrInput([cf({ is_external: false })], 100, '2022-01-01')
    expect(r.flows).toEqual([{ date: '2022-01-01', amount: 100 }])
  })

  it('外幣流量以 fx_rate 換算 TWD', () => {
    const r = buildXirrInput([cf({ amount: 100, currency: 'USD', fx_rate: 32 })], 3520, '2022-01-01')
    expect(r.flows[0]).toEqual({ date: '2021-01-01', amount: -3200 })
  })

  it('外幣流量缺 fx_rate → skipped 並附原因', () => {
    const r = buildXirrInput([cf({ amount: 100, currency: 'USD' })], 3520, '2022-01-01')
    expect(r.flows).toEqual([{ date: '2022-01-01', amount: 3520 }])
    expect(r.skipped).toEqual([{ date: '2021-01-01', reason: '外幣流量缺發生日匯率' }])
  })

  it('無外部流量時只剩期末 NAV（xirr 會回 undefined）', () => {
    const r = buildXirrInput([], 100, '2022-01-01')
    expect(r.flows).toHaveLength(1)
    expect(xirr(r.flows)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/domain/xirrInput.test.ts`
預期：FAIL（`Cannot find module './xirrInput'`）

- [ ] **Step 3: 最小實作**

`src/domain/xirrInput.ts`：

```ts
import type { CashFlow } from './types'
import type { XirrFlow } from './xirr'

export interface XirrInputResult {
  flows: XirrFlow[]
  skipped: { date: string; reason: string }[]
}

export function buildXirrInput(cashFlows: CashFlow[], nav: number, asOf: string): XirrInputResult {
  const flows: XirrFlow[] = []
  const skipped: { date: string; reason: string }[] = []
  for (const cf of cashFlows) {
    if (!cf.is_external) continue
    let fx = 1
    if (cf.currency !== 'TWD') {
      if (cf.fx_rate === undefined) {
        skipped.push({ date: cf.date, reason: '外幣流量缺發生日匯率' })
        continue
      }
      fx = cf.fx_rate
    }
    flows.push({ date: cf.date, amount: -cf.amount * fx })
  }
  flows.push({ date: asOf, amount: nav })
  return { flows, skipped }
}
```

- [ ] **Step 4: 驗證通過**

執行：`npx vitest run src/domain/xirrInput.test.ts`
預期：PASS（6 passed）

- [ ] **Step 5: Commit**

```bash
git add src/domain/xirrInput.ts src/domain/xirrInput.test.ts
git commit -m "新增現金流轉 XIRR 輸入的組裝（帶號反轉與外幣換算）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: CSV 解析器與彈性欄位解析

**Files:**
- Create: `src/lib/csv.ts`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `parseCsv(text: string): { rows: string[][], errors: { line: number; reason: string }[] }`——RFC4180 子集：引號欄、`""` 逃逸、CR/CRLF/LF、去 BOM、跳過空行；未閉合引號 → 該起始行號入 errors 且整檔解析中止於該處
  - `parseFlexibleDate(s: string): string | undefined`——接受 `YYYY-MM-DD`、`YYYY/M/D`、民國 `YYY/M/D`（年 < 1900 視為民國 +1911），回 ISO `YYYY-MM-DD`；無法解析回 undefined
  - `parseAmount(s: string): number | undefined`——去千分位逗號與空白後 parseFloat；非有限數回 undefined

- [ ] **Step 1: 寫失敗測試**

`src/lib/csv.test.ts`：

```ts
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
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/lib/csv.test.ts`
預期：FAIL（`Cannot find module './csv'`）

- [ ] **Step 3: 最小實作**

`src/lib/csv.ts`：

```ts
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
```

- [ ] **Step 4: 驗證通過**

執行：`npx vitest run src/lib/csv.test.ts`
預期：PASS（9 passed）

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "新增 CSV 解析器與日期金額彈性解析

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 資料層 v2（現金流/交易 CRUD、快照守衛、餘額更新）

**Files:**
- Modify: `src/data/db.ts`（version(2) 加兩張表）, `src/data/repo.ts`（新方法＋addPosition 守衛）
- Test: `src/data/repo.test.ts`（追加測試，不改既有）

**Interfaces:**
- Consumes: `Transaction`/`CashFlow`（types.ts，Plan 1 已定義）
- Produces（repo 新方法，後續 task 依賴）：
  - `addTransaction/listTransactions/deleteTransaction(id)`
  - `addCashFlow/addCashFlows(rows: CashFlow[])（bulkAdd）/listCashFlows/deleteCashFlow(id)`
  - `updateAccount(id, patch: Partial<Account>)`、`updateLoan(id, patch: Partial<Loan>)`
  - `addPosition` 加守衛：同 (accountId, symbol) 已有快照列 → **reject**（throw `Error('該帳戶已有此標的的開帳快照，後續變動請記在交易紀錄')`）——修 Plan 1 記債「快照日期語意」：快照＝一次性開帳基準，之後只能走交易
- Dexie migration：`this.version(2).stores({ transactions: '++id, symbol', cashFlows: '++id, date' })`，version(1) 原樣保留（既有資料升版安全，只加表）

- [ ] **Step 1: 寫失敗測試（追加到 repo.test.ts 末尾）**

```ts
describe('cashFlows 與 transactions CRUD', () => {
  it('addCashFlows 批次寫入後可讀回、可刪除', async () => {
    await repo.addCashFlows([
      { accountId: 1, date: '2016-03-05', amount: 3000, currency: 'TWD', kind: 'contribution', is_external: true },
      { accountId: 1, date: '2016-04-05', amount: -500, currency: 'TWD', kind: 'dividend', is_external: true },
    ])
    const all = await repo.listCashFlows()
    expect(all).toHaveLength(2)
    await repo.deleteCashFlow(all[0].id!)
    expect(await repo.listCashFlows()).toHaveLength(1)
  })

  it('transaction CRUD', async () => {
    const id = await repo.addTransaction({ accountId: 1, date: '2026-07-15', symbol: '0050', qty: -100, price: 101, fee: 20, tax: 30 })
    expect((await repo.listTransactions())[0].qty).toBe(-100)
    await repo.deleteTransaction(id)
    expect(await repo.listTransactions()).toHaveLength(0)
  })
})

describe('updateAccount / updateLoan', () => {
  it('部分更新現金餘額與借款餘額', async () => {
    const aid = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.updateAccount(aid, { cashBalance: 99_000 })
    expect((await repo.listAccounts())[0].cashBalance).toBe(99_000)
    const lid = await repo.addLoan({
      name: '質押A', kind: 'pledge', balance: 60_000, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [],
    })
    await repo.updateLoan(lid, { balance: 50_000 })
    expect((await repo.listLoans())[0].balance).toBe(50_000)
  })
})

describe('addPosition 快照守衛', () => {
  it('同帳戶同標的重複建快照 → 拒絕', async () => {
    await repo.addPosition({ date: '2026-07-15', accountId: 1, symbol: '0050', qty: 1000 })
    await expect(
      repo.addPosition({ date: '2026-07-16', accountId: 1, symbol: '0050', qty: 500 }),
    ).rejects.toThrow('該帳戶已有此標的的開帳快照')
  })

  it('不同帳戶同標的可各自建快照', async () => {
    await repo.addPosition({ date: '2026-07-15', accountId: 1, symbol: '0050', qty: 1000 })
    await expect(repo.addPosition({ date: '2026-07-15', accountId: 2, symbol: '0050', qty: 300 })).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/data/repo.test.ts`
預期：FAIL（repo 無新方法）

- [ ] **Step 3: 最小實作**

`src/data/db.ts` 的 constructor 內、version(1) 之後加：

```ts
    this.version(2).stores({
      transactions: '++id, symbol',
      cashFlows: '++id, date',
    })
```

並在 class 加表宣告與 import：

```ts
  transactions!: Table<Transaction, number>
  cashFlows!: Table<CashFlow, number>
```

`src/data/repo.ts`——`addPosition` 改為守衛版，並在 repo 物件加新方法：

```ts
  addPosition: async (p: SnapshotPosition) => {
    const dup = await db.positions
      .where('symbol').equals(p.symbol)
      .and((x) => x.accountId === p.accountId)
      .first()
    if (dup) throw new Error('該帳戶已有此標的的開帳快照，後續變動請記在交易紀錄')
    return db.positions.add(p)
  },
  addTransaction: (t: Transaction) => db.transactions.add(t),
  listTransactions: () => db.transactions.toArray(),
  deleteTransaction: (id: number) => db.transactions.delete(id),
  addCashFlow: (c: CashFlow) => db.cashFlows.add(c),
  addCashFlows: (rows: CashFlow[]) => db.cashFlows.bulkAdd(rows),
  listCashFlows: () => db.cashFlows.toArray(),
  deleteCashFlow: (id: number) => db.cashFlows.delete(id),
  updateAccount: (id: number, patch: Partial<Account>) => db.accounts.update(id, patch),
  updateLoan: (id: number, patch: Partial<Loan>) => db.loans.update(id, patch),
```

（import 追加 `Transaction`、`CashFlow`）

- [ ] **Step 4: 驗證通過＋全套**

執行：`npx vitest run src/data/repo.test.ts` → PASS；`npx vitest run` → 全綠（Holdings 既有測試用不同 symbol/account，不受守衛影響）

- [ ] **Step 5: Commit**

```bash
git add src/data/
git commit -m "資料層 v2：現金流與交易表、快照守衛、餘額更新

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: currentHoldings 推導與持倉頁市值欄

**Files:**
- Create: `src/domain/holdings.ts`
- Modify: `src/ui/Dashboard.tsx`（positions 改用 currentHoldings）, `src/ui/Holdings.tsx`（快照守衛錯誤顯示＋「目前持倉」市值表）
- Test: `src/domain/holdings.test.ts`、`src/ui/Holdings.test.tsx`（追加）、`src/ui/Dashboard.test.tsx`（追加一測）

**Interfaces:**
- Consumes: `SnapshotPosition`/`Transaction`（types.ts）、`repo`、`fmtTwd`
- Produces: `Holding { accountId: number; symbol: string; qty: number }`；`currentHoldings(snapshot: SnapshotPosition[], txs: Transaction[]): Holding[]`（key＝accountId+symbol、qty 加總、qty===0 剔除、輸出依 symbol 排序）
- UI 契約：Holdings 頁新增「目前持倉」表（欄：代號/股數/收盤價/市值 TWD；缺價顯示 `—`；表 caption 文字 `目前持倉`）；原快照表 caption `開帳快照` 保留（含刪除鈕）。快照守衛觸發時表單下方顯示 `role="alert"` 錯誤文字。Dashboard 估值改吃 currentHoldings（介面不變，`{symbol, qty}[]` 相容）

- [ ] **Step 1: 寫失敗測試（holdings 引擎）**

`src/domain/holdings.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { currentHoldings } from './holdings'
import type { SnapshotPosition, Transaction } from './types'

const snap = (accountId: number, symbol: string, qty: number): SnapshotPosition =>
  ({ date: '2026-07-15', accountId, symbol, qty })
const tx = (accountId: number, symbol: string, qty: number): Transaction =>
  ({ accountId, date: '2026-07-16', symbol, qty, price: 100, fee: 0, tax: 0 })

describe('currentHoldings', () => {
  it('僅快照', () => {
    expect(currentHoldings([snap(1, '0050', 1000)], [])).toEqual([{ accountId: 1, symbol: '0050', qty: 1000 }])
  })
  it('快照＋買進加總、賣出減少', () => {
    expect(currentHoldings([snap(1, '0050', 1000)], [tx(1, '0050', 500), tx(1, '0050', -200)]))
      .toEqual([{ accountId: 1, symbol: '0050', qty: 1300 }])
  })
  it('賣到 0 → 從清單消失', () => {
    expect(currentHoldings([snap(1, '0050', 100)], [tx(1, '0050', -100)])).toEqual([])
  })
  it('快照後才買進的新標的出現', () => {
    expect(currentHoldings([], [tx(1, '2330', 100)])).toEqual([{ accountId: 1, symbol: '2330', qty: 100 }])
  })
  it('跨帳戶隔離、輸出依 symbol 排序', () => {
    expect(currentHoldings([snap(2, '2330', 50), snap(1, '0050', 10)], [tx(1, '2330', 5)])).toEqual([
      { accountId: 1, symbol: '0050', qty: 10 },
      { accountId: 1, symbol: '2330', qty: 5 },
      { accountId: 2, symbol: '2330', qty: 50 },
    ])
  })
})
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/domain/holdings.test.ts` → FAIL（module not found）

- [ ] **Step 3: 實作引擎**

`src/domain/holdings.ts`：

```ts
import type { SnapshotPosition, Transaction } from './types'

export interface Holding {
  accountId: number
  symbol: string
  qty: number
}

export function currentHoldings(snapshot: SnapshotPosition[], txs: Transaction[]): Holding[] {
  const map = new Map<string, Holding>()
  const bump = (accountId: number, symbol: string, qty: number) => {
    const key = `${accountId}:${symbol}`
    const cur = map.get(key) ?? { accountId, symbol, qty: 0 }
    cur.qty += qty
    map.set(key, cur)
  }
  for (const s of snapshot) bump(s.accountId, s.symbol, s.qty)
  for (const t of txs) bump(t.accountId, t.symbol, t.qty)
  return [...map.values()]
    .filter((h) => h.qty !== 0)
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.accountId - b.accountId)
}
```

執行：`npx vitest run src/domain/holdings.test.ts` → PASS（5 passed）

- [ ] **Step 4: 寫失敗測試（UI）**

`src/ui/Holdings.test.tsx` 追加：

```tsx
  it('目前持倉表顯示市值（快照＋交易合併），缺價顯示 —', async () => {
    const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.putInstrument({ symbol: '2330', name: '台積電', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.addPosition({ date: '2026-07-15', accountId, symbol: '0050', qty: 1000 })
    await repo.addTransaction({ accountId, date: '2026-07-16', symbol: '0050', qty: 500, price: 100, fee: 0, tax: 0 })
    await repo.addTransaction({ accountId, date: '2026-07-16', symbol: '2330', qty: 10, price: 900, fee: 0, tax: 0 })
    await repo.upsertPrice({ symbol: '0050', date: '2026-07-16', close: 100, source: 'manual' })
    render(<Holdings />)
    expect(await screen.findByText('150,000')).toBeInTheDocument() // 1500 × 100
    expect(screen.getByText('—')).toBeInTheDocument() // 2330 缺價
  })

  it('重複建快照顯示守衛錯誤', async () => {
    const accountId = await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    await repo.addPosition({ date: '2026-07-15', accountId, symbol: '0050', qty: 1000 })
    const user = userEvent.setup()
    render(<Holdings />)
    await user.selectOptions(await screen.findByRole('combobox', { name: /帳戶/ }), '永豐')
    await user.type(screen.getByLabelText('代號'), '0050')
    await user.type(screen.getByLabelText('名稱'), '元大台灣50')
    await user.type(screen.getByLabelText('股數'), '100')
    await user.click(screen.getByRole('button', { name: '新增持倉' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('該帳戶已有此標的的開帳快照')
  })
```

（注意：`getByRole('combobox', { name: /帳戶/ })` 用正則因為 `<label>帳戶<select>` 的 accessible name 含當前選項文字。）

`src/ui/Dashboard.test.tsx` 追加：

```tsx
  it('估值包含快照後的交易（currentHoldings）', async () => {
    await seed() // 0050×1000 @100、現金 50,000、借款 60,000 → NAV 90,000
    const accounts = await repo.listAccounts()
    await repo.addTransaction({ accountId: accounts[0].id!, date: '2026-07-16', symbol: '0050', qty: 500, price: 100, fee: 0, tax: 0 })
    render(<Dashboard />)
    expect(await screen.findByText('140,000')).toBeInTheDocument() // NAV = 150,000 + 50,000 − 60,000
  })
```

- [ ] **Step 5: 驗證失敗 → 實作 UI**

`src/ui/Dashboard.tsx`：useLiveQuery 內追加 `repo.listTransactions()`，`valuate` 的 `positions` 改為 `currentHoldings(data.positions, data.transactions)`。

`src/ui/Holdings.tsx`：
- 表單 submit 包 try/catch：`catch (e) { setError(e instanceof Error ? e.message : String(e)) }`，錯誤以 `{error && <p role="alert">{error}</p>}` 顯示，成功時清空
- useLiveQuery 追加 transactions 與 `repo.latestEffectivePrices()`、`repo.latestUsdTwd()`、instruments
- 新增「目前持倉」表：

```tsx
      <table>
        <caption>目前持倉</caption>
        <thead><tr><th>代號</th><th>股數</th><th>收盤價</th><th>市值 TWD</th></tr></thead>
        <tbody>
          {holdings.map((h) => {
            const quote = prices.get(h.symbol)
            const inst = instrumentMap.get(h.symbol)
            const fx = inst?.currency === 'USD' ? usdTwd : 1
            const mv = quote && fx !== undefined ? h.qty * quote.close * fx : undefined
            return (
              <tr key={`${h.accountId}:${h.symbol}`}>
                <td>{h.symbol}</td>
                <td>{h.qty}</td>
                <td>{quote ? quote.close : '—'}</td>
                <td>{mv !== undefined ? fmtTwd(mv) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
```

原快照表加 `<caption>開帳快照</caption>`。

- [ ] **Step 6: 驗證通過＋全套**

執行：`npx vitest run src/ui/ src/domain/holdings.test.ts` → PASS；`npx vitest run` → 全綠

- [ ] **Step 7: Commit**

```bash
git add src/domain/holdings.ts src/domain/holdings.test.ts src/ui/
git commit -m "新增 currentHoldings 推導與持倉頁市值欄

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 紀錄頁（交易與現金流 CRUD）

**Files:**
- Create: `src/ui/Records.tsx`
- Modify: `src/App.tsx`（TABS 加 `{ key: 'records', label: '紀錄', view: <Records /> }`，位置在借款之後、設定之前）, `src/App.test.tsx`（分頁測試加 紀錄）
- Test: `src/ui/Records.test.tsx`

**Interfaces:**
- Consumes: `repo`（Task 4 全部新方法）、`today()`、`useLiveQuery`
- Produces: `<Records />` default export。**表單 label（測試逐字取用）**：交易＝`帳戶`/`交易日期`/`代號`/`股數（買正賣負）`/`成交價`/`手續費`/`交易稅`，按鈕 `新增交易`；現金流＝`帳戶`/`日期`/`金額（流入正流出負）`/`類別`/`外部現金流`，按鈕 `新增現金流`。類別 select options：`contribution` 投入/`withdrawal` 提領/`dividend` 股利/`interest` 利息/`fee` 費用/`transfer` 轉帳。外部現金流 checkbox 預設勾選。列表刪除鈕 aria-label：交易 `刪除交易 {symbol} {date}`、現金流 `刪除現金流 {date} {amount}`
- 幣別：現金流 currency 取所選帳戶的 currency；交易不帶幣別（估值用 instrument.currency）

- [ ] **Step 1: 寫失敗測試**

`src/ui/Records.test.tsx`：

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { repo } from '../data/repo'
import Records from './Records'

// 注意：user.type 對 <input type="date"> 不可靠（user-event 已知限制），日期欄一律用 fireEvent.change

afterEach(cleanup)
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 0 })
})

describe('Records 交易', () => {
  it('新增交易寫入資料庫並顯示於列表', async () => {
    const user = userEvent.setup()
    render(<Records />)
    await user.selectOptions((await screen.findAllByRole('combobox', { name: /帳戶/ }))[0], '永豐')
    fireEvent.change(screen.getByLabelText('交易日期'), { target: { value: '2026-07-15' } })
    await user.type(screen.getByLabelText('代號'), '0050')
    await user.type(screen.getByLabelText('股數（買正賣負）'), '-100')
    await user.type(screen.getByLabelText('成交價'), '101.5')
    await user.type(screen.getByLabelText('手續費'), '20')
    await user.type(screen.getByLabelText('交易稅'), '30')
    await user.click(screen.getByRole('button', { name: '新增交易' }))
    expect((await repo.listTransactions())[0]).toEqual(
      expect.objectContaining({ symbol: '0050', qty: -100, price: 101.5, fee: 20, tax: 30, date: '2026-07-15' }),
    )
    expect(await screen.findByRole('button', { name: '刪除交易 0050 2026-07-15' })).toBeInTheDocument()
  })

  it('刪除交易', async () => {
    await repo.addTransaction({ accountId: 1, date: '2026-07-15', symbol: '0050', qty: 100, price: 100, fee: 0, tax: 0 })
    const user = userEvent.setup()
    render(<Records />)
    await user.click(await screen.findByRole('button', { name: '刪除交易 0050 2026-07-15' }))
    expect(await repo.listTransactions()).toHaveLength(0)
  })
})

describe('Records 現金流', () => {
  it('新增股利現金流（外部、currency 取帳戶幣別）', async () => {
    const user = userEvent.setup()
    render(<Records />)
    await user.selectOptions((await screen.findAllByRole('combobox', { name: /帳戶/ }))[1], '永豐')
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-07-01' } })
    await user.type(screen.getByLabelText('金額（流入正流出負）'), '-1500')
    await user.selectOptions(screen.getByLabelText('類別'), 'dividend')
    await user.click(screen.getByRole('button', { name: '新增現金流' }))
    expect((await repo.listCashFlows())[0]).toEqual(
      expect.objectContaining({ amount: -1500, kind: 'dividend', is_external: true, currency: 'TWD', date: '2026-07-01' }),
    )
  })

  it('取消外部勾選 → is_external=false', async () => {
    const user = userEvent.setup()
    render(<Records />)
    await user.selectOptions((await screen.findAllByRole('combobox', { name: /帳戶/ }))[1], '永豐')
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-07-01' } })
    await user.type(screen.getByLabelText('金額（流入正流出負）'), '100')
    await user.click(screen.getByLabelText('外部現金流'))
    await user.click(screen.getByRole('button', { name: '新增現金流' }))
    expect((await repo.listCashFlows())[0].is_external).toBe(false)
  })

  it('刪除現金流', async () => {
    await repo.addCashFlow({ accountId: 1, date: '2026-07-01', amount: 500, currency: 'TWD', kind: 'contribution', is_external: true })
    const user = userEvent.setup()
    render(<Records />)
    await user.click(await screen.findByRole('button', { name: '刪除現金流 2026-07-01 500' }))
    expect(await repo.listCashFlows()).toHaveLength(0)
  })
})
```

`src/App.test.tsx` 分頁測試中，借款之後追加：

```tsx
    await user.click(screen.getByRole('tab', { name: '紀錄' }))
    expect(screen.getByRole('heading', { name: '紀錄' })).toBeInTheDocument()
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/ui/Records.test.tsx src/App.test.tsx` → FAIL

- [ ] **Step 3: 最小實作**

`src/ui/Records.tsx`：

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import { today } from '../lib/date'
import type { CashFlow } from '../domain/types'

const KINDS: { value: CashFlow['kind']; label: string }[] = [
  { value: 'contribution', label: '投入' },
  { value: 'withdrawal', label: '提領' },
  { value: 'dividend', label: '股利' },
  { value: 'interest', label: '利息' },
  { value: 'fee', label: '費用' },
  { value: 'transfer', label: '轉帳' },
]

export default function Records() {
  const accounts = useLiveQuery(repo.listAccounts, [], [])
  const txs = useLiveQuery(repo.listTransactions, [], [])
  const flows = useLiveQuery(repo.listCashFlows, [], [])

  const [tx, setTx] = useState({ accountId: '', date: today(), symbol: '', qty: '', price: '', fee: '0', tax: '0' })
  const [cf, setCf] = useState({ accountId: '', date: today(), amount: '', kind: 'contribution' as CashFlow['kind'], external: true })

  const addTx = async (e: React.FormEvent) => {
    e.preventDefault()
    await repo.addTransaction({
      accountId: Number(tx.accountId), date: tx.date, symbol: tx.symbol,
      qty: Number(tx.qty), price: Number(tx.price), fee: Number(tx.fee), tax: Number(tx.tax),
    })
    setTx({ ...tx, symbol: '', qty: '', price: '' })
  }

  const addCf = async (e: React.FormEvent) => {
    e.preventDefault()
    const account = accounts.find((a) => a.id === Number(cf.accountId))
    await repo.addCashFlow({
      accountId: Number(cf.accountId), date: cf.date, amount: Number(cf.amount),
      currency: account?.currency ?? 'TWD', kind: cf.kind, is_external: cf.external,
    })
    setCf({ ...cf, amount: '' })
  }

  const accountSelect = (value: string, onChange: (v: string) => void) => (
    <label>帳戶<select value={value} required onChange={(e) => onChange(e.target.value)}>
      <option value="">選擇帳戶</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select></label>
  )

  return (
    <section>
      <h2>紀錄</h2>

      <h3>交易</h3>
      <form onSubmit={addTx}>
        {accountSelect(tx.accountId, (v) => setTx({ ...tx, accountId: v }))}
        <label>交易日期<input type="date" value={tx.date} required onChange={(e) => setTx({ ...tx, date: e.target.value })} /></label>
        <label>代號<input value={tx.symbol} required onChange={(e) => setTx({ ...tx, symbol: e.target.value })} /></label>
        <label>股數（買正賣負）<input type="number" value={tx.qty} required onChange={(e) => setTx({ ...tx, qty: e.target.value })} /></label>
        <label>成交價<input type="number" step="0.01" value={tx.price} required onChange={(e) => setTx({ ...tx, price: e.target.value })} /></label>
        <label>手續費<input type="number" value={tx.fee} onChange={(e) => setTx({ ...tx, fee: e.target.value })} /></label>
        <label>交易稅<input type="number" value={tx.tax} onChange={(e) => setTx({ ...tx, tax: e.target.value })} /></label>
        <button type="submit">新增交易</button>
      </form>
      <ul>
        {txs.map((t) => (
          <li key={t.id}>
            {t.date} {t.symbol} {t.qty > 0 ? '買' : '賣'} {Math.abs(t.qty)} @ {t.price}
            <button aria-label={`刪除交易 ${t.symbol} ${t.date}`} onClick={() => repo.deleteTransaction(t.id!)}>刪除</button>
          </li>
        ))}
      </ul>

      <h3>現金流</h3>
      <form onSubmit={addCf}>
        {accountSelect(cf.accountId, (v) => setCf({ ...cf, accountId: v }))}
        <label>日期<input type="date" value={cf.date} required onChange={(e) => setCf({ ...cf, date: e.target.value })} /></label>
        <label>金額（流入正流出負）<input type="number" step="0.01" value={cf.amount} required onChange={(e) => setCf({ ...cf, amount: e.target.value })} /></label>
        <label>類別<select value={cf.kind} onChange={(e) => setCf({ ...cf, kind: e.target.value as CashFlow['kind'] })}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select></label>
        <label>外部現金流<input type="checkbox" checked={cf.external} onChange={(e) => setCf({ ...cf, external: e.target.checked })} /></label>
        <button type="submit">新增現金流</button>
      </form>
      <ul>
        {flows.map((f) => (
          <li key={f.id}>
            {f.date} {KINDS.find((k) => k.value === f.kind)?.label} {f.amount} {f.currency}
            <button aria-label={`刪除現金流 ${f.date} ${f.amount}`} onClick={() => repo.deleteCashFlow(f.id!)}>刪除</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

`src/App.tsx` TABS 插入 `{ key: 'records', label: '紀錄', view: <Records /> }`（借款後、設定前）＋ import。

- [ ] **Step 4: 驗證通過＋全套**

執行：`npx vitest run src/ui/Records.test.tsx src/App.test.tsx` → PASS；`npx vitest run` → 全綠

- [ ] **Step 5: Commit**

```bash
git add src/ui/Records.tsx src/ui/Records.test.tsx src/App.tsx src/App.test.tsx
git commit -m "新增紀錄頁（交易與現金流 CRUD）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: CSV 匯入精靈

**Files:**
- Create: `src/ui/ImportWizard.tsx`
- Modify: `src/ui/Records.tsx`（頁尾嵌入 `<ImportWizard />`）
- Test: `src/ui/ImportWizard.test.tsx`

**Interfaces:**
- Consumes: `parseCsv`/`parseFlexibleDate`/`parseAmount`（Task 3）、`repo`（listAccounts、addCashFlows）
- Produces: `<ImportWizard />` default export。三步狀態機：
  1. **上傳**：`<input type="file" aria-label="選擇 CSV 檔">`＋帳戶 select（label `匯入帳戶`）。讀檔 `file.text()` → `parseCsv`；首列＝表頭
  2. **對映**：三個 select——`日期欄`/`金額欄`/`類別欄`（選項為表頭欄名；類別欄多一個選項 `無`）。選了類別欄 → 列出該欄 distinct 值，每值一個 select（aria-label `類別 {值}`，選項：`投入`/`股利`/`提領`/`忽略`，預設 忽略）。按鈕 `預覽`。對映設定以 `localStorage['csvMapping:' + headers.join('|')]` 存 JSON `{ dateCol, amountCol, kindCol, kindMap }`，再次匯入同表頭自動帶入
  3. **預覽**：逐列解析——日期 `parseFlexibleDate`、金額 `parseAmount`、類別對映（忽略 → 跳過不算錯誤）。**帶號規則：投入 → +|金額|、股利 → −|金額|、提領 → −|金額|**（組合視角，見 Global Constraints）。錯誤列（日期或金額無法解析）以 `第 {n} 列：{原因}` 列出（n 為含表頭的實際列號）。顯示 `可匯入 {m} 筆`；按鈕 `匯入 {m} 筆` → `repo.addCashFlows`（currency＝所選帳戶幣別、is_external=true、kind 依對映）→ 顯示 `已匯入 {m} 筆`
- 匯入的股利記為外部流出（−），符合台股股利匯入交割銀行帳戶＝出組合邊界的語意（spec §5 邊界規則）

- [ ] **Step 1: 寫失敗測試**

`src/ui/ImportWizard.test.tsx`：

```tsx
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
  await user.selectOptions(screen.getByRole('combobox', { name: /匯入帳戶/ }), '永豐')
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
    await user.selectOptions(screen.getByRole('combobox', { name: /匯入帳戶/ }), '永豐')
    await user.upload(screen.getByLabelText('選擇 CSV 檔'), new File([CSV], 'ledger.csv', { type: 'text/csv' }))
    expect(await screen.findByLabelText('日期欄')).toHaveValue('日期')
    expect(screen.getByLabelText('類別 定期定額')).toHaveValue('投入')
  })
})
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/ui/ImportWizard.test.tsx` → FAIL（module not found）

- [ ] **Step 3: 最小實作**

`src/ui/ImportWizard.tsx`：

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../data/repo'
import { parseCsv, parseFlexibleDate, parseAmount } from '../lib/csv'
import type { CashFlow } from '../domain/types'

const KIND_OPTIONS = ['投入', '股利', '提領', '忽略'] as const
type KindLabel = (typeof KIND_OPTIONS)[number]
const KIND_TO_CASHFLOW: Record<Exclude<KindLabel, '忽略'>, { kind: CashFlow['kind']; sign: 1 | -1 }> = {
  投入: { kind: 'contribution', sign: 1 },
  股利: { kind: 'dividend', sign: -1 },
  提領: { kind: 'withdrawal', sign: -1 },
}

interface Mapping {
  dateCol: string
  amountCol: string
  kindCol: string // '無' 表示不用類別欄
  kindMap: Record<string, KindLabel>
}

export default function ImportWizard() {
  const accounts = useLiveQuery(repo.listAccounts, [], [])
  const [accountId, setAccountId] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [csvErrors, setCsvErrors] = useState<{ line: number; reason: string }[]>([])
  const [map, setMap] = useState<Mapping>({ dateCol: '', amountCol: '', kindCol: '無', kindMap: {} })
  const [preview, setPreview] = useState<{ valid: CashFlow[]; errors: string[] } | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const storageKey = (h: string[]) => `csvMapping:${h.join('|')}`

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const parsed = parseCsv(await file.text())
    setCsvErrors(parsed.errors)
    const [head, ...body] = parsed.rows
    setHeaders(head ?? [])
    setRows(body)
    setPreview(null)
    setDone(null)
    const saved = localStorage.getItem(storageKey(head ?? []))
    if (saved) setMap(JSON.parse(saved))
    else setMap({ dateCol: '', amountCol: '', kindCol: '無', kindMap: {} })
  }

  const col = (name: string) => headers.indexOf(name)
  const distinctKinds = map.kindCol !== '無' && col(map.kindCol) >= 0
    ? [...new Set(rows.map((r) => r[col(map.kindCol)] ?? ''))]
    : []

  const buildPreview = () => {
    localStorage.setItem(storageKey(headers), JSON.stringify({
      ...map,
      kindMap: Object.fromEntries(distinctKinds.map((k) => [k, map.kindMap[k] ?? '忽略'])),
    }))
    const account = accounts.find((a) => a.id === Number(accountId))
    const valid: CashFlow[] = []
    const errors: string[] = []
    rows.forEach((r, i) => {
      const lineNo = i + 2 // 含表頭的實際列號
      const kindLabel: KindLabel = map.kindCol === '無' ? '投入' : (map.kindMap[r[col(map.kindCol)]] ?? '忽略')
      if (kindLabel === '忽略') return
      const date = parseFlexibleDate(r[col(map.dateCol)] ?? '')
      if (!date) { errors.push(`第 ${lineNo} 列：日期無法解析`); return }
      const amount = parseAmount(r[col(map.amountCol)] ?? '')
      if (amount === undefined) { errors.push(`第 ${lineNo} 列：金額無法解析`); return }
      const { kind, sign } = KIND_TO_CASHFLOW[kindLabel]
      valid.push({
        accountId: Number(accountId), date, amount: sign * Math.abs(amount),
        currency: account?.currency ?? 'TWD', kind, is_external: true,
      })
    })
    setPreview({ valid, errors })
  }

  const doImport = async () => {
    if (!preview) return
    await repo.addCashFlows(preview.valid)
    setDone(preview.valid.length)
  }

  return (
    <section>
      <h3>匯入記帳 CSV</h3>
      <label>匯入帳戶<select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        <option value="">選擇帳戶</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>
      <label>選擇 CSV 檔<input type="file" accept=".csv,text/csv" onChange={onFile} /></label>
      {csvErrors.map((e) => <p key={e.line} role="alert">第 {e.line} 列：{e.reason}</p>)}

      {headers.length > 0 && (
        <>
          {(['日期欄', '金額欄', '類別欄'] as const).map((label) => {
            const field = label === '日期欄' ? 'dateCol' : label === '金額欄' ? 'amountCol' : 'kindCol'
            return (
              <label key={label}>{label}
                <select value={map[field]} onChange={(e) => setMap({ ...map, [field]: e.target.value })}>
                  {label === '類別欄' && <option value="無">無</option>}
                  {label !== '類別欄' && <option value="">選擇欄位</option>}
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            )
          })}
          {distinctKinds.map((k) => (
            <label key={k}>類別 {k}
              <select value={map.kindMap[k] ?? '忽略'}
                onChange={(e) => setMap({ ...map, kindMap: { ...map.kindMap, [k]: e.target.value as KindLabel } })}>
                {KIND_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
          <button type="button" disabled={!map.dateCol || !map.amountCol || !accountId} onClick={buildPreview}>預覽</button>
        </>
      )}

      {preview && done === null && (
        <>
          {preview.errors.map((e) => <p key={e} role="alert">{e}</p>)}
          <p>可匯入 {preview.valid.length} 筆</p>
          <button type="button" onClick={doImport}>匯入 {preview.valid.length} 筆</button>
        </>
      )}
      {done !== null && <p>已匯入 {done} 筆</p>}
    </section>
  )
}
```

`src/ui/Records.tsx`：頁尾（現金流列表之後）加 `<ImportWizard />`＋import。

- [ ] **Step 4: 驗證通過＋全套**

執行：`npx vitest run src/ui/ImportWizard.test.tsx` → PASS；`npx vitest run` → 全綠

- [ ] **Step 5: Commit**

```bash
git add src/ui/ImportWizard.tsx src/ui/ImportWizard.test.tsx src/ui/Records.tsx
git commit -m "新增記帳 CSV 匯入精靈（欄位對映、逐列驗證、對映記憶）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Twelve Data 美股報價與 refresh 整合

**Files:**
- Create: `src/quotes/twelveData.ts`
- Modify: `src/quotes/refresh.ts`（US 迴圈＋deps 擴充）, `src/ui/Settings.tsx`（API key 欄位）
- Test: `src/quotes/twelveData.test.ts`、`src/quotes/refresh.test.ts`（改既有＋追加）、`src/ui/Settings.test.tsx`（追加）

**Interfaces:**
- Consumes: `QuoteResult`（twse.ts）、`Price`（types.ts）、`repo`
- Produces:
  - `fetchTwelveClose(symbol: string, apiKey: string, fetchFn?: typeof fetch): Promise<QuoteResult<Price>>`——GET `https://api.twelvedata.com/time_series?symbol={s}&interval=1day&outputsize=1&apikey={k}`；成功 body `{ values: [{ datetime: 'YYYY-MM-DD', close: '314.81' }], status: 'ok' }`；API 錯誤 body `{ code, message, status: 'error' }` → `{ ok: false, reason: message }`；不 throw
  - `RefreshDeps` 擴充：`fetchUs: typeof fetchTwelveClose`、`getUsKey: () => string | null`（預設 `() => localStorage.getItem('twelveDataApiKey')`）
  - refresh 規則：US instruments——無 key → 全部記 failed（reason `未設定 Twelve Data API key`）且不呼叫 fetchUs；有 key → 缺當日價才抓，同 TW 的 skip/updated/failed 邏輯
  - Settings：label `Twelve Data API key` 的 input＋按鈕 `儲存 API key` → `localStorage.setItem('twelveDataApiKey', value)`

- [ ] **Step 1: 寫失敗測試（adapter）**

`src/quotes/twelveData.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { fetchTwelveClose } from './twelveData'

const okBody = { values: [{ datetime: '2026-07-14', close: '314.81' }], status: 'ok' }
const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('fetchTwelveClose', () => {
  it('解析日線收盤', async () => {
    const r = await fetchTwelveClose('VOO', 'k', fakeFetch(okBody))
    expect(r).toEqual({ ok: true, value: { symbol: 'VOO', date: '2026-07-14', close: 314.81, source: 'auto' } })
  })
  it('API 錯誤 body → ok:false 帶 message', async () => {
    const r = await fetchTwelveClose('VOO', 'bad', fakeFetch({ code: 401, message: 'Invalid api key', status: 'error' }))
    expect(r).toEqual({ ok: false, reason: 'Invalid api key' })
  })
  it('缺 values → ok:false', async () => {
    expect((await fetchTwelveClose('VOO', 'k', fakeFetch({ status: 'ok' }))).ok).toBe(false)
  })
  it('HTTP 錯誤與 fetch rejects → ok:false 不 throw', async () => {
    expect((await fetchTwelveClose('VOO', 'k', fakeFetch({}, 500))).ok).toBe(false)
    const rejecting = (async () => { throw new Error('network down') }) as unknown as typeof fetch
    expect(await fetchTwelveClose('VOO', 'k', rejecting)).toEqual({ ok: false, reason: 'network down' })
  })
  it('close 無法解析 → ok:false', async () => {
    const r = await fetchTwelveClose('VOO', 'k', fakeFetch({ values: [{ datetime: '2026-07-14', close: 'N/A' }], status: 'ok' }))
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: 改寫 refresh 測試**

`src/quotes/refresh.test.ts`——`deps()` helper 擴充；既有三測改斷言；追加兩測：

```ts
// deps helper 改為：
const deps = (over: Partial<RefreshDeps> = {}): RefreshDeps => ({
  fetchTwse: async (s: string) => priceOk(s),
  fetchFx: async () => fxOk,
  fetchUs: async (s: string) => priceOk(s),
  getUsKey: () => 'test-key',
  now: () => NOW,
  ...over,
})

// 既有「只抓台股」測試改名並改斷言為：TW 與 US 都更新
//   expect(report.updated.sort()).toEqual(['0050', 'USDTWD', 'VOO'])
// 既有「當日已有價則跳過」測試：seed 加 VOO 當日價，斷言 skipped 含 VOO
//   await repo.upsertPrice({ symbol: 'VOO', date: NOW, close: 500, source: 'auto' })
//   expect(report.skipped.sort()).toEqual(['0050', 'USDTWD', 'VOO'])

// 追加：
it('無 API key → US 全記 failed 且不呼叫 fetchUs', async () => {
  let called = 0
  const report = await refreshQuotes(deps({
    getUsKey: () => null,
    fetchUs: async (s: string) => { called++; return priceOk(s) },
  }))
  expect(called).toBe(0)
  expect(report.failed).toContainEqual({ symbol: 'VOO', reason: '未設定 Twelve Data API key' })
  expect(report.updated).toContain('0050')
})

it('US 單檔失敗不影響 TW', async () => {
  const report = await refreshQuotes(deps({
    fetchUs: async () => ({ ok: false as const, reason: 'HTTP 429' }),
  }))
  expect(report.failed).toContainEqual({ symbol: 'VOO', reason: 'HTTP 429' })
  expect(report.updated).toContain('0050')
})
```

- [ ] **Step 3: 驗證失敗**

執行：`npx vitest run src/quotes/` → FAIL

- [ ] **Step 4: 最小實作**

`src/quotes/twelveData.ts`：

```ts
import type { Price } from '../domain/types'
import type { QuoteResult } from './twse'

export async function fetchTwelveClose(symbol: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<QuoteResult<Price>> {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=1&apikey=${encodeURIComponent(apiKey)}`
    const res = await fetchFn(url)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = (await res.json()) as { status?: string; message?: string; values?: { datetime: string; close: string }[] }
    if (body.status === 'error') return { ok: false, reason: body.message ?? 'API 錯誤' }
    const last = body.values?.[0]
    if (!last) return { ok: false, reason: '回應缺少 values' }
    const close = Number(last.close)
    if (!Number.isFinite(close)) return { ok: false, reason: `收盤價無法解析：${last.close}` }
    return { ok: true, value: { symbol, date: last.datetime, close, source: 'auto' } }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
```

`src/quotes/refresh.ts`——deps 擴充與 US 迴圈：

```ts
import { fetchTwelveClose } from './twelveData'

export interface RefreshDeps {
  fetchTwse: typeof fetchTwseClose
  fetchFx: typeof fetchUsdTwd
  fetchUs: typeof fetchTwelveClose
  getUsKey: () => string | null
  now: () => string
}

const defaults: RefreshDeps = {
  fetchTwse: fetchTwseClose,
  fetchFx: fetchUsdTwd,
  fetchUs: fetchTwelveClose,
  getUsKey: () => localStorage.getItem('twelveDataApiKey'),
  now: today,
}
```

TW 迴圈之後、匯率之前加：

```ts
  const usKey = deps.getUsKey()
  for (const inst of instruments.filter((i) => i.market === 'US')) {
    if (prices.get(inst.symbol)?.date === deps.now()) {
      report.skipped.push(inst.symbol)
      continue
    }
    if (!usKey) {
      report.failed.push({ symbol: inst.symbol, reason: '未設定 Twelve Data API key' })
      continue
    }
    const r = await deps.fetchUs(inst.symbol, usKey)
    if (r.ok) {
      await repo.upsertPrice(r.value)
      report.updated.push(inst.symbol)
    } else {
      report.failed.push({ symbol: inst.symbol, reason: r.reason })
    }
  }
```

`src/ui/Settings.tsx` 加（手動報價表單之後）：

```tsx
      <form onSubmit={(e) => { e.preventDefault(); localStorage.setItem('twelveDataApiKey', usKey) }}>
        <label>Twelve Data API key<input value={usKey} onChange={(e) => setUsKey(e.target.value)} /></label>
        <button type="submit">儲存 API key</button>
      </form>
```

（state：`const [usKey, setUsKey] = useState(localStorage.getItem('twelveDataApiKey') ?? '')`）

`src/ui/Settings.test.tsx` 追加：

```tsx
  it('儲存 Twelve Data API key 至 localStorage', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.type(screen.getByLabelText('Twelve Data API key'), 'abc123')
    await user.click(screen.getByRole('button', { name: '儲存 API key' }))
    expect(localStorage.getItem('twelveDataApiKey')).toBe('abc123')
  })
```

（Settings.test 的 beforeEach 需加 `localStorage.clear()`。）

- [ ] **Step 5: 驗證通過＋全套**

執行：`npx vitest run src/quotes/ src/ui/Settings.test.tsx` → PASS；`npx vitest run` → 全綠

- [ ] **Step 6: Commit**

```bash
git add src/quotes/ src/ui/Settings.tsx src/ui/Settings.test.tsx
git commit -m "新增 Twelve Data 美股報價與補抓整合

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 儀表板 XIRR 卡與餘額編輯

**Files:**
- Modify: `src/ui/Dashboard.tsx`（XIRR 卡）, `src/ui/Holdings.tsx`（帳戶現金餘額編輯）, `src/ui/Loans.tsx`（借款餘額編輯）
- Test: `src/ui/Dashboard.test.tsx`、`src/ui/Holdings.test.tsx`、`src/ui/Loans.test.tsx`（各追加）

**Interfaces:**
- Consumes: `xirr`/`buildXirrInput`（Task 1/2）、`repo.listCashFlows`/`updateAccount`/`updateLoan`（Task 4）
- Produces（畫面契約）：
  - Dashboard `<dl>` 追加：`<dt>年化報酬率（XIRR）</dt>`；值＝`{(r*100).toFixed(1)}%`；無解顯示 `—`；有流量時卡下標註 `自 {最早外部流量日期} 起`；`skipped.length > 0` → `role="alert"` 追加一行 `{n} 筆外幣流量缺匯率未計入`
  - Holdings 帳戶列表：每帳戶一列，含 `aria-label="{name} 現金餘額"` 的 number input（預填現值）＋按鈕 `儲存 {name} 餘額` → `updateAccount(id, { cashBalance })`
  - Loans 列表：每借款一列加 `aria-label="{name} 餘額"` 的 number input＋按鈕 `儲存 {name} 餘額` → `updateLoan(id, { balance })`

- [ ] **Step 1: 寫失敗測試**

`src/ui/Dashboard.test.tsx` 追加：

```tsx
  it('XIRR 卡：一年前投入 100,000、現值 110,000 → 10.0%', async () => {
    await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 110_000 })
    const d = new Date()
    d.setDate(d.getDate() - 365)
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await repo.addCashFlow({ accountId: 1, date: start, amount: 100_000, currency: 'TWD', kind: 'contribution', is_external: true })
    render(<Dashboard />)
    expect(await screen.findByText('10.0%')).toBeInTheDocument()
    expect(screen.getByText(`自 ${start} 起`)).toBeInTheDocument()
  })

  it('無流量時 XIRR 顯示 —', async () => {
    await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 100 })
    render(<Dashboard />)
    expect((await screen.findAllByText('—')).length).toBeGreaterThanOrEqual(1)
  })

  it('外幣流量缺匯率 → 警示筆數', async () => {
    await repo.addAccount({ name: 'IB', broker: 'IB', currency: 'USD', cashBalance: 0 })
    await repo.addCashFlow({ accountId: 1, date: '2020-01-01', amount: 100, currency: 'USD', kind: 'contribution', is_external: true })
    render(<Dashboard />)
    expect(await screen.findByText(/1 筆外幣流量缺匯率未計入/)).toBeInTheDocument()
  })
```

`src/ui/Holdings.test.tsx` 追加：

```tsx
  it('編輯帳戶現金餘額', async () => {
    await repo.addAccount({ name: '永豐', broker: '永豐金', currency: 'TWD', cashBalance: 1000 })
    const user = userEvent.setup()
    render(<Holdings />)
    const input = await screen.findByLabelText('永豐 現金餘額')
    await user.clear(input)
    await user.type(input, '99000')
    await user.click(screen.getByRole('button', { name: '儲存 永豐 餘額' }))
    expect((await repo.listAccounts())[0].cashBalance).toBe(99_000)
  })
```

`src/ui/Loans.test.tsx` 追加：

```tsx
  it('編輯借款餘額', async () => {
    await repo.addLoan({
      name: '質押A', kind: 'pledge', balance: 60_000, rate: 0.04,
      maintenanceThreshold: 130, restoreThreshold: 166,
      includeInterestInDenominator: false, collateral: [],
    })
    const user = userEvent.setup()
    render(<Loans />)
    const input = await screen.findByLabelText('質押A 餘額')
    await user.clear(input)
    await user.type(input, '50000')
    await user.click(screen.getByRole('button', { name: '儲存 質押A 餘額' }))
    expect((await repo.listLoans())[0].balance).toBe(50_000)
  })
```

- [ ] **Step 2: 驗證失敗**

執行：`npx vitest run src/ui/Dashboard.test.tsx src/ui/Holdings.test.tsx src/ui/Loans.test.tsx` → FAIL

- [ ] **Step 3: 最小實作**

`src/ui/Dashboard.tsx`：useLiveQuery 追加 `repo.listCashFlows()`；計算：

```tsx
  const xirrInput = buildXirrInput(data.cashFlows, valuation.nav, today())
  const rate = xirr(xirrInput.flows)
  const firstFlowDate = data.cashFlows
    .filter((c) => c.is_external)
    .map((c) => c.date)
    .sort()[0]
```

`<dl>` 追加：

```tsx
        <dt>年化報酬率（XIRR）</dt>
        <dd>
          {rate === undefined ? '—' : `${(rate * 100).toFixed(1)}%`}
          {firstFlowDate && <small>自 {firstFlowDate} 起</small>}
        </dd>
```

警示區（既有 missing alert 同一區塊）追加：

```tsx
      {xirrInput.skipped.length > 0 && (
        <p role="alert">{xirrInput.skipped.length} 筆外幣流量缺匯率未計入</p>
      )}
```

`src/ui/Holdings.tsx`：帳戶區塊加列表（每列 local state 以 `defaultValue`＋ref 或小型子元件處理；最簡：子元件 `AccountBalanceEditor({ account })` 內含 useState）：

```tsx
function AccountBalanceEditor({ account }: { account: Account }) {
  const [value, setValue] = useState(String(account.cashBalance))
  return (
    <li>
      {account.name}
      <label>{account.name} 現金餘額
        <input type="number" aria-label={`${account.name} 現金餘額`} value={value}
          onChange={(e) => setValue(e.target.value)} />
      </label>
      <button onClick={() => repo.updateAccount(account.id!, { cashBalance: Number(value) })}>
        儲存 {account.name} 餘額
      </button>
    </li>
  )
}
```

（`<ul>{accounts.map((a) => <AccountBalanceEditor key={a.id} account={a} />)}</ul>` 置於帳戶表單之後。）

`src/ui/Loans.tsx`：借款列表 li 內同樣模式加 `LoanBalanceEditor({ loan })`（input aria-label `{name} 餘額`、按鈕 `儲存 {name} 餘額` → `updateLoan(id, { balance })`）。

- [ ] **Step 4: 驗證通過＋全套**

執行：`npx vitest run src/ui/` → PASS；`npx vitest run` → 全綠

- [ ] **Step 5: Commit**

```bash
git add src/ui/
git commit -m "新增儀表板 XIRR 卡與帳戶借款餘額編輯

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 記債清理、覆蓋率與端對端驗收

**Files:**
- Modify: `src/main.tsx`、`src/ui/Holdings.tsx`、`src/ui/Settings.tsx`、`src/App.test.tsx`、`src/domain/stress.test.ts`、`src/data/repo.test.ts`
- Test: 上述測試檔追加/修改

**Interfaces:**
- Consumes: 全部既有模組
- Produces: Plan 1 final review 記債全數清理＋Plan 2 驗收

- [ ] **Step 1: 逐項清理（每項含測試或行為驗證）**

1. `src/main.tsx` 加 StrictMode：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

2. `src/ui/Holdings.tsx`：帳戶表單 `現金餘額` input 的 value 改 `value={account.cashBalance || ''}`（與其他金額欄一致）
3. `src/ui/Settings.tsx`：過期標記改 `{r.date && r.date !== today() && <strong>過期</strong>}`，並追加測試：

```tsx
  it('無報價時不顯示過期標記', async () => {
    await repo.putInstrument({ symbol: '0050', name: '元大台灣50', market: 'TW', currency: 'TWD', leverageFactor: 1 })
    render(<Settings />)
    expect(await screen.findByText(/無報價/)).toBeInTheDocument()
    expect(screen.queryByText('過期')).not.toBeInTheDocument()
  })
```

4. `src/App.test.tsx`：beforeEach 加 `vi.clearAllMocks()`；`toHaveBeenCalled()` 改 `toHaveBeenCalledOnce()`
5. `src/domain/stress.test.ts` 追加（β 預設分支）：

```ts
  it('擔保品查無 instrument 時 β 預設 1（spec §6.5）', () => {
    const loan = pledge({ collateral: [{ symbol: '9999', qty: 1000 }] })
    const r = stressTest({ drop: 0, loans: [loan], instruments, prices: new Map([['9999', { close: 100, date: '2026-07-14' }]]), cashTwd: 0 })
    expect(r.loans[0].marginCallDrop).toBeCloseTo(0.22, 6) // 同 β=1 案例
  })
```

6. `src/data/repo.test.ts`：deleteLoan 補斷言（在既有刪除測試中加 addLoan → deleteLoan → listLoans 為空）

- [ ] **Step 2: 全套與覆蓋率驗收**

執行：`npx vitest run` → 全綠；`npm run coverage` → 四項 ≥ 85%（引擎/adapter 檢查接近 100%，低於者補分支測試，不得調門檻）；`npm run build` → 通過。覆蓋率總表貼進報告。

- [ ] **Step 3: E2E 驗收（controller 負責執行，此處僅確認 dev server 可啟動）**

`npm run dev` 啟動後 curl http://localhost:5173 回 200 即可（完整 Playwright 驗收由 controller 以更新版腳本執行：既有 Plan 1 流程＋「紀錄頁上傳 CSV → 儀表板出現 XIRR」）。

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "清理 Plan 1 記債（StrictMode、過期標記、測試斷言強化）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 後續計畫（本計畫完成後另行撰寫）

- **Plan 3：PWA 與部署**——vite-plugin-pwa、JSON 匯出/匯入備份與定期提醒、GitHub repo（guitarbien 帳號）＋Actions build → Pages
- **Plan 4：TWR 與價格歷史回補**——TWSE STOCK_DAY 月檔回補、Twelve Data time_series 歷史、jsDelivr 歷史匯率、每日估值鏈接 TWR（spec §6.2；inception＝快照日，資料事後可回補故延後零損失）
- 已知未做（記錄於此避免遺忘）：現金餘額不由交易/現金流自動推導（手動編輯欄，Plan 4 再評估）；匯入的外幣流量 fx_rate 需手動補（xirrInput 會列 skipped 警示）
