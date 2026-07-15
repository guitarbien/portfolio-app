import { describe, it, expect } from 'vitest'
import { fetchTwseClose, rocToIso } from './twse'

// 依 2026-07-14 實測回應格式（spec §14）
const okBody = {
  stat: 'OK',
  date: '20260714',
  title: '115年07月 0050 元大台灣50 日收盤價及月平均收盤價',
  fields: ['日期', '收盤價'],
  data: [
    ['115/07/01', '109.35'],
    ['115/07/14', '1,110.20'],
    ['月平均收盤價', '109.80'],
  ],
}

const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('rocToIso', () => {
  it('民國年轉西元 ISO 日期', () => {
    expect(rocToIso('115/07/14')).toBe('2026-07-14')
  })
})

describe('fetchTwseClose', () => {
  it('取最後一筆日期列的收盤價，略過「月平均收盤價」列，千分位正確解析', async () => {
    const r = await fetchTwseClose('0050', fakeFetch(okBody))
    expect(r).toEqual({
      ok: true,
      value: { symbol: '0050', date: '2026-07-14', close: 1110.2, source: 'auto' },
    })
  })

  it('stat 非 OK → ok:false', async () => {
    const r = await fetchTwseClose('9999', fakeFetch({ stat: '很抱歉，沒有符合條件的資料!' }))
    expect(r.ok).toBe(false)
  })

  it('HTTP 錯誤 → ok:false 不 throw', async () => {
    const r = await fetchTwseClose('0050', fakeFetch({}, 500))
    expect(r.ok).toBe(false)
  })

  it('fetch 拒絕（網路錯誤）→ ok:false 不 throw', async () => {
    const rejecting = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const r = await fetchTwseClose('0050', rejecting)
    expect(r).toEqual({ ok: false, reason: 'network down' })
  })
})
