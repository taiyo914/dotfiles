const obsidian = require("obsidian");
const { keymap } = require("@codemirror/view");
const { Prec } = require("@codemirror/state");

function getQuotePrefix(text) {
  const match = text.match(/^(\s*(?:>\s*)+)/);
  return match ? match[1] : null;
}

function isEmptyQuoteLine(text) {
  const prefix = getQuotePrefix(text);
  if (!prefix) return false;
  return text.slice(prefix.length).trim() === "";
}

class StickyQuotePlugin extends obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(
      Prec.highest(
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              const state = view.state;
              const sel = state.selection;
              if (sel.ranges.length !== 1 || !sel.main.empty) return false;

              const currentLine = state.doc.lineAt(sel.main.head);
              if (!isEmptyQuoteLine(currentLine.text)) return false;

              if (currentLine.number > 1) {
                const prevLine = state.doc.line(currentLine.number - 1);
                if (isEmptyQuoteLine(prevLine.text)) {
                  // 3rd Enter: exit — remove both empty quote lines
                  view.dispatch({
                    changes: {
                      from: prevLine.from,
                      to: currentLine.to,
                      insert: "",
                    },
                    selection: { anchor: prevLine.from },
                  });
                  return true;
                }
              }

              // 2nd Enter: stay in quote, add another empty quote line
              let prefix = getQuotePrefix(currentLine.text) || "> ";
              if (!prefix.endsWith(" ")) prefix += " ";
              const insert = "\n" + prefix;
              const insertPos = currentLine.to;
              view.dispatch({
                changes: { from: insertPos, to: insertPos, insert },
                selection: { anchor: insertPos + insert.length },
              });
              return true;
            },
          },
        ])
      )
    );
  }
}

module.exports = StickyQuotePlugin;
