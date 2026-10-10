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
  try {
    win = await chrome.windows.create({
      url: "about:blank",
      type: "popup",
      focused: false,
      width: 820,
      height: 760,
    });
    const wtab = win.tabs[0].id;

    for (const task of msg.tasks) {
      let total = 0;
      for (let p = 0; p < msg.pages; p++) {
        if (cancelled) throw new Error("已取消");
        send(pageTabId, { type: "progress", id: task.id, label: task.label, page: p + 1, pages: msg.pages, count: total });
        const url = `https://shopee.tw/search?keyword=${encodeURIComponent(task.label)}&page=${p}`;
        await navigate(wtab, url);
        const [res] = await chrome.scripting.executeScript({ target: { tabId: wtab }, func: scrape });
        const r = (res && res.result) || { error: "no-result" };
        if (r.error) {
          if (r.error === "verify") {
            keepWindow = true;
            throw new Error("蝦皮要求登入或驗證，請在剛開啟的小視窗完成後再搜尋一次");
          }
          if (p === 0) throw new Error(`搜尋「${task.label}」沒有取得任何商品（${r.error}）`);
          break;
        }
        total += r.items.length;
        send(pageTabId, { type: "items", id: task.id, items: r.items });
        if (r.items.length < 20) break; // 已是最後一頁
      }
      send(pageTabId, { type: "slotDone", id: task.id, count: total });
    }
    send(pageTabId, { type: "done" });
  } catch (e) {
    send(pageTabId, { type: "error", message: e.message || String(e) });
  } finally {
    running = false;
    if (win && !keepWindow) chrome.windows.remove(win.id).catch(() => {});
  }
}

// 這個函式會被注入到蝦皮頁面內執行（必須自成一體）
async function scrape() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const re1 = /-i\.(\d+)\.(\d+)/;
  const re2 = /\/product\/(\d+)\/(\d+)/;
  const anchors = () =>
    [...document.querySelectorAll("a[href]")].filter((a) => {
      const h = a.getAttribute("href") || "";
      return re1.test(h) || re2.test(h);
    });

  let waited = 0;
  while (anchors().length === 0 && waited < 24) {
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
