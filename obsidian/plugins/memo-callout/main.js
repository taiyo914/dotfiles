const obsidian = require("obsidian");

function insertMemoCallout(editor, header) {
  const selection = editor.getSelection();

  if (selection) {
    const quotedLines = selection
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    editor.replaceSelection(`${header}\n${quotedLines}\n`);
    return;
  }

  const cursor = editor.getCursor();
  editor.replaceRange(`${header}\n> `, cursor);
  editor.setCursor({ line: cursor.line + 1, ch: 2 });
}

class MemoCalloutPlugin extends obsidian.Plugin {
  async onload() {
    this.addCommand({
      id: "insert-memo-callout",
      name: "Insert memo callout",
      editorCallback: (editor) => insertMemoCallout(editor, "> [!memo]"),
    });

    this.addCommand({
      id: "insert-memo-callout-nt",
      name: "Insert memo callout (no title)",
      editorCallback: (editor) => insertMemoCallout(editor, "> [!memo|nt]"),
    });
  }
}

module.exports = MemoCalloutPlugin;
