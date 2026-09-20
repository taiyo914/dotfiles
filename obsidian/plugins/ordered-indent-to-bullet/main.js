const obsidian = require("obsidian");
const { keymap } = require("@codemirror/view");
const { Prec } = require("@codemirror/state");
const language = require("@codemirror/language");

const ORDERED_LINE_RE = /^(\s*)(\d+)([.)])(\s+)/;

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

// Builds the CodeMirror changes for indenting a single line. If the line is
// a numbered list item ("1. foo"), the marker is replaced with "- " so the
// indented line becomes a plain bullet instead of a renumbered sub-list.
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
  async onload() {
    this.registerEditorExtension(
      Prec.highest(
        keymap.of([
          {
            key: "Tab",
            run: (cmView) => this.handleTab(cmView),
          },
        ])
      )
    );
  }

  getIndentUnit() {
    const useTab = this.app.vault.getConfig("useTab");
    const tabSize = this.app.vault.getConfig("tabSize");
    return useTab ? "\t" : " ".repeat(tabSize || 4);
  }

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

    cmView.dispatch({ changes });
    return true;
  }
}

module.exports = OrderedIndentToBulletPlugin;
