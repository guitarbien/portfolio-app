# portfolio

純前端的個人投資組合追蹤工具：跨券商持倉彙總、XIRR 年化報酬率、股票質押維持率監控與壓力測試。

## 資料安全模型（重要）

**本站不收集、不傳輸、不儲存任何使用者資料。** 所有輸入（持倉、借款、記帳現金流）都只存在**你自己瀏覽器的 IndexedDB**：

- 網站是純靜態頁面（GitHub Pages），沒有後端、沒有資料庫
- 「匯入 CSV」由瀏覽器本機讀取解析，檔案不會離開你的裝置
- 對外連線僅限三個唯讀報價 API（TWSE／Twelve Data／open.er-api.com），由 CSP `connect-src` 白名單強制——即使發生 XSS 或供應鏈攻擊，資料也沒有可外送的通道
- 每個裝置/瀏覽器的資料各自獨立；清除瀏覽器網站資料會一併刪除，請定期使用 JSON 備份

## 開發

```bash
npm ci
npm run dev        # 開發伺服器
npm run test       # 測試
npm run coverage   # 測試＋覆蓋率門檻（85%）
npm run build      # 產出 dist/（含 CSP meta）
```

推送到 `main` 會自動執行測試閘門並部署到 GitHub Pages（`.github/workflows/deploy.yml`）。

## 技術

React 19 + TypeScript + Vite、Dexie（IndexedDB）、Vitest + Testing Library。設計文件見 `docs/superpowers/specs/`。
