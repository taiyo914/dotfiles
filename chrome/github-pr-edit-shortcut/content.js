// PR / Issue の画面で E キーを押すと、description（最初のコメント）の編集画面を開く。
// GitHub はページ遷移を JS で行うので、リスナーは document に 1 回だけ付けて、押された時点の URL で判定する。

const TARGET_PATH = /^\/[^/]+\/[^/]+\/(pull|issues)\/\d+\/?$/;

document.addEventListener("keydown", (event) => {
  if (event.key !== "e" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (!TARGET_PATH.test(location.pathname)) return;
  if (isTyping(event.target)) return;

  event.preventDefault();
  openDescriptionEditor();
});

// コメントの編集中に Esc キーを押すと、Cancel ボタンを押して編集をやめる
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.isComposing) return;
  // 絵文字やメンションの候補一覧を Esc で閉じたときは、GitHub 側が処理済みなので何もしない
  if (event.defaultPrevented) return;
  if (!(event.target instanceof HTMLTextAreaElement)) return;

  const form = event.target.closest("form");
  const cancelButton =
    form?.querySelector(".js-comment-cancel-button") ??
    [...(form?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Cancel");
  if (!cancelButton) return;

  event.preventDefault();
  cancelButton.click();
});

// 入力欄に文字を打っている最中の E キーは無視する
function isTyping(el) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

async function openDescriptionEditor() {
  // 従来の画面: ページ内で最初の「…」メニューが description のもの。
  // メニューの中身（Edit ボタン）はメニューを開いたときに読み込まれるので、開いてから Edit ボタンを待つ。
  const actions = document.querySelector(".timeline-comment-actions details");
  if (actions) {
    if (!actions.open) actions.querySelector("summary")?.click();
    const editButton = await waitFor(() => actions.querySelector("button.js-comment-edit-button"));
    if (!editButton) return;
    editButton.click();
    actions.open = false;
    focusEditor(editButton.closest(".js-comment"));
    return;
  }

  // React で作られた新しい画面: 「…」メニューを開いてから Edit を押す
  const menuButton = document.querySelector(
    'button[aria-label*="body actions" i], button[aria-label="Show options"]'
  );
  if (!menuButton) return;
  menuButton.click();

  const editItem = await waitFor(() =>
    [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent.trim() === "Edit"
    )
  );
  if (!editItem) return;
  editItem.click();
  focusEditor(null);
}

// 編集欄が表示されたらカーソルを本文の末尾に置く
async function focusEditor(container) {
  const textarea = await waitFor(() => {
    const candidates = (container ?? document).querySelectorAll("textarea");
    return [...candidates].find(
      (t) => t.offsetParent !== null && t.id !== "new_comment_field"
    );
  });
  if (!textarea) return;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

// 要素が見つかるまで最大 2 秒待つ
async function waitFor(find, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = find();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}
