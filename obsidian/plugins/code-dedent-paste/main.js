const obsidian = require("obsidian");
const view = require("@codemirror/view");
const language = require("@codemirror/language");

function dedent(text) {
  const lines = text.split("\n");

  // Ignore trailing empty line (common when copying from editors)
  const candidates = lines.filter((l, i) =>
    i < lines.length - 1 ? l.length > 0 : l.trim().length > 0
  );
  if (candidates.length === 0) return text;

  const indents = candidates.map((l) => l.match(/^[ \t]*/)[0].length);
  const minIndent = Math.min(...indents);
  if (minIndent === 0) return text;

  return lines.map((l) => l.slice(minIndent)).join("\n");
}

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

class CodeDedentPastePlugin extends obsidian.Plugin {
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
          if (!text) return false;

          const dedented = dedent(text);
          if (dedented === text) return false;

          evt.preventDefault();

          cmView.dispatch({
            changes: {
              from: state.selection.main.from,
              to: state.selection.main.to,
              insert: dedented,
            },
          });

          return true;
        },
      })
    );
  }
}

module.exports = CodeDedentPastePlugin;
