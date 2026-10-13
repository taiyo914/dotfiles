
// タイトルを強制的に維持する関数（ページ内で実行される）
function enforceTitle(title) {
  // 1. 目標のタイトルをグローバル変数に保存（変更があったときに参照するため）
  window.customTitle = title;
  document.title = title;

  // すでに監視が動いているなら、タイトルの更新だけで終了
  if (window.isTitleObserverActive) return;

  // 2. タイトルの変更を監視する設定
  const target = document.querySelector('title');
  const observer = new MutationObserver(() => {
    // サイト側がタイトルを変えようとしたら、設定したタイトルに戻す
    if (document.title !== window.customTitle) {
      document.title = window.customTitle;
    }
  });

  // 監視を開始
  if (target) {
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    window.isTitleObserverActive = true;
  }
}

// コマンド（ショートカット）実行時の処理
chrome.commands.onCommand.addListener((command) => {
  if (command === 'rename-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

      try {
        // 入力プロンプトを表示
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const current = window.customTitle || document.title;
            const newTitle = prompt("新しいタブ名を入力してください:", current);
            return newTitle;
          }
        });

        const newTitle = results[0]?.result;
        
        // 入力があれば適用して保存
        if (newTitle) {
          // 監視スクリプトを注入して実行
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: enforceTitle,
            args: [newTitle]
          });

          // ストレージに保存
          const key = `tab_${tab.id}`;
          await chrome.storage.local.set({ [key]: newTitle });
        }
      } catch (e) {
        console.log("実行できませんでした:", e);
      }
    });
  }
});

// ページ読み込み完了時（リロード時）の処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const key = `tab_${tabId}`;
    chrome.storage.local.get([key], (result) => {
      const savedTitle = result[key];
      if (savedTitle) {
        // 保存されたタイトルがあれば、監視付きで適用
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: enforceTitle,
          args: [savedTitle]
        }).catch(() => {});
      }
    });
  }
});

// タブを閉じたときの掃除
chrome.tabs.onRemoved.addListener((tabId) => {
  const key = `tab_${tabId}`;
  chrome.storage.local.remove(key);
});