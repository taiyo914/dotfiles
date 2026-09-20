let lastActiveTab = { id: null, index: 0, windowId: null };

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    lastActiveTab = { id: tab.id, index: tab.index, windowId: tab.windowId };
  } catch {}
});

chrome.tabs.onCreated.addListener(async (newTab) => {
  if (lastActiveTab.id == null) return;
  if (newTab.windowId !== lastActiveTab.windowId) return;

  try {
    const prev = await chrome.tabs.get(lastActiveTab.id);
    const targetIndex = prev.index + 1;
    if (newTab.index !== targetIndex) {
      await chrome.tabs.move(newTab.id, { index: targetIndex });
    }
  } catch {}
});
