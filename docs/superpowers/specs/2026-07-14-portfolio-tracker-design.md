# 投資組合追蹤工具設計文件

- 日期：2026-07-14
- 狀態：已核准架構，待使用者審閱本文件
- 形態：純前端 PWA（無後端），部署 GitHub Pages

## 1. 背景與問題

使用者有三家台灣券商＋一家美國券商，即將開始使用槓桿（股票質押借款、槓桿型 ETF、理財型房貸），並有十年記帳記錄（一般消費＋定期定額每筆日期與金額＋現金股利，**無**股數與買入價）。三個真問題：

1. **跨券商彙總**：部位、成本、損益合併視圖（台美股、匯率換算），市面無工具可做。
2. **正確報酬率**：有持續入金時，簡單報酬率是錯的；需要 XIRR／TWR。
3. **槓桿監控**：每筆質押的維持率、整體槓桿倍率、壓力測試。質押維持率目前只能在各券商自家 App 看到自家借款，無跨券商聚合工具。

Build-vs-buy 查證結論（來源見附錄）：無任何現成工具（Ghostfolio／Wealthfolio／Portfolio Performance／Moneybook／Capitally 等）支援「質押維持率＋理財型房貸＋槓桿曝險」。現成工具只解決最商品化的報酬率計算，故自建。

## 2. 目標與非目標

**做**：

- 跨券商持倉彙總（TWD 基準，原幣並列）
- 十年歷史 XIRR（由記帳現金流＋期末持倉快照計算）＋快照日起的 TWR
- 槓桿儀表板：淨值、槓桿倍率、逐筆質押維持率、壓力測試（觸追繳跌幅、補繳金額 vs 補繳子彈）
- 每日收盤報價自動抓取＋手動備援
- 記帳現金流 CSV 匯入精靈
- IndexedDB 儲存＋JSON 一鍵匯出／匯入備份
- PWA（可安裝至手機主畫面、離線可用）

**不做**（明確排除，避免範圍蔓延）：

- 即時報價——證交所辦法明定維持率以「當日收盤價」逐日計算，收盤價就是法規上正確的監控頻率
- 券商自動同步——台灣券商無公開 API（Moneybook 即因此停掉台股同步）
- 多裝置資料同步——使用者已選單機＋手動備份；JSON 匯出/匯入是裝置間的手動橋樑
- Electron——瀏覽器＋PWA 已滿足；桌面殼無增量價值
- 上櫃股票報價——使用者確認無上櫃持股；未來若需要，以手動輸入報價支應，真有量再加 GitHub Actions 預抓管線
- 雲端儲存、登入、多使用者

## 3. 已確認的決策記錄（2026-07-14 訪談）

| 決策 | 內容 |
|---|---|
| 槓桿型態 | 股票質押借款＋槓桿型 ETF（如 00631L）＋理財型房貸。無信用交易、無美股 margin |
| 歷史資料 | 記帳有現金流（日期＋金額）與股利，無股數股價 → XIRR 可算、歷史 TWR 數學上不可行 |
| 報價 | 自動抓＋手動備援，每日收盤等級 |
| 儲存 | 單機 IndexedDB＋JSON 備份，資料不上雲 |
| 持股範圍 | 僅上市股票／ETF，無上櫃 |
| 技術棧 | React + TypeScript + Vite + vite-plugin-pwa；Dexie（IndexedDB）。未來上店用 Capacitor 包同一份程式碼 |

## 4. 技術架構

```
┌─────────────────────────────────────────────┐
│  PWA（GitHub Pages 靜態部署 / 手機加入主畫面）  │
│                                             │
│  UI 層（儀表板／輸入表單／匯入精靈）             │
│         │                                   │
│  計算引擎（純函式，無狀態、無 I/O）              │
│    XIRR・TWR・淨值・槓桿倍率・維持率・壓力測試   │
│         │                                   │
│  資料層（IndexedDB via Dexie，八張表）          │
│         │                                   │
│  報價模組（三個 source adapter＋手動覆寫）      │
└─────────────────────────────────────────────┘
```

**多平台策略**：web 與手機共用同一份 PWA。加入主畫面後 iOS/Android 皆為全螢幕離線 App，且 iOS 安裝版 PWA 豁免 Safari 的 7 天閒置儲存回收。未來若要上 App Store／Play Store，以 Capacitor 包裝同一份 web 程式碼，架構不變。不採 React Native：需重寫 UI 與儲存層、放棄 GitHub Pages，複雜度翻倍而無現階段收益。

**依賴原則**：必要依賴僅 React、Dexie、vite-plugin-pwa。MVP 唯一的圖是淨值走勢折線（其餘皆為數字卡與表格），以 SVG 自繪或 uPlot 級輕量庫實作，不引入 Chart.js 等全功能圖表庫。不引入狀態管理庫（資料層即狀態源，React context 足夠）、不引入 CSS 框架。

