const obsidian = require("obsidian");

function insertQuestionCallout(editor) {
  const header = "> [!question]";
  const selection = editor.getSelection();

  // 選択中の文字列があれば、その文字列をコールアウトの本文にする
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

class QuestionCalloutPlugin extends obsidian.Plugin {
  async onload() {
    this.addCommand({
      id: "insert-question-callout",
      name: "Insert question callout",
      editorCallback: (editor) => insertQuestionCallout(editor),
    });
  }
}

module.exports = QuestionCalloutPlugin;
