// claude.ai / Gemini / ChatGPT の入力欄で、Enter を改行（Shift + Enter）、Tab を送信（Enter）にする。
//
// 押されたキーのイベントを止めて別のイベントを作り直すと、サイト側が「本物のキー入力ではない」と判断して無視することがある。
// そこで、押されたキーのイベントはそのまま流し、サイトから見える key や shiftKey の値だけを書き換える。
// サイトのスクリプトから書き換えた値が見えるように、manifest.json で "world": "MAIN" を指定している。
// サイトのキー処理より先に書き換えるため、ページの読み込み開始時に window のキャプチャで受け取る。

window.addEventListener(
  "keydown",
  (event) => {
    if (!event.isTrusted) return;
    if (isImeComposing(event)) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!isTextEditor(event.target)) return;

    if (event.key === "Enter") {
      disguiseAsShiftEnter(event);
    } else if (event.key === "Tab") {
      disguiseAsEnter(event);
    }
  },
  true
);

// 日本語入力で変換を確定するための Enter は書き換えない
function isImeComposing(event) {
  return event.isComposing || event.keyCode === 229;
}

// 検索ボックスなどの 1 行の入力欄は対象にしない
function isTextEditor(el) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "TEXTAREA";
}

function disguiseAsShiftEnter(event) {
  overrideProperties(event, { shiftKey: true });
}

function disguiseAsEnter(event) {
  overrideProperties(event, { key: "Enter", code: "Enter", keyCode: 13, which: 13 });
}

function overrideProperties(event, values) {
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(event, name, { get: () => value });
  }
}
