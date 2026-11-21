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

// E キーを押したときにマウスのある場所を使うので、マウスの位置を覚えておく
let lastMouse = null;
document.addEventListener(
  "mousemove",
  (event) => {
    lastMouse = { x: event.clientX, y: event.clientY };
  },
  { passive: true }
);

// コメントの編集中に Esc キーを押すと、Cancel ボタンを押して編集をやめる
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.isComposing) return;
  // 絵文字やメンションの候補一覧を Esc で閉じたときは、GitHub 側が処理済みなので何もしない
  if (event.defaultPrevented) return;
  if (!(event.target instanceof HTMLTextAreaElement)) return;

  const cancelButton = findCancelButton(event.target);
  if (!cancelButton) return;

  event.preventDefault();
  cancelButton.click();
});

// 編集欄から親要素をたどり、別の入力欄を含む範囲に広がる前に見つかった Cancel ボタンを返す。
// 新しい画面では編集欄が form の中にないので、form ではなく親要素をたどって探している。
function findCancelButton(textarea) {
  for (let el = textarea.parentElement; el; el = el.parentElement) {
    if ([...el.querySelectorAll("textarea")].some((t) => t !== textarea)) return null;
    const cancelButton =
      el.querySelector(".js-comment-cancel-button") ??
      [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel");
    if (cancelButton) return cancelButton;
  }
  return null;
}

// 入力欄に文字を打っている最中の E キーは無視する
function isTyping(el) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

// Edit ボタンを押すと表示中の本文が消えるので、どの画面でも Edit ボタンを押す前に読んでいた場所を覚えておく
async function openDescriptionEditor() {
  // 新しい PR の画面: description の右上にある鉛筆ボタンを押す
  const prEditButton = document.querySelector(
    'button[data-dd-action-name="pull_requests.description.edit"]'
  );
  if (prEditButton) {
    const readingPlace = captureReadingPlace(
      prEditButton.closest("section")?.querySelector(".markdown-body")
    );
    prEditButton.click();
    focusEditor(null, readingPlace);
    return;
  }

  // 従来の PR の画面: ページ内で最初の「…」メニューが description のもの。
  // メニューの中身（Edit ボタン）はメニューを開いたときに読み込まれるので、開いてから Edit ボタンを待つ。
  const actions = document.querySelector(".timeline-comment-actions details");
  if (actions) {
    const comment = actions.closest(".js-comment");
    const readingPlace = captureReadingPlace(comment?.querySelector(".comment-body"));
    if (!actions.open) actions.querySelector("summary")?.click();
    const editButton = await waitFor(() => actions.querySelector("button.js-comment-edit-button"));
    if (!editButton) return;
    editButton.click();
    actions.open = false;
    focusEditor(comment, readingPlace);
    return;
  }

  // Issue の画面: description の「…」メニューを開いてから Edit を押す
  const issueBody = document.querySelector('[data-testid="issue-body"]');
  const menuButton = [...(issueBody?.querySelectorAll("button") ?? [])].find((b) =>
    b.querySelector("svg.octicon-kebab-horizontal")
  );
  if (!menuButton) return;
  const readingPlace = captureReadingPlace(issueBody.querySelector(".markdown-body"));
  menuButton.click();

  const editItem = await waitFor(() =>
    [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent.trim() === "Edit"
    )
  );
  if (!editItem) return;
  editItem.click();
  focusEditor(null, readingPlace);
}

// 本文の中で読んでいた場所を、「何番目の文字のかたまりの何文字目か」と「画面の上から何 px か」で返す。
// 読んでいた場所は、本文の文字を選んでいればその文字、選んでいなければマウスのある場所、
// マウスが本文の外にあれば画面の真ん中の高さにある文字にする。
function captureReadingPlace(body) {
  if (!body) return null;
  const textNodes = contentTextNodes(body);

  const selection = window.getSelection();
  const selected =
    selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
  if (selected && body.contains(selected.commonAncestorContainer)) {
    const start = positionInTextNodes(textNodes, selected.startContainer, selected.startOffset);
    if (start) {
      return {
        texts: textNodes.map((node) => node.textContent),
        start,
        end: positionInTextNodes(textNodes, selected.endContainer, selected.endOffset) ?? start,
        screenY: selected.getBoundingClientRect().top,
      };
    }
  }

  const point = pointToRead(body);
  if (!point) return null;
  const caret = document.caretRangeFromPoint(point.x, point.y);
  if (!caret || !body.contains(caret.startContainer)) return null;
  const position = positionInTextNodes(textNodes, caret.startContainer, caret.startOffset);
  if (!position) return null;
  return {
    texts: textNodes.map((node) => node.textContent),
    start: position,
    end: position,
    screenY: point.y,
  };
}

// 本文の文字のかたまり（テキストノード）を、表示されている順に返す。
// コピーボタンなど、Markdown に書かれていない部品の文字は除く。
function contentTextNodes(body) {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest("button, clipboard-copy, svg, tool-tip")) continue;
    nodes.push(node);
  }
  return nodes;
}

