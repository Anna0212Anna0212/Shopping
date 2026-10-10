// Cloudflare Worker：選用的「自動搜尋」後端
// 部署後把網址填進網頁的「自動搜尋」欄位。
// 注意：蝦皮有反爬蟲機制，伺服器端請求很可能被擋（回傳錯誤碼 90309999 之類）。
// 被擋時網頁會提示，請改用書籤擷取。

// 把 ALLOW_ORIGIN 改成你的 github.io 網址，例如 "https://yourname.github.io"
const ALLOW_ORIGIN = "*";

const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== "/search") return json({ error: "not found" }, 404);

    const q = (url.searchParams.get("q") || "").trim();
    const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
    if (!q) return json({ error: "missing q" }, 400);

    const limit = 60;
    const api =
      "https://shopee.tw/api/v4/search/search_items?by=relevancy&order=desc" +
      `&keyword=${encodeURIComponent(q)}&limit=${limit}&newest=${page * limit}` +
      "&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2";

    let res;
    try {
      res = await fetch(api, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Referer: `https://shopee.tw/search?keyword=${encodeURIComponent(q)}`,
          "X-Requested-With": "XMLHttpRequest",
          "X-API-SOURCE": "pc",
          Accept: "application/json",
          "Accept-Language": "zh-TW,zh;q=0.9",
        },
      });
    } catch (e) {
      return json({ error: "fetch failed: " + e.message }, 502);
    }

    if (!res.ok) return json({ error: "Shopee HTTP " + res.status }, 502);
    let data;
    try {
      data = await res.json();
    } catch {
      return json({ error: "Shopee 回傳非 JSON（可能被擋）" }, 502);
    }
    if (data.error) return json({ error: "Shopee 拒絕請求（錯誤碼 " + data.error + "）" }, 502);

    const items = (data.items || [])
      .map((r) => r.item_basic)
      .filter(Boolean)
      .map((b) => ({
        platform: "shopee",
        shopId: String(b.shopid),
        itemId: String(b.itemid),
        title: b.name,
        price: (b.price_min || b.price) / 100000,
        img: b.image ? `https://down-tw.img.susercontent.com/file/${b.image}` : "",
        sold: b.historical_sold ? String(b.historical_sold) : "",
      }));

    return json({ items });
  },
};
