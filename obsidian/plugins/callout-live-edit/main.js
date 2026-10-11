const obsidian = require("obsidian");
const { ViewPlugin, Decoration, EditorView, keymap } = require("@codemirror/view");
const { EditorState, EditorSelection, Prec, RangeSetBuilder } = require("@codemirror/state");
const { syntaxTree } = require("@codemirror/language");

// callout の 1 行目。例: "> [!note] タイトル"、"> [!memo|nt]"、"> [!tip]- 折りたたみ"
const HEADER_RE = /^> ?\[!([^\]]+)\]([+-]?)(?:[ \t]+|$)/;
// 行頭の "> "（"> " が 1 つだけの callout を対象にする。入れ子の callout は外側だけ扱う）
const PREFIX_RE = /^> ?/;
// 本文の先頭にある字下げとリスト記号。折り返した 2 行目以降の位置を揃えるために幅を測る
const INDENT_RE = /^[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+)?/;

function isLivePreview(state) {
  return state.field(obsidian.editorLivePreviewField, false) === true;
}

function quotePrefixLength(text) {
  const match = text.match(PREFIX_RE);
  return match ? match[0].length : 0;
}

function isInCodeBlock(state, pos) {
  return /codeblock/.test(syntaxTree(state).resolveInner(pos, 1).name);
}

// lineNumber の行を含む、">" で始まる行のまとまりを返す
function findQuoteBlock(doc, lineNumber) {
  if (!doc.line(lineNumber).text.startsWith(">")) return null;
  let first = lineNumber;
  while (first > 1 && doc.line(first - 1).text.startsWith(">")) first--;
  let last = lineNumber;
  while (last < doc.lines && doc.line(last + 1).text.startsWith(">")) last++;
  return { first, last };
}

// 引用のまとまりが callout なら、種類やタイトルを付けて返す。callout でなければ null
function parseCallout(state, block) {
  const firstLine = state.doc.line(block.first);
  const match = firstLine.text.match(HEADER_RE);
  if (!match) return null;
  // コードブロックの中に書かれた "> [!note]" は callout ではない
  if (isInCodeBlock(state, firstLine.from)) return null;

  const [type, metadata = ""] = match[1].split("|");
  return {
    first: block.first,
    last: block.last,
    type: type.trim().toLowerCase(),
    metadata: metadata.trim(),
    // "> [!note] " までの文字数。タイトルをクリックしたときに、ここより後ろから文字を探す
    markerLength: match[0].length,
  };
}

function findCallout(state, lineNumber) {
  const block = findQuoteBlock(state.doc, lineNumber);
  return block ? parseCallout(state, block) : null;
}

const hidePrefix = Decoration.replace({});

function buildDecorations(view) {
  const state = view.state;
  const decorations = new RangeSetBuilder();
  // カーソルが中に入れない範囲（隠した "> "）
  const atomic = new RangeSetBuilder();
  if (!isLivePreview(state)) {
    return { decorations: decorations.finish(), atomic: atomic.finish() };
  }

  const hide = (from, to, deco) => {
    decorations.add(from, to, deco);
    atomic.add(from, to, deco);
  };

  let doneUntil = 0;
  for (const { from, to } of view.visibleRanges) {
    const endLine = state.doc.lineAt(to).number;
    for (let n = state.doc.lineAt(from).number; n <= endLine; n++) {
      if (n <= doneUntil) continue;
      const block = findQuoteBlock(state.doc, n);
      if (!block) continue;
      doneUntil = block.last;
      const callout = parseCallout(state, block);
      if (!callout) continue;

      for (let i = callout.first; i <= callout.last; i++) {
        const line = state.doc.line(i);
        const prefixLength = quotePrefixLength(line.text);
        // "callout" クラスと data-callout を付けると、Obsidian 本体や CSS スニペットが
        // 種類ごとに決めている色（--callout-color など）がこの行でも使える
        const classes = ["callout", "cm-callout-edit"];
        if (i === callout.first) classes.push("cm-callout-edit-first");
        if (i === callout.last) classes.push("cm-callout-edit-last");
        const attributes = {
          "data-callout": callout.type,
          "data-callout-metadata": callout.metadata,
        };

        if (i > callout.first) {
          const indent = line.text.slice(prefixLength).match(INDENT_RE)[0];
          if (indent) {
            const columns = indent.replace(/\t/g, " ".repeat(state.tabSize)).length;
            attributes.style = `--callout-edit-indent: ${Math.floor(columns * view.defaultCharacterWidth)}px`;
          }
          decorations.add(line.from, line.from, Decoration.line({ class: classes.join(" "), attributes }));
          hide(line.from, line.from + prefixLength, hidePrefix);
          continue;
        }

        // ここから下はタイトル行（1 行目）
        classes.push("cm-callout-edit-title");
        decorations.add(line.from, line.from, Decoration.line({ class: classes.join(" "), attributes }));
        hide(line.from, line.from + prefixLength, hidePrefix);
      }
    }
  }

  return { decorations: decorations.finish(), atomic: atomic.finish() };
}

const calloutEditPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.build(view);
    }

    update(update) {
      this.build(update.view);
    }

    build(view) {
      const { decorations, atomic } = buildDecorations(view);
      this.decorations = decorations;
      this.atomic = atomic;
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
  }
);

// クリックや Home キーで、隠してある "> " の前にカーソルが来ることがある。
// そこで文字を打つと ">" の前に文字が入って callout が壊れるので、カーソルを "> " の後ろへ動かす。
const keepCursorAfterPrefix = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.docChanged) return tr;
  const state = tr.startState;
  if (!isLivePreview(state)) return tr;

  let moved = false;
  const ranges = tr.selection.ranges.map((range) => {
    if (!range.empty) return range;
    const line = state.doc.lineAt(range.head);
    const prefixEnd = line.from + quotePrefixLength(line.text);
    if (range.head >= prefixEnd) return range;
    if (!findCallout(state, line.number)) return range;
    moved = true;
    return EditorSelection.cursor(prefixEnd);
  });
  if (!moved) return tr;
  return [tr, { selection: EditorSelection.create(ranges, tr.selection.mainIndex), sequential: true }];
});

// カーソルが 1 つだけで、範囲選択をしていないときに、カーソルのある行と callout を返す
function cursorLineInCallout(state) {
  if (!isLivePreview(state)) return null;
  const selection = state.selection;
  if (selection.ranges.length !== 1 || !selection.main.empty) return null;
  const line = state.doc.lineAt(selection.main.head);
  const callout = findCallout(state, line.number);
  return callout ? { head: selection.main.head, line, callout } : null;
}

// 本文の行頭で Backspace: "> " だけが消えて callout が途中で切れるのを防ぎ、前の行とつなげる
function joinWithPreviousLine(view) {
  const found = cursorLineInCallout(view.state);
  if (!found) return false;
  const { head, line, callout } = found;
  if (line.number === callout.first) return false;
  if (head !== line.from + quotePrefixLength(line.text)) return false;

  const previousLine = view.state.doc.line(line.number - 1);
  view.dispatch({
    changes: { from: previousLine.to, to: head },
    scrollIntoView: true,
    userEvent: "delete.backward",
  });
  return true;
}

// 行末で Delete: 次の行の "> " ごと消して、次の行とつなげる
function joinWithNextLine(view) {
  const found = cursorLineInCallout(view.state);
  if (!found) return false;
  const { head, line, callout } = found;
  if (head !== line.to || line.number === callout.last) return false;

  const nextLine = view.state.doc.line(line.number + 1);
  view.dispatch({
    changes: { from: head, to: nextLine.from + quotePrefixLength(nextLine.text) },
    userEvent: "delete.forward",
  });
  return true;
}

// --- クリックした場所にカーソルを置く ---
// Obsidian は、表示用の callout をクリックすると callout 全体を選択する。
// その代わりに、クリックした文字が Markdown のどこにあるかを探して、そこにカーソルを置く。

// ここをクリックしたときは Obsidian の元の動作（リンクを開く、折りたたむ、など）に任せる
const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "audio",
  "video",
  ".callout-fold",
  ".is-collapsible > .callout-title",
  ".embed-actions",
  ".interactive-child",
  ".internal-embed",
  ".copy-code-button",
].join(", ");

// クリックした位置の前後 8 文字。文字のまとまり全体が Markdown に見つからないときに使う
const NEARBY_CHARS = 8;

function countOccurrences(haystack, needle) {
  let count = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) count++;
  return count;
}

// クリックした位置を含む、改行や装飾で区切られていない文字のまとまりを返す。
// offset は、まとまりの先頭からクリックした位置までの文字数
function clickedSegment(caret) {
  const node = caret.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent;
  const start = text.lastIndexOf("\n", caret.startOffset - 1) + 1;
  let end = text.indexOf("\n", caret.startOffset);
  if (end < 0) end = text.length;
  if (!text.slice(start, end).trim()) return null;
  return { node, start, text: text.slice(start, end), offset: caret.startOffset - start };
}

