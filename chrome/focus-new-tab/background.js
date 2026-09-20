// 開いたばかりのタブがバックグラウンドに回ったとき、そちらへフォーカスを移す。
//
// 対象は「新しく作られたタブの、最初のうちの遷移」だけに限る。
// 長時間開きっぱなしのタブが自分で遷移するケース (Google Meet が /home へ
// 戻る、SPA がセッション更新で画面を差し替える等) まで拾ってしまうと、
// 作業中に無関係なタブへ強制的に飛ばされることになる。

// 「このタブは新しく開かれたものだ」とみなす猶予 (ms)。
const FRESH_TAB_WINDOW_MS = 15000;

// 新規に作られたタブの id → 作成時刻
const freshTabs = new Map();

chrome.tabs.onCreated.addListener((tab) => {
  freshTabs.set(tab.id, Date.now());
});

chrome.tabs.onRemoved.addListener((tabId) => {
  freshTabs.delete(tabId);
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!isFreshTab(details.tabId)) return;

  const focusTypes = ["typed", "generated", "auto_bookmark", "link"];
  if (!focusTypes.includes(details.transitionType)) return;

  try {
    const tab = await chrome.tabs.get(details.tabId);
    if (!tab.active) {
      await chrome.tabs.update(details.tabId, { active: true });
    }
  } catch {}
});

function isFreshTab(tabId) {
  const createdAt = freshTabs.get(tabId);
  if (createdAt === undefined) return false;

  if (Date.now() - createdAt >= FRESH_TAB_WINDOW_MS) {
    freshTabs.delete(tabId);
    return false;
  }

  return true;
}
