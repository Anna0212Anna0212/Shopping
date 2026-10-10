# 湊單搜尋

輸入最多 6 樣想買的商品，自動找出「同一個賣場同時有賣」的店，顯示商品圖、標題、價格，讓你確認是不是要的商品並比價。純前端網頁 + 一個瀏覽器擴充功能。

## 部署網頁到 github.io
1. 建立 GitHub repo，上傳 `index.html` 和 `dualshop-extension.zip`。
2. Settings → Pages → Branch 選 `main` / `(root)`。
3. 開啟 `https://你的帳號.github.io/repo名/`。

## 安裝擴充功能（一次性，Chrome / Edge 電腦版）
1. 解壓縮 `dualshop-extension.zip`（或直接用 `extension/` 資料夾）。
2. 開啟 `chrome://extensions`，打開「開發人員模式」。
3. 按「載入未封裝項目」，選那個資料夾。
4. 重新整理網頁，頂端出現綠色「已連線」即完成。

安全建議：`extension/manifest.json` 的 `content_scripts.matches` 預設是所有 `*.github.io`，建議改成你自己的 `https://你的帳號.github.io/*`。

## 使用
輸入商品名稱 → 選搜尋頁數（每頁約 60 件）→ 開始搜尋。擴充功能會開一個小視窗，自動搜尋、捲動、翻頁，完成後自動關閉。結果頁每個商品下方直接顯示價格；點「查看全部與比價」可看該賣場同類商品，用「選用」切換、「不是這個」排除不符的商品。

## 限制
- 目前只支援蝦皮（商品網址帶賣場編號，才能判斷同一賣場）。
- 搜尋時蝦皮可能要求登入或驗證，小視窗會停著讓你完成，再重新搜尋。
- 擷取靠解析蝦皮頁面，蝦皮改版時需調整 `extension/background.js` 的 `scrape()`。
- 賣場名稱在搜尋結果中沒有，顯示為「賣場 #編號」。
