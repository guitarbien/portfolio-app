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
  // ponytail: undefined guard (no default) — component stays invisible until accounts load;
  // all useState hooks must come BEFORE the early return to satisfy Rules of Hooks
  const accounts = useLiveQuery(repo.listAccounts)
  const [accountId, setAccountId] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [csvErrors, setCsvErrors] = useState<{ line: number; reason: string }[]>([])
  const [map, setMap] = useState<Mapping>({ dateCol: '', amountCol: '', kindCol: '無', kindMap: {} })
  const [preview, setPreview] = useState<{ valid: CashFlow[]; errors: string[] } | null>(null)
  const [done, setDone] = useState<number | null>(null)

  if (!accounts) return null

  const storageKey = (h: string[]) => `csvMapping:${h.join('|')}`

  // ponytail: FileReader instead of file.text() — jsdom 26.1 does not implement Blob.text()
  const readText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const parsed = parseCsv(await readText(file))
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
