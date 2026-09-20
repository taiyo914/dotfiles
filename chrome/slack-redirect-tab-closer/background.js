// Slack の「◯◯を立ち上げています」中継ページが残ったタブを自動で閉じる。
//
// 中継ページはデスクトップアプリを起動したあとも閉じずに居座るので、
// アプリが起動しきったころ合いを見計らって tabs.remove する。

// アプリの起動を待つ時間 (ms)。短すぎるとアプリが立ち上がる前にタブが消える。
const CLOSE_DELAY_MS = 2000;

// 「このリンクのために新しく開かれたタブ」とみなす猶予 (ms)。
// もともと開いて使っていたタブが Slack に遷移しただけのケースを巻き込まないためのガード。
const FRESH_TAB_WINDOW_MS = 15000;

// 中継ページが出る URL のパターン。Web 版クライアント (app.slack.com) は対象外にする。
const REDIRECT_URL =
  /^https:\/\/(?!app\.)[\w-]+\.slack\.com\/(archives|team|files|canvas|docs|lists|ssb\/redirect)\b/;

// 新規に作られたタブの id → 作成時刻
const freshTabs = new Map();

chrome.tabs.onCreated.addListener((tab) => {
  freshTabs.set(tab.id, Date.now());
});

chrome.tabs.onRemoved.addListener((tabId) => {
  freshTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!isFreshRedirectTab(tabId, tab.url)) return;

  setTimeout(() => closeIfStillRedirecting(tabId), CLOSE_DELAY_MS);
});

function isFreshRedirectTab(tabId, url) {
  if (!url || !REDIRECT_URL.test(url)) return false;

  const createdAt = freshTabs.get(tabId);
  if (createdAt === undefined) return false;

  return Date.now() - createdAt < FRESH_TAB_WINDOW_MS;
}

async function closeIfStillRedirecting(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // 待っている間に閉じられていた
  }

  // 待機中に「このリンクをブラウザで開く」を押しているかもしれないので、もう一度確認する。
  if (!REDIRECT_URL.test(tab.url ?? "")) return;

  // ウィンドウ最後の 1 枚を閉じると Chrome ごと終了してしまうので、その場合は残す。
  const tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId });
  if (tabsInWindow.length <= 1) return;

  chrome.tabs.remove(tabId);
}
