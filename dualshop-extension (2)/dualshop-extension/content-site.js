// 在你的 github.io 網頁上執行：負責網頁 <-> 擴充功能 之間的訊息轉送
const announce = () =>
  window.postMessage({ src: "dualshop-ext", type: "pong", version: "1.0.0" }, "*");

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.src !== "dualshop-page") return;
  if (d.type === "ping") announce();
  else if (d.type === "search") {
    chrome.runtime.sendMessage({ type: "search", anchor: d.anchor, others: d.others, pages: d.pages, maxShops: d.maxShops });
  } else if (d.type === "cancel") {
    chrome.runtime.sendMessage({ type: "cancel" });
  }
});

chrome.runtime.onMessage.addListener((m) => {
  if (m && m.src === "dualshop-bg") {
    window.postMessage({ src: "dualshop-ext", ...m.payload }, "*");
  }
});

announce();