// クリックした文字が本文のどこにあるかを探す。見つからなければ null
function findInBody(view, callout, contentEl, segment) {
  const doc = view.state.doc;
  const nearbyStart = Math.max(0, segment.offset - NEARBY_CHARS);
  const attempts = [
    segment,
    {
      node: segment.node,
      start: segment.start + nearbyStart,
      text: segment.text.slice(nearbyStart, segment.offset + NEARBY_CHARS),
      offset: segment.offset - nearbyStart,
    },
  ];

  for (const attempt of attempts) {
    const candidates = [];
    for (let i = callout.first + 1; i <= callout.last; i++) {
      const line = doc.line(i);
      let index = line.text.indexOf(attempt.text, quotePrefixLength(line.text));
      while (index >= 0) {
        candidates.push(line.from + index);
        index = line.text.indexOf(attempt.text, index + 1);
      }
    }
    if (candidates.length === 0) continue;

    // 同じ文字が本文に何回も出てくるときは、表示上でクリックした場所より前に出てくる回数を数えて、
    // Markdown でも同じ順番のものを選ぶ
    const before = contentEl.ownerDocument.createRange();
    before.setStart(contentEl, 0);
    before.setEnd(attempt.node, attempt.start);
    const rank = countOccurrences(before.toString(), attempt.text);
    return candidates[Math.min(rank, candidates.length - 1)] + attempt.offset;
  }
  return null;
}

function findClickedPosition(view, callout, widgetEl, event) {
  const doc = view.state.doc;
  const titleLine = doc.line(callout.first);
  const caret = widgetEl.ownerDocument.caretRangeFromPoint(event.clientX, event.clientY);
  const segment = caret ? clickedSegment(caret) : null;

  // 入れ子の callout のタイトルと区別するため、一番外側のタイトルと本文だけを取る
  const titleEl = widgetEl.querySelector(".callout > .callout-title");
  const contentEl = widgetEl.querySelector(".callout > .callout-content");

  if (titleEl && titleEl.contains(event.target)) {
    const index = segment ? titleLine.text.indexOf(segment.text, callout.markerLength) : -1;
    return index >= 0 ? titleLine.from + index + segment.offset : titleLine.to;
  }

  if (segment && contentEl && contentEl.contains(segment.node)) {
    const pos = findInBody(view, callout, contentEl, segment);
    if (pos !== null) return pos;
  }

  // 場所がわからないとき（余白をクリックした、数式をクリックした、など）は本文の先頭に置く
  if (callout.last === callout.first) return titleLine.to;
  const firstBodyLine = doc.line(callout.first + 1);
  return firstBodyLine.from + quotePrefixLength(firstBodyLine.text);
}

function handleCalloutClick(event) {
  if (event.button !== 0 || event.detail > 1) return;
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (!target || typeof target.closest !== "function") return;
  const widgetEl = target.closest(".cm-embed-block.cm-callout");
  if (!widgetEl || target.closest(INTERACTIVE_SELECTOR)) return;

  // callout の文字をドラッグで選択した直後は何もしない（コピーするための選択を消さない）
  const domSelection = widgetEl.ownerDocument.getSelection();
  if (
    domSelection &&
    !domSelection.isCollapsed &&
    (widgetEl.contains(domSelection.anchorNode) || widgetEl.contains(domSelection.focusNode))
  ) {
    return;
  }

  const view = EditorView.findFromDOM(widgetEl);
  if (!view || !isLivePreview(view.state)) return;
  let callout;
  try {
    callout = findCallout(view.state, view.state.doc.lineAt(view.posAtDOM(widgetEl)).number);
  } catch (e) {
    return;
  }
  if (!callout) return;

  const pos = findClickedPosition(view, callout, widgetEl, event);
  // Obsidian 側のクリック処理（callout 全体の選択）に届かないように止める
  event.preventDefault();
  event.stopPropagation();
  view.focus();
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
}

class CalloutLiveEditPlugin extends obsidian.Plugin {
  async onload() {
    // Obsidian 側の処理より先に受け取るために capture を使う
    this.registerDomEvent(document, "click", handleCalloutClick, { capture: true });
    // 別ウィンドウで開いたノートにも同じ処理を付ける
    this.registerEvent(
      this.app.workspace.on("window-open", (_, win) => {
        this.registerDomEvent(win.document, "click", handleCalloutClick, { capture: true });
      })
    );

    this.registerEditorExtension([
      calloutEditPlugin,
      keepCursorAfterPrefix,
      Prec.high(
        keymap.of([
          { key: "Backspace", run: joinWithPreviousLine },
          { key: "Delete", run: joinWithNextLine },
        ])
      ),
    ]);
  }
}

module.exports = CalloutLiveEditPlugin;