## 5. 資料模型（八張表）

設計原則：把會產生 if/else 的差異下沉為資料欄位，計算層零分支。

### 核心邊界規則（凌駕全部）

> 組合邊界＝所有券商帳戶＋借款。**跨越邊界的錢＝外部現金流（進 XIRR）；邊界內的錢＝內部事件（只改淨值，不進 XIRR）。**

股利、利息、借款、還款、手續費全部用這一條判定：

- 台股現金股利匯入交割銀行（出邊界）→ 外部流出；再投入是新的外部流入
- 美股股利留在券商帳戶（邊界內）→ 內部事件，不記流量，但估值須含帳戶現金
- 利息從券商帳戶現金扣（邊界內）→ 內部費用，淨值自然下降
- 利息從外部薪資戶付（跨界）→ 記為外部流入（錢進了組合去付費用）

### 表結構

| 表 | 欄位 | 說明 |
|---|---|---|
| **Account** | id, name, broker, currency, cash_balance | 券商帳戶；現金餘額由現金流累計推得，此欄為快取 |
| **Instrument** | symbol, name, market(`TW`/`US`), currency, **leverage_factor**(預設 1) | 00631L 填 2、反向 ETF 填 −1；曝險＝市值×|factor|，無特例 |
| **Transaction** | id, account_id, date, symbol, **qty(帶號)**, price, fee, tax | 帶號股數消除買/賣分支；快照日後的交易記於此 |
| **CashFlow** | id, account_id, date, **amount(帶號)**, currency, kind(`contribution`/`withdrawal`/`dividend`/`interest`/`fee`/`transfer`), **is_external**, fx_rate(選填) | 十年記帳匯入於此；`is_external=true` 子集＝XIRR 輸入；fx_rate 供外幣歷史流量在無自動來源時手動指定發生日匯率 |
| **Loan** | id, name, kind(`pledge`/`mortgage`), balance, rate, maintenance_threshold(預設 130), restore_threshold(預設 166), include_interest_in_denominator(預設 false), last_interest_settle_date(選填), credit_limit(mortgage 用), collateral: [{symbol, qty}] | 質押門檻逐筆可編輯（法規底線 130/166，元大證金 140 且分母含利息）；理財型房貸：kind=`mortgage`、無門檻無擔保品，只有額度／餘額／利率 |
| **PositionSnapshot** | date, account_id, symbol, qty, cost(選填) | 開帳快照＝歷史 XIRR 終值＋TWR 起算點；cost 不影響報酬率，僅供未實現損益展示 |
| **Price** | symbol, date, close, source(`auto`/`manual`) | 估值唯一來源；manual 永遠優先於 auto |
| **FxRate** | pair, date, rate, source | 換算一律取事件發生日匯率；儲存層一律原幣，TWD 僅在讀取層出現 |

### 完備性驗證（所有指標可由八張表推出）

- `NAV(t) = Σ qty×close×fx + Σ 帳戶現金 − Σ Loan.balance`
- `曝險(t) = Σ qty×close×|leverage_factor|×fx`（現金曝險＝0）
- `槓桿倍率 = 曝險 ÷ NAV`（僅 NAV > 0 時定義）
- `維持率(loan) = Σ 擔保品 qty×close ÷ (balance [+ 應收利息])`
- `歷史 XIRR = solve(is_external 流量以發生日匯率換 TWD ＋ 期末 NAV)`
- `TWR = 每日估值幾何鏈接，自快照日起`

## 6. 計算引擎規格（純函式模組）

全部為 `(資料) → 數字` 純函式，無 I/O，直接單元測試。

### 6.1 xirr(flows: {date, amountTwd}[]): number | undefined

牛頓法＋bisection fallback。三個已用腳本實測的邊界（腳本轉為測試案例）：

1. **符號前置檢查**：流量全同號 → NPV 恆同號無根 → 回 `undefined`，不進迭代
2. **牛頓法跳出定義域**：深度虧損（如投入 1000 剩 10）時牛頓法自初值 0.1 第一步即跳至 r≈−35 < −1 → 降級 bisection（區間 [−0.999999, 10]，上界無變號則倍增擴張至 1e6）
3. **多重根**（流量兩次變號時存在，實測 [−1000, +2250, −1265] 有 10% 與 15% 雙根）→ 規則：取 (−1, ∞) 中最靠近 0 的根
4. 工程細節：t＝距首筆天數/365.0；同日流量先加總；收斂容差 1e-9

### 6.2 twr(dailyNav, externalFlows): number

每日估值幾何鏈接（每天都是切點，外部現金流日不再特殊）。inception＝快照日，起始指數 1.0，UI 標註「自 YYYY-MM-DD 起算」。XIRR 與 TWR 並行展示：XIRR＝實際體驗（含擇時），TWR＝持倉本身表現（可與 0050/S&P 500 同軸比較），兩者分歧＝擇時損益，是資訊不是誤差。

### 6.3 nav / exposure / leverageRatio

如第 5 節公式。**NAV ≤ 0 時倍率不定義**——UI 分別顯示曝險與淨值兩個原始數，不顯示爆炸的比率。借款未投入時（現金↑負債↑）淨值與曝險皆不變、倍率不動——這是正確行為（現金不承擔市場風險），非 bug。

### 6.4 maintenanceRatio(loan): number

`Σ collateral 市值（當日收盤） ÷ (balance ＋ include_interest ? 應收利息 : 0)`。應收利息＝`balance × rate ÷ 365 × 距 last_interest_settle_date 天數`；未填 last_interest_settle_date 則視為 0 並於借款卡提示。

### 6.5 stressTest(marketDropPct, beta 假設)

- 每檔標的 beta 預設 1，槓桿 ETF 預設＝leverage_factor（00631L 當擔保品時跌幅自動 2 倍，無特殊 case）
- 壓後維持率＝`Σ(擔保品市值 × (1 − β·X)) ÷ 借款餘額`，逐筆與各自門檻比較
- **觸追繳跌幅反解**：`X* = (1 − 門檻 × 借款餘額 ÷ 現擔保市值) ÷ β`，排序顯示哪筆先觸追繳
- **追繳金額**（補擔保品口徑）＝`借款餘額 × restore_threshold − 壓後擔保市值`；（還款口徑）＝`借款餘額 − 壓後擔保市值 ÷ restore_threshold`
- **補繳子彈**＝理財型房貸未動用額度＋現金，對比追繳金額得出安全邊際——理財型房貸在本組合的核心角色即「無追繳風險的備援流動性」

## 7. 報價模組

統一介面 `fetchClose(symbol, date): Promise<Price>`，三個 adapter：

| 來源 | 範圍 | 認證 | CORS 實測 |
|---|---|---|---|
| TWSE rwd API（`www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_AVG`） | 上市股票/ETF 含 00631L | 免 key | `access-control-allow-origin: *`（2026-07-14 實測） |
| Twelve Data | 美股/美股 ETF 日線 OHLC | 使用者自備免費 key（800 req/日），存 localStorage | ACAO: * 實測 |
| open.er-api.com | USD/TWD | 免 key | ACAO: * 實測；備援 jsDelivr @fawazahmed0/currency-api |

策略：

- 開啟 App 時檢查當日（最近交易日）是否已有收盤價，缺才抓，寫入 Price 表快取；設定頁另設手動重抓按鈕。**絕不迴圈高頻請求**（TWSE 會封 IP）
- 任一來源失敗 → 該標的標示 stale＋一鍵手動輸入；**不做跨來源靜默 fallback**（各源格式差異大，靜默切換易餵錯資料），寧可明確告知使用者
- 手動輸入（source=`manual`）永遠覆蓋自動值
- 已知失效來源（實測確認，勿走回頭路）：TWSE OpenAPI、TPEx 兩套 API、Yahoo Finance、stooq、台銀 CSV、Frankfurter（無 TWD）——皆無 CORS 或被反爬/挑戰頁擋住
- 否證條件：CORS 屬對方伺服器設定，隨時可能變動；上線後前端做來源健康度顯示，來源異動時以手動輸入兜底

## 8. 匯入與建帳流程（一次性精靈）

1. 建帳戶（券商帳戶＋借款，含質押門檻設定）
2. 建目前持倉快照：表單輸入代號＋股數（cost 選填）；快照存檔日即 TWR inception
3. 匯入十年記帳現金流：CSV 上傳 → 欄位對映（最低要求三欄：日期／金額／方向或類別）→ 預覽 → 入庫。對映設定可存檔重用
4. 完成即顯示：十年 XIRR、目前淨值、槓桿倍率、逐筆維持率

**匯入是信任邊界**：日期格式與數字必驗證；無法解析的列明確列出供使用者修正，不猜、不靜默丟棄。外幣歷史流量若無法自動取得發生日匯率，於預覽步驟要求手動填 fx_rate。

## 9. UI（四頁）

| 頁 | 內容 |
|---|---|
| **儀表板** | 淨值、槓桿倍率、十年 XIRR／TWR（標註起算日）、逐筆質押維持率卡（現值、距追繳跌幅、安全邊際）、壓力測試滑桿（大盤 −X% 即時重算） |
| **持倉** | 跨券商合併視圖＋單券商切換；原幣與 TWD 並列；含各帳戶現金 |
| **紀錄** | 交易與現金流的新增／編輯／刪除；股利登錄 |
| **設定** | 借款管理、Twelve Data API key、JSON 匯出／匯入、手動報價輸入、報價來源健康度 |

