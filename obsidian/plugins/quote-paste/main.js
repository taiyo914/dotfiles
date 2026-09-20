const obsidian = require("obsidian");
const view = require("@codemirror/view");

class QuotePastePlugin extends obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(
      view.EditorView.domEventHandlers({
        paste: (evt, cmView) => {
          const state = cmView.state;
          const cursor = state.selection.main.head;
          const line = state.doc.lineAt(cursor);

          if (!line.text.trimStart().startsWith(">")) return false;

          const clipboard = evt.clipboardData;
          if (!clipboard) return false;
          const text = clipboard.getData("text/plain");
          if (!text || !text.includes("\n")) return false;

          evt.preventDefault();

          const lines = text.split("\n");
          const quoted = lines
            .map((l, i) => (i === 0 ? l : "> " + l))
            .join("\n");

          cmView.dispatch({
            changes: {
              from: state.selection.main.from,
              to: state.selection.main.to,
              insert: quoted,
            },
          });

          return true;
        },
      })
    );
  }
}

module.exports = QuotePastePlugin;