// 本文の中の場所を「何番目の文字のかたまりの何文字目か」に直す。
// 要素と要素の境目を指しているときは、その直後にある文字のかたまりの先頭にする。
function positionInTextNodes(textNodes, container, offset) {
  const index = textNodes.indexOf(container);
  if (index !== -1) return { index, offset };

  const boundary = document.createRange();
  boundary.setStart(container, offset);
  const nextIndex = textNodes.findIndex((node) => boundary.comparePoint(node, 0) >= 0);
  return nextIndex === -1 ? null : { index: nextIndex, offset: 0 };
}

// 読む場所として使う画面上の点を返す。マウスが本文の上にあればマウスの位置、なければ画面の真ん中の高さを使う。
// 本文が画面に映っていないときは null を返す。
function pointToRead(body) {
  const rect = body.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= window.innerHeight) return null;

  const mouseOnBody =
    lastMouse &&
    lastMouse.x >= rect.left &&
    lastMouse.x <= rect.right &&
    lastMouse.y >= rect.top &&
    lastMouse.y <= rect.bottom;
  if (mouseOnBody) return lastMouse;

  const centerY = Math.min(Math.max(window.innerHeight / 2, rect.top + 1), rect.bottom - 1);
  return { x: rect.left + rect.width / 2, y: centerY };
}

// 編集欄が表示されたら、読んでいた場所にカーソルを置き（文字を選んでいたときはその文字を選び）、
// その行を E キーを押す前と同じ画面の高さに表示する。
// 読んでいた場所がわからないときは、カーソルを本文の末尾に置く。
// container がないときは、GitHub が編集欄を開いたときに自分でフォーカスを当てるので、フォーカスの当たった入力欄を使う。
async function focusEditor(container, readingPlace) {
  const textarea = await waitFor(() => {
    if (!container) {
      const active = document.activeElement;
      return active instanceof HTMLTextAreaElement ? active : null;
    }
    return [...container.querySelectorAll("textarea")].find((t) => t.offsetParent !== null);
  });
  if (!textarea) return;
  // 編集欄の高さは本文に合わせて後から伸びるので、伸びきってから位置を計算する
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const start = readingPlace && markdownIndexOf(textarea.value, readingPlace.texts, readingPlace.start);
  if (start == null) {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    return;
  }
  const end = markdownIndexOf(textarea.value, readingPlace.texts, readingPlace.end) ?? start;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(start, Math.max(start, end));
  scrollLineTo(textarea, start, readingPlace.screenY);
}

// 「何番目の文字のかたまりの何文字目か」を、Markdown の何文字目かに直す。
// 文字のかたまりの中身は Markdown にそのまま書かれているので、本文の先頭から順に、
// 前のかたまりが見つかった場所より後ろを探していく。こうすると同じ文字が何度も出てきても順番どおりに対応が取れる。
// Markdown で見つからないかたまり（&amp; などの書き方が違うもの）は、前のかたまりの直後として扱う。
function markdownIndexOf(markdown, texts, position) {
  let searchFrom = 0;
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const found = text.trim() ? markdown.indexOf(text, searchFrom) : -1;
    if (i === position.index) {
      return found === -1 ? searchFrom : found + Math.min(position.offset, text.length);
    }
    if (found !== -1) searchFrom = found + text.length;
  }
  return null;
}

// 編集欄の index 文字目の行が画面の上から screenY px の高さに来るように、編集欄の中とページの両方をスクロールする
function scrollLineTo(textarea, index, screenY) {
  const lineTop = measureLineTop(textarea, index);
  textarea.scrollTop = lineTop - textarea.clientHeight / 2;
  const lineTopInPage =
    window.scrollY + textarea.getBoundingClientRect().top + lineTop - textarea.scrollTop;
  window.scrollTo({ top: lineTopInPage - screenY });
}

// 編集欄の index 文字目が、編集欄の一番上から何 px 下にあるかを返す。
// textarea には文字の位置を調べる方法がないので、同じ見た目の div に同じ文字を入れて測る。
function measureLineTop(textarea, index) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  for (const name of [
    "boxSizing", "width", "padding", "border", "fontFamily", "fontSize", "fontWeight",
    "lineHeight", "letterSpacing", "wordSpacing", "tabSize", "overflowWrap", "wordBreak",
  ]) {
    mirror.style[name] = style[name];
  }
  Object.assign(mirror.style, { position: "absolute", top: "0", left: "-9999px", visibility: "hidden", whiteSpace: "pre-wrap" });
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.append(marker);
  document.body.append(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
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
