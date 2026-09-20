const obsidian = require("obsidian");
const view = require("@codemirror/view");
const language = require("@codemirror/language");

function isInsideCodeBlock(state, pos) {
  const tree = language.syntaxTree(state);
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

  // Fallback: scan document lines for ``` fences
  const doc = state.doc;
  const cursorLine = doc.lineAt(pos).number;
  let insideFence = false;
  for (let i = 1; i <= cursorLine; i++) {
    const lineText = doc.line(i).text;
    if (lineText.trimStart().startsWith("```")) {
      insideFence = !insideFence;
    }
  }
  return insideFence;
}

function trimTrailingBlankLines(text) {
  return text.replace(/(\r?\n[ \t]*)+$/, "");
}

class CodePlainPastePlugin extends obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(
      view.EditorView.domEventHandlers({
        paste: (evt, cmView) => {
          const state = cmView.state;
          const cursor = state.selection.main.head;

          if (!isInsideCodeBlock(state, cursor)) return false;

          const clipboard = evt.clipboardData;
          if (!clipboard) return false;
          const text = clipboard.getData("text/plain");
          if (text == null) return false;

          const trimmed = trimTrailingBlankLines(text);

          evt.preventDefault();
          evt.stopImmediatePropagation();

          cmView.dispatch({
            changes: {
              from: state.selection.main.from,
              to: state.selection.main.to,
              insert: trimmed,
            },
          });

          return true;
        },
      })
    );
  }
}

module.exports = CodePlainPastePlugin;
