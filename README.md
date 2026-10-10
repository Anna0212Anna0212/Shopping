# 湊單搜尋

找出「同一個賣場同時賣 A、B 兩樣商品」的店，方便湊單省運費。純前端，可直接放 GitHub Pages。

## 部署到 github.io

1. 在 GitHub 建立 repo（例如 `dualshop`）。
2. 上傳 `index.html`（`worker.js` 與 `README.md` 可選）。
3. Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main` / `(root)`。
4. 等一分鐘，開啟 `https://你的帳號.github.io/dualshop/`。

## 使用方式（書籤擷取，不需後端）

1. 打開網頁，把兩個黃色按鈕拖到瀏覽器書籤列。
2. 輸入商品 A、B 名稱，點「到蝦皮搜尋」。
3. 在蝦皮搜尋結果頁往下捲讓商品載入，再點書籤「擷取 → 商品 A」。B 同理。
4. 網頁會自動比對，列出兩樣都有賣的賣場，顯示商品圖、標題、價格，可展開比價、選用想要的商品，並顯示距離免運門檻還差多少。

資料可累加：換頁、換排序再擷取一次即可，重複商品會自動合併。

## 自動搜尋（選用）

1. Cloudflare Dashboard → Workers → 建立 Worker，貼上 `worker.js` 內容並部署。
2. 把 `ALLOW_ORIGIN` 改成你的 github.io 網址。
3. 把 Worker 網址填進網頁「進階：自動搜尋」。

蝦皮有反爬蟲，這個方式可能被擋，屬於實驗功能。

## 已知限制

- 目前只支援蝦皮。蝦皮商品網址內含賣場編號，才能可靠判斷「同一賣場」。momo、亞馬遜的搜尋結果不顯示賣家，無法用同樣方式比對。
- 擷取靠解析蝦皮頁面的商品連結與文字，蝦皮改版時可能需要調整 `index.html` 中的 `bookmarklet()`。
- 賣場名稱在搜尋結果裡沒有，所以顯示為「賣場 #編號」，點擊可進入該賣場。
