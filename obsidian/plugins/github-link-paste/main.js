const obsidian = require("obsidian");
const view = require("@codemirror/view");
const language = require("@codemirror/language");

// https://github.com/{owner}/{repo}/(blob|tree)/{ref}/{path}[?query][#Lxx[-Lyy]]
const GITHUB_BLOB_RE =
  /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:blob|tree)\/[^/\s]+\/([^\s#?]+)(?:\?[^\s#]*)?(#L\d+(?:-L\d+)?)?$/;

function toMarkdownLink(text) {
  const trimmed = text.trim();
  const match = trimmed.match(GITHUB_BLOB_RE);
  if (!match) return null;

  const path = decodeURIComponent(match[1]);
  const anchor = match[2] || "";
  const label = path + anchor;

  return `[${label}](${trimmed})`;
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

  const doc = state.doc;
  const cursorLine = doc.lineAt(pos).number;
  let insideFence = false;
  for (let i = 1; i <= cursorLine; i++) {
    if (doc.line(i).text.trimStart().startsWith("```")) {
      insideFence = !insideFence;
    }
  }
  return insideFence;
}

class GithubLinkPastePlugin extends obsidian.Plugin {
  async onload() {
    // Cmd+Shift+V (paste as plain text) が押された直後の paste だけ変換をスキップする
    let skipNextPaste = false;
    let skipTimer = null;

    this.registerEditorExtension(
      view.EditorView.domEventHandlers({
        keydown: (evt) => {
          if (evt.key.toLowerCase() === "v" && evt.shiftKey && (evt.metaKey || evt.ctrlKey)) {
            skipNextPaste = true;
            if (skipTimer) window.clearTimeout(skipTimer);
            skipTimer = window.setTimeout(() => {
              skipNextPaste = false;
            }, 500);
          }
          return false;
        },
        paste: (evt, cmView) => {
          const shouldSkip = skipNextPaste;
          skipNextPaste = false;
          if (shouldSkip) return false;

          const state = cmView.state;
          const cursor = state.selection.main.head;
          if (isInsideCodeBlock(state, cursor)) return false;

          const clipboard = evt.clipboardData;
          if (!clipboard) return false;
          const text = clipboard.getData("text/plain");
          if (!text) return false;

          const link = toMarkdownLink(text);
          if (!link) return false;

          evt.preventDefault();

          const from = state.selection.main.from;
          cmView.dispatch({
            changes: {
              from,
              to: state.selection.main.to,
              insert: link,
            },
            selection: { anchor: from + link.length },
          });

          return true;
        },
      })
    );
  }
}

module.exports = GithubLinkPastePlugin;
