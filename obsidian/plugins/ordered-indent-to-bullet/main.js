const obsidian = require("obsidian");
const { keymap } = require("@codemirror/view");
const { Prec } = require("@codemirror/state");
const language = require("@codemirror/language");

const ORDERED_LINE_RE = /^(\s*)(\d+)([.)])(\s+)/;
const BULLET_LINE_RE = /^(\s*)([-*+])(\s+)/;

// 行頭のインデントの幅を、タブ1つを tabSize 個のスペースとして数える
function indentWidth(text, tabSize) {
  const leading = text.match(/^\s*/)[0];
  let width = 0;
  for (const ch of leading) width += ch === "\t" ? tabSize : 1;
  return width;
}

// 行頭の空白からインデントを1段ぶん取り除く
function removeOneIndent(leading, tabSize) {
  if (leading.startsWith("\t")) return leading.slice(1);
  let count = 0;
  while (count < tabSize && leading[count] === " ") count++;
  return leading.slice(count);
}

// 指定した深さで上にある、同じ深さの番号付きの行を探す
function findPrevOrderedSibling(doc, lineNumber, width, tabSize) {
  for (let i = lineNumber - 1; i >= 1; i--) {
    const text = doc.line(i).text;
    if (text.trim() === "") continue;
    const w = indentWidth(text, tabSize);
    if (w > width) continue;
    if (w < width) return null;
    const m = text.match(ORDERED_LINE_RE);
    if (!m) return null;
    return { number: Number(m[2]), delimiter: m[3] };
  }
  return null;
}

// 下に続く同じ深さの番号付きの行を、startNumber の次から順に振り直す
function renumberFollowingSiblings(doc, lineNumber, width, startNumber, tabSize) {
  const changes = [];
  let expected = startNumber + 1;
  for (let i = lineNumber + 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.text.trim() === "") continue;
    const w = indentWidth(line.text, tabSize);
    if (w > width) continue;
    if (w < width) break;
    const m = line.text.match(ORDERED_LINE_RE);
    if (!m) break;
    if (Number(m[2]) !== expected) {
      const numberStart = line.from + m[1].length;
      changes.push({ from: numberStart, to: numberStart + m[2].length, insert: String(expected) });
    }
    expected++;
  }
  return changes;
}

// Tab でインデントした行が抜けたぶん、後ろに続く同じ深さの番号付きの行の番号を詰める
function buildRenumberAfterIndent(doc, fromLine, toLine, tabSize) {
  const selectedLines = [];
  for (let i = fromLine; i <= toLine; i++) {
    const text = doc.line(i).text;
    if (text.trim() !== "") selectedLines.push(text);
  }
  if (selectedLines.length === 0) return [];

  const width = Math.min(...selectedLines.map((text) => indentWidth(text, tabSize)));
  const prev = findPrevOrderedSibling(doc, fromLine, width, tabSize);
  let startNumber;
  if (prev) {
    startNumber = prev.number;
  } else {
    const firstOrdered = selectedLines
      .filter((text) => indentWidth(text, tabSize) === width)
      .map((text) => text.match(ORDERED_LINE_RE))
      .find(Boolean);
    if (!firstOrdered) return [];
    startNumber = Number(firstOrdered[2]) - 1;
  }
  return renumberFollowingSiblings(doc, toLine, width, startNumber, tabSize);
}

// カーソルの位置がコードブロックの中かどうかを調べる
function isInsideCodeBlock(editorState, pos) {
  const tree = language.syntaxTree(editorState);
  let node = tree.resolveInner(pos, -1);
  while (node) {
    const name = node.type.name;
    if (
      name === "FencedCode" ||
      name === "CodeBlock" ||
      name === "fenced_code" ||
      name.includes("codeblock") ||
      name.includes("CodeBlock")
    ) {
      return true;
    }
    node = node.parent;
  }

  const doc = editorState.doc;
  const cursorLine = doc.lineAt(pos).number;
  let insideFence = false;
  for (let i = 1; i <= cursorLine; i++) {
    if (doc.line(i).text.trimStart().startsWith("```")) {
      insideFence = !insideFence;
    }
  }
  return insideFence;
}

