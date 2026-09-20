chrome.commands.onCommand.addListener((command) => {
  if (command === "rename-tab") {
    // 現在アクティブなタブを取得
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        // 対象のタブでスクリプトを実行
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: renameTabTitle,
        });
      }
    });
  }
});

// ページ内で実行される関数
function renameTabTitle() {
  const currentTitle = document.title;
  // ダイアログを表示して新しい名前を入力させる
  const newTitle = prompt("新しいタブの名前を入力してください:", currentTitle);

  if (newTitle !== null && newTitle.trim() !== "") {
    document.title = newTitle;

    // Webサイト側が勝手にタイトルを戻すのを防ぐための処理（監視）
    if (!window.tabRenamerObserver) {
      window.tabRenamerObserver = new MutationObserver(() => {
        if (document.title !== newTitle) {
          document.title = newTitle;
        }
      });

      const titleElement = document.querySelector("title");
      if (titleElement) {
        window.tabRenamerObserver.observe(titleElement, { childList: true });
      } else {
        // titleタグがない場合はheadに追加
        const newTitleElement = document.createElement("title");
        newTitleElement.innerText = newTitle;
        document.head.appendChild(newTitleElement);
        window.tabRenamerObserver.observe(newTitleElement, { childList: true });
      }
    }
  }
}
