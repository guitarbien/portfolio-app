/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

// CSP：即使未來有 XSS 或供應鏈汙染，connect-src 白名單讓惡意腳本無處外送 IndexedDB 資料。
// 只在 build 注入（dev 的 Vite HMR 需要 inline script，不受此限）。
// meta 版 CSP 不支援 frame-ancestors/report-uri，屬已知限制。
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  // 僅列實際使用的三個報價來源；新增來源時必須同步修改這裡（否則 fetch 會被瀏覽器擋下）
  "connect-src 'self' https://www.twse.com.tw https://api.twelvedata.com https://open.er-api.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const injectCsp: PluginOption = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
}

export default defineConfig({
  plugins: [react(), injectCsp],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/**/*.test.*', 'src/test-setup.ts'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
})
