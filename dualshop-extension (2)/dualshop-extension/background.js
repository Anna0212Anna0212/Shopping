// 背景程式：開一個小視窗，依序搜尋每個商品、自動捲動並擷取每一頁，結果回傳給網頁
let cancelled = false;
let running = false;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type === "search" && sender.tab) {
    if (running) {
      send(sender.tab.id, { type: "error", message: "上一次搜尋還在進行中" });
      return;
    }
    cancelled = false;
    run(msg, sender.tab.id);
  }
});

function send(tabId, payload) {
  chrome.tabs.sendMessage(tabId, { src: "dualshop-bg", payload }).catch(() => {});
}

function navigate(tabId, url, timeout = 30000) {
  return new Promise((resolve) => {
    const finish = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(finish, timeout);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url }).catch(finish);
  });
}

async function run(msg, pageTabId) {
  running = true;
  let win = null;
  let keepWindow = false;
  const say = (text) => send(pageTabId, { type: "progress", text });
  try {
    win = await chrome.windows.create({
      url: "about:blank",
      type: "popup",
      focused: false,
      width: 820,
      height: 760,
    });
    const wtab = win.tabs[0].id;

    const open = async (url, shopMode) => {
      await navigate(wtab, url);
      const cur = await chrome.tabs.get(wtab);
      if (!/^https:\/\/([a-z0-9-]+\.)*shopee\.tw\//.test(cur.url || "")) {
        throw new Error(
          `小視窗沒有成功開啟蝦皮（目前網址：${cur.url || cur.pendingUrl || "未知"}）。請確認網路，或手動在瀏覽器開 shopee.tw 看看是否正常`
        );
      }
      let res;
      try {
        [res] = await chrome.scripting.executeScript({
          target: { tabId: wtab },
          func: scrape,
          args: [shopMode ? 12 : 24],
        });
      } catch (err) {
        throw new Error(
          `無法讀取蝦皮頁面：${err.message}。請到 chrome://extensions → 湊單搜尋連線 → 詳細資料，把「網站存取權」設為「在所有網站上」，再重新載入擴充功能`
        );
      }
      const r = (res && res.result) || { error: "no-result" };
      if (r.error === "verify") {
        keepWindow = true;
        throw new Error("蝦皮要求登入或驗證，請在剛開啟的小視窗完成後再搜尋一次");
      }
      return r;
    };

    // 第 1 步：搜尋起點商品，收集賣它的賣場
    const anchor = msg.anchor;
    const shopCount = new Map();
    let total = 0;
    for (let p = 0; p < msg.pages; p++) {
      if (cancelled) throw new Error("已取消");
      say(`第 1 步：搜尋「${anchor.label}」第 ${p + 1}/${msg.pages} 頁，目前 ${total} 件、${shopCount.size} 個賣場…`);
      const r = await open(`https://shopee.tw/search?keyword=${encodeURIComponent(anchor.label)}&page=${p}`, false);
      if (r.error) {
        if (p === 0) throw new Error(`搜尋「${anchor.label}」沒有取得任何商品（${r.error}）`);
        break;
      }
      r.items.forEach((i) => shopCount.set(i.shopId, (shopCount.get(i.shopId) || 0) + 1));
      total += r.items.length;
      send(pageTabId, { type: "items", id: anchor.id, items: r.items });
      if (r.items.length < 20) break;
    }

    // 賣越多這項商品的賣場排越前面，取前 N 個
    const shops = [...shopCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, msg.maxShops)
      .map((x) => x[0]);

    // 第 2 步：到每個賣場內搜尋其他商品
    for (let s = 0; s < shops.length; s++) {
      for (const o of msg.others) {
        if (cancelled) throw new Error("已取消");
        say(`第 2 步：檢查賣場 ${s + 1}/${shops.length}，在裡面搜尋「${o.label}」…`);
        const r = await open(
          `https://shopee.tw/shop/${shops[s]}/search?keyword=${encodeURIComponent(o.label)}`,
          true
        );
        if (r.error) continue; // 找不到商品就是這個賣場沒有
        const terms = o.label.toLowerCase().split(/\s+/).filter(Boolean);
        const items = r.items.filter(
          (i) => i.shopId === shops[s] && terms.every((t) => i.title.toLowerCase().includes(t))
        );
        if (items.length) send(pageTabId, { type: "items", id: o.id, items });
      }
    }
    send(pageTabId, { type: "done", shops: shops.length });
  } catch (e) {
    send(pageTabId, { type: "error", message: e.message || String(e) });
  } finally {
    running = false;
    if (win && !keepWindow) chrome.windows.remove(win.id).catch(() => {});
  }
}

// 這個函式會被注入到蝦皮頁面內執行（必須自成一體）
async function scrape(maxWait) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const re1 = /-i\.(\d+)\.(\d+)/;
  const re2 = /\/product\/(\d+)\/(\d+)/;
  const anchors = () =>
    [...document.querySelectorAll("a[href]")].filter((a) => {
      const h = a.getAttribute("href") || "";
      return re1.test(h) || re2.test(h);
    });

  let waited = 0;
  while (anchors().length === 0 && waited < maxWait) {
    if (/verify|buyer\/login/.test(location.href)) return { error: "verify" };
    await sleep(500);
    waited++;
  }
  if (anchors().length === 0) {
    return { error: /verify|buyer\/login/.test(location.href) ? "verify" : "empty" };
  }

  // 逐步往下捲，讓延遲載入的商品全部出現
  let last = 0, stable = 0;
  for (let i = 0; i < 60 && stable < 4; i++) {
    window.scrollBy(0, Math.round(window.innerHeight * 0.8));
    await sleep(350);
    const n = anchors().length;
    if (n === last) stable++;
    else { stable = 0; last = n; }
  }
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(600);
  window.scrollTo(0, 0);
  await sleep(200);

  const seen = new Set();
  const items = [];
  anchors().forEach((a) => {
    const h = a.getAttribute("href") || "";
    const m = h.match(re1) || h.match(re2);
    if (!m || seen.has(m[2])) return;
    const text = (a.innerText || "").replace(/\s+/g, " ");
    const pm = text.match(/\$\s?([\d,]+)/);
    if (!pm) return;
    seen.add(m[2]);
    const im = a.querySelector("img");
    const sd = text.match(/已售出\s?([\d.,]+[萬千]?)/);
    items.push({
      platform: "shopee",
      shopId: m[1],
      itemId: m[2],
      title: (im && im.alt) || text.slice(0, 60),
      price: Number(pm[1].replace(/,/g, "")),
      img: im ? im.currentSrc || im.src : "",
      sold: sd ? sd[1] : "",
    });
  });
  return { items };
}
