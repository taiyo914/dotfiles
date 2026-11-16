// ショートカットを押したら、タブグループの中か外に新しいタブを開く。Karabiner が Cmd+T / Cmd+Ctrl+T をこのショートカットに置き換えている
chrome.commands.onCommand.addListener(async (command, current) => {
  if (command === "new-tab-in-group") await openTabInCurrentGroup(current);
  if (command === "new-tab-outside-group") await openTabOutsideGroup(current);
});

// 今のタブのすぐ右に新しいタブを開き、今のタブがタブグループに入っていれば同じグループに入れる
async function openTabInCurrentGroup(current) {
  const newTab = await chrome.tabs.create({ windowId: current.windowId, index: current.index + 1 });
  if (isGrouped(current)) {
    await chrome.tabs.group({ groupId: current.groupId, tabIds: newTab.id });
  }
}

// 今のタブがタブグループに入っていればグループのすぐ右に、入っていなければ今のタブのすぐ右に新しいタブを開く
async function openTabOutsideGroup(current) {
  const index = isGrouped(current) ? (await lastIndexOfGroup(current)) + 1 : current.index + 1;
  const newTab = await chrome.tabs.create({ windowId: current.windowId, index });
  if (isGrouped(newTab)) {
    await chrome.tabs.ungroup(newTab.id);
  }
}

function isGrouped(tab) {
  return tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;
}

async function lastIndexOfGroup(tab) {
  const tabsInGroup = await chrome.tabs.query({ windowId: tab.windowId, groupId: tab.groupId });
  return Math.max(...tabsInGroup.map((t) => t.index));
}
