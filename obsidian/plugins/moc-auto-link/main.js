const obsidian = require("obsidian");

const NOTES_DIR = "notes";
const MOC_PATH = `${NOTES_DIR}/MOC.md`;
const MARKER = "【👇 新しく作ったノートはココに配置】";
// cmd+shift+D で作られるデイリーノート（YYMMDD_）だけを対象にする
const DAILY_NOTE_RE = /^\d{6}_$/;

function insertLink(content, link) {
  const lines = content.split("\n");
  const markerIndex = lines.findIndex((line) => line.includes(MARKER));
  if (markerIndex === -1) return null;

  // マーカーの下の空行を飛ばして、リストの先頭に差し込む
  let i = markerIndex + 1;
  while (i < lines.length && lines[i].trim() === "") i++;

  lines.splice(i, 0, link);
  // リストが空で次が見出しだった場合は、見出しとの間に空行を入れる
  if ((lines[i + 1] ?? "").startsWith("#")) lines.splice(i + 1, 0, "");

  return lines.join("\n");
}

class MocAutoLinkPlugin extends obsidian.Plugin {
  async onload() {
    // 起動時の読み込みでも create は発火するので、レイアウト確定後に登録する
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.vault.on("create", (file) => {
          if (this._isDailyNote(file)) this._addLinkToMoc(file.basename);
        })
      );
    });
  }

  _isDailyNote(file) {
    return (
      file instanceof obsidian.TFile &&
      file.extension === "md" &&
      file.parent?.path === NOTES_DIR &&
      DAILY_NOTE_RE.test(file.basename)
    );
  }

  async _addLinkToMoc(basename) {
    const moc = this.app.vault.getAbstractFileByPath(MOC_PATH);
    if (!(moc instanceof obsidian.TFile)) return;

    const link = `[[${basename}]]`;
    let added = false;

    await this.app.vault.process(moc, (content) => {
      if (content.includes(link)) return content;
      const next = insertLink(content, link);
      if (next === null) return content;
      added = true;
      return next;
    });

    if (added) new obsidian.Notice(`MOC: ${link} を追加しました`);
  }
}

module.exports = MocAutoLinkPlugin;
