const obsidian = require("obsidian");
const view = require("@codemirror/view");
const state = require("@codemirror/state");
const language = require("@codemirror/language");

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
    const lineText = doc.line(i).text;
    if (lineText.trimStart().startsWith("```")) {
      insideFence = !insideFence;
    }
  }
  return insideFence;
}

const tabToSpacesKeymap = view.keymap.of([
  {
    key: "Tab",
    run(cmView) {
      const editorState = cmView.state;
      const sel = editorState.selection.main;

      if (!isInsideCodeBlock(editorState, sel.head)) return false;

      if (sel.empty) {
        cmView.dispatch({
          changes: { from: sel.head, insert: "  " },
          selection: { anchor: sel.head + 2 },
        });
      } else {
        const doc = editorState.doc;
        const fromLine = doc.lineAt(sel.from).number;
        const toLine = doc.lineAt(sel.to).number;
        const changes = [];
        for (let i = fromLine; i <= toLine; i++) {
          const line = doc.line(i);
          changes.push({ from: line.from, insert: "  " });
        }
        cmView.dispatch({ changes });
      }
      return true;
    },
  },
  {
    key: "Shift-Tab",
    run(cmView) {
      const editorState = cmView.state;
      const sel = editorState.selection.main;

      if (!isInsideCodeBlock(editorState, sel.head)) return false;

      const doc = editorState.doc;
      const fromLine = doc.lineAt(sel.from).number;
      const toLine = doc.lineAt(sel.to).number;
      const changes = [];
      for (let i = fromLine; i <= toLine; i++) {
        const line = doc.line(i);
        const text = line.text;
        if (text.startsWith("  ")) {
          changes.push({ from: line.from, to: line.from + 2 });
        } else if (text.startsWith(" ")) {
          changes.push({ from: line.from, to: line.from + 1 });
        } else if (text.startsWith("\t")) {
          changes.push({ from: line.from, to: line.from + 1 });
        }
      }
      if (changes.length > 0) {
        cmView.dispatch({ changes });
      }
      return true;
    },
  },
]);

class CodeTabToSpacesPlugin extends obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(state.Prec.highest(tabToSpacesKeymap));
  }
}

module.exports = CodeTabToSpacesPlugin;