## 10. 錯誤處理

- 報價 stale、XIRR 無解（`undefined`）、NAV ≤ 0 皆為**顯式 UI 狀態**——不靜默吞掉、不顯示錯誤的數字、不用 0 或 NaN 充數
- 匯入驗證失敗逐列報告（列號＋原因）
- IndexedDB 寫入失敗（配額／隱私模式）→ 阻斷式提示，引導匯出備份

## 11. 測試策略

- 測試集中於計算引擎（純函式）：XIRR 三邊界案例（研究時的實測腳本直接轉為測試）、TWR 鏈接、維持率含/不含利息兩口徑、壓力測試反解與補繳金額兩口徑、邊界規則 predicate、多幣別換算（已驗證案例：USD 流量 XIRR 10%＋匯率 30→33 ⇒ TWD XIRR 21%）
- CSV 解析器：正常／壞列／混合格式
- UI 不寫自動化測試——單人使用，手動驗證成本低於維護成本；核心正確性已由引擎測試守住

## 12. 部署

- `git init` → GitHub repo → GitHub Actions build → Pages
- 注意：免費方案的 GitHub Pages 需公開 repo（私有 repo 開 Pages 需付費方案）。本 App 程式碼不含任何個人財務資料（資料全在使用者瀏覽器 IndexedDB），公開 repo 可接受；若不願公開程式碼則升級方案或改本機開檔
- PWA：vite-plugin-pwa 產生 manifest＋service worker（precache，離線可用）

## 13. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 報價來源改版／收回 CORS | 手動輸入永遠可用；來源健康度顯示；必要時再加 GitHub Actions 預抓管線（架構已預留：報價是獨立 adapter） |
| 瀏覽器清除 IndexedDB | JSON 一鍵匯出＋定期備份提醒（單機方案的生命線）；iOS 以安裝版 PWA 使用可豁免 7 天回收 |
| 質押條款各業者不同 | 門檻／回補標準／分母口徑全部做成逐筆可編輯欄位，預設值採法規底線（130/166） |
| 十年記帳品質未知 | 匯入精靈逐列驗證＋預覽；XIRR 精度上限由期末快照正確性決定（漏帳戶現金會低估報酬），建帳時明確提示 |
| Twelve Data key 曝露於前端 | 免費 key、僅報價讀取權限，風險可接受；介意則改手動輸入美股報價 |

## 14. 附錄：研究證據摘要

四路平行研究（2026-07-14），所有結論附一手證據（curl 輸出／法規條文／官方文件），完整記錄於 workflow `wf_2a395ba8-20d` journal。

**報價 CORS 實測**：12 個來源逐一以 `curl -H 'Origin: https://example.github.io'` 實測。可用：TWSE rwd API、Twelve Data、Alpha Vantage、Finnhub、open.er-api.com、jsDelivr currency-api（皆回 ACAO: *）。不可用：TWSE OpenAPI／TPEx（無 ACAO）、Yahoo（無 ACAO＋429）、stooq（JS 挑戰頁）、台銀（Akamai）、Frankfurter（無 TWD）。自驗指令例：`curl -s -D - -H 'Origin: https://example.github.io' 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_AVG?stockNo=0050&response=json'`

**質押規則**（證交所《證券商辦理不限用途款項借貸業務操作辦法》＋永豐／富邦／元大證金官方頁面）：維持率＝擔保品市值÷融通金額，低於 130% 追繳、2 營業日內補至 166%、第 3 營業日起處分；成數上限＝前日收盤價 60%；以當日收盤價逐日計算。元大證金：門檻 140%、分母含應收利息。銀行質押為契約自訂（利率約 2–4%，低於券商 3.9–6.5%）。理財型房貸：額度內隨借隨還、按日計息、無維持率（利率約 2.58–4.2%）。00631L：官方曝險區間 180–220%，現金持有無追繳問題。

**報酬率方法論**：歷史段（僅現金流＋期末市值）XIRR 為唯一可行——TWR 需每個切點當日組合市值，歷史股數不存在故不可行（定義層推導；否證條件：存在僅憑日期＋金額重建任意歷史日市值的方法）。XIRR 數值邊界三案例已以 Python 腳本實測驗證。

**Build-vs-buy**：無現成工具支援「質押維持率＋理財型房貸＋槓桿曝險」。最接近：Wealthfolio（本機、XIRR/TWR 齊，無槓桿概念）、Capitally（雲端付費、margin 概念與台灣質押規則不對齊）。來源：各專案 GitHub／官方文件／官方部落格，詳 journal。
