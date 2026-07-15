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