// 1行をインデントし、番号付きの行なら先頭の「1. 」などを「- 」に置き換える
function buildLineChanges(line, indentUnit) {
  const changes = [{ from: line.from, insert: indentUnit }];
  const m = line.text.match(ORDERED_LINE_RE);
  if (m) {
    const markerStart = line.from + m[1].length;
    const markerEnd = markerStart + m[2].length + m[3].length + m[4].length;
    changes.push({ from: markerStart, to: markerEnd, insert: "- " });
  }
  return changes;
}

class OrderedIndentToBulletPlugin extends obsidian.Plugin {
  // Tab と Shift + Tab を、Obsidian の標準の処理より先にこのプラグインで処理する
  async onload() {
    this.registerEditorExtension(
      Prec.highest(
        keymap.of([
          {
            key: "Tab",
            run: (cmView) => this.handleTab(cmView),
          },
          {
            key: "Shift-Tab",
            run: (cmView) => this.handleShiftTab(cmView),
          },
        ])
      )
    );
  }

  // Obsidian の設定から、タブ1つをスペース何個ぶんとして扱うかを読む
  getTabSize() {
    return this.app.vault.getConfig("tabSize") || 4;
  }

  // Obsidian の設定から、インデント1段ぶんの文字列を作る
  getIndentUnit() {
    const useTab = this.app.vault.getConfig("useTab");
    return useTab ? "\t" : " ".repeat(this.getTabSize());
  }

  // 選んだ行をインデントし、番号付きの行を箇条書きに変えて、後ろの番号を詰める
  handleTab(cmView) {
    const state = cmView.state;
    const sel = state.selection.main;

    if (isInsideCodeBlock(state, sel.head)) return false;

    const fromLine = state.doc.lineAt(sel.from).number;
    const toLine = state.doc.lineAt(sel.to).number;

    let hasOrdered = false;
    for (let i = fromLine; i <= toLine; i++) {
      if (ORDERED_LINE_RE.test(state.doc.line(i).text)) {
        hasOrdered = true;
        break;
      }
    }
    if (!hasOrdered) return false;

    const indentUnit = this.getIndentUnit();
    const changes = [];
    for (let i = fromLine; i <= toLine; i++) {
      changes.push(...buildLineChanges(state.doc.line(i), indentUnit));
    }
    changes.push(...buildRenumberAfterIndent(state.doc, fromLine, toLine, this.getTabSize()));

    cmView.dispatch({ changes });
    return true;
  }

  // 箇条書きの行のインデントを戻し、上に同じ深さの番号付きの行があれば番号付きの行に戻す
  handleShiftTab(cmView) {
    const state = cmView.state;
    const sel = state.selection.main;
    if (isInsideCodeBlock(state, sel.head)) return false;

    const doc = state.doc;
    const line = doc.lineAt(sel.from);
    if (doc.lineAt(sel.to).number !== line.number) return false;

    const m = line.text.match(BULLET_LINE_RE);
    if (!m || m[1].length === 0) return false;

    const tabSize = this.getTabSize();
    const newLeading = removeOneIndent(m[1], tabSize);
    const width = indentWidth(newLeading, tabSize);
    const prev = findPrevOrderedSibling(doc, line.number, width, tabSize);
    if (!prev) return false;

    const number = prev.number + 1;
    const changes = [
      { from: line.from, to: line.from + m[0].length, insert: `${newLeading}${number}${prev.delimiter} ` },
      ...renumberFollowingSiblings(doc, line.number, width, number, tabSize),
    ];
    cmView.dispatch({ changes });
    return true;
  }
}

module.exports = OrderedIndentToBulletPlugin;
