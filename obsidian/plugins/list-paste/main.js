const obsidian = require("obsidian");
const view = require("@codemirror/view");
const { keymap } = require("@codemirror/view");
const { Prec } = require("@codemirror/state");
const language = require("@codemirror/language");

const LIST_MARKER_RE = /^(\s*)(- \[[x ]\] |- )(.*)/;
const NUMBERED_RE = /^(\s*)(\d+\.\s)(.*)/;

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

function parseListLine(line) {
  const m = line.match(LIST_MARKER_RE);
  if (m) return { indent: m[1], marker: m[2], content: m[3], type: "list" };
  const n = line.match(NUMBERED_RE);
  if (n) return { indent: n[1], marker: n[2], content: n[3], type: "numbered" };
  return null;
}

function indentLen(s) {
  let len = 0;
  for (const ch of s) {
    if (ch === "\t") len += 4;
    else len++;
  }
  return len;
}

function makeIndent(n) {
  return " ".repeat(n);
}

function transformListPaste(lines, cursorIndent, cursorMarker) {
  const cursorIndentLen = indentLen(cursorIndent);

  const parsed = lines.map((l) => {
    const p = parseListLine(l);
    if (p) return p;
    return { indent: l.match(/^(\s*)/)[1], marker: "", content: l, type: "plain" };
  });

  const firstParsed = parsed[0];
  const firstIndentLen = indentLen(firstParsed.indent);

  const result = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const relativeIndent = indentLen(p.indent) - firstIndentLen;
    const newIndentLen = cursorIndentLen + relativeIndent;
    const newIndent = makeIndent(Math.max(0, newIndentLen));

    if (i === 0) {
      if (p.type === "numbered") {
        result.push(p.marker + p.content);
      } else {
        result.push(p.content);
      }
    } else {
      if (p.type === "numbered") {
        result.push(newIndent + cursorMarker + p.marker + p.content);
      } else if (p.type === "list") {
        result.push(newIndent + cursorMarker + p.content);
      } else {
        result.push(newIndent + cursorMarker + p.content);
      }
    }
  }
  return result.join("\n");
}

function transformPlainPaste(lines, cursorIndent, cursorMarker) {
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return null;

  const result = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    if (i === 0) {
      result.push(nonEmpty[i]);
    } else {
      result.push(cursorIndent + cursorMarker + nonEmpty[i]);
    }
  }
  return result.join("\n");
}

class ListPastePlugin extends obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(
      Prec.highest(
        keymap.of(
          ["Backspace", "Ctrl-h"].map((k) => ({
            key: k,
            run: (cmView) => {
              const state = cmView.state;
              const sel = state.selection;
              if (sel.ranges.length !== 1 || !sel.main.empty) return false;

              const line = state.doc.lineAt(sel.main.head);
              const m = line.text.match(LIST_MARKER_RE);
              if (!m) return false;
              if (m[3].length > 0) return false;

              if (isInsideCodeBlock(state, sel.main.head)) return false;

              if (line.number <= 1) return false;
              const prevLine = state.doc.line(line.number - 1);

              cmView.dispatch({
                changes: { from: prevLine.to, to: line.to, insert: "" },
                selection: { anchor: prevLine.to },
              });
              return true;
            },
          }))
        )
      )
    );

    this.registerEditorExtension(
      view.EditorView.domEventHandlers({
        paste: (evt, cmView) => {
          const state = cmView.state;
          const cursor = state.selection.main.head;

          if (isInsideCodeBlock(state, cursor)) return false;

          const line = state.doc.lineAt(cursor);
          const cursorMatch = line.text.match(LIST_MARKER_RE);
          if (!cursorMatch) return false;

          const cursorIndent = cursorMatch[1];
          const cursorMarker = cursorMatch[2];

          const clipboard = evt.clipboardData;
          if (!clipboard) return false;
          const text = clipboard.getData("text/plain");
          if (!text) return false;

          const lines = text.split("\n");

          // Drop trailing empty line (common when copying whole lines)
          if (lines.length > 1 && lines[lines.length - 1].trim() === "") {
            lines.pop();
          }

          if (lines.length < 2 && !parseListLine(lines[0])) return false;

          const firstLine = lines[0];
          const firstParsed = parseListLine(firstLine);

          let transformed;
          if (firstParsed) {
            transformed = transformListPaste(lines, cursorIndent, cursorMarker);
          } else {
            transformed = transformPlainPaste(lines, cursorIndent, cursorMarker);
          }

          if (transformed == null) return false;

          evt.preventDefault();

          cmView.dispatch({
            changes: {
              from: state.selection.main.from,
              to: state.selection.main.to,
              insert: transformed,
            },
          });

          return true;
        },
      })
    );
  }
}

module.exports = ListPastePlugin;
