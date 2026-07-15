import { describe, it, expect } from 'vitest'
import { fetchUsdTwd } from './erApi'

const okBody = {
  result: 'success',
  time_last_update_utc: 'Tue, 14 Jul 2026 00:02:31 +0000',
  rates: { TWD: 32.179231 },
}

const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('fetchUsdTwd', () => {
  it('解析 TWD 匯率與更新日期', async () => {
    const r = await fetchUsdTwd(fakeFetch(okBody))
    expect(r).toEqual({
      ok: true,
      value: { pair: 'USDTWD', date: '2026-07-14', rate: 32.179231, source: 'auto' },
    })
  })

  it('缺 TWD 欄位 → ok:false', async () => {
    const r = await fetchUsdTwd(fakeFetch({ result: 'success', rates: {} }))
    expect(r.ok).toBe(false)
  })

  it('HTTP 錯誤 → ok:false 不 throw', async () => {
    const r = await fetchUsdTwd(fakeFetch({}, 500))
    expect(r.ok).toBe(false)
  })

  it('缺 time_last_update_utc → ok:false 更新時間無法解析', async () => {
    const r = await fetchUsdTwd(fakeFetch({ result: 'success', rates: { TWD: 32 } }))
    expect(r).toEqual({ ok: false, reason: '更新時間無法解析' })
  })

  it('time_last_update_utc 為壞字串 → ok:false', async () => {
    const r = await fetchUsdTwd(fakeFetch({ result: 'success', rates: { TWD: 32 }, time_last_update_utc: 'not-a-date' }))
    expect(r).toEqual({ ok: false, reason: '更新時間無法解析' })
  })

  it('fetch 拒絕（網路錯誤）→ ok:false 不 throw', async () => {
    const rejecting = (async () => { throw new Error('network down') }) as unknown as typeof fetch
    const r = await fetchUsdTwd(rejecting)
    expect(r).toEqual({ ok: false, reason: 'network down' })
  })
})
