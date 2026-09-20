const obsidian = require("obsidian");
const { EditorView } = require("@codemirror/view");

const IMAGE_EMBED_RE = /!\[\[([^\]]+)\]\]/g;
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

function extractImagePaths(text) {
  const paths = [];
  for (const re of [IMAGE_EMBED_RE, MD_IMAGE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = re === IMAGE_EMBED_RE ? m[1] : m[2];
      paths.push(raw.split("|")[0].trim());
    }
  }
  return paths;
}

function countReferencesExcluding(app, imageFile, excludePath) {
  const resolvedLinks = app.metadataCache.resolvedLinks;
  let count = 0;
  for (const sourcePath of Object.keys(resolvedLinks)) {
    if (sourcePath === excludePath) continue;
    const links = resolvedLinks[sourcePath];
    if (links[imageFile.path] != null) {
      count += links[imageFile.path];
    }
  }
  return count;
}

class ConfirmDeleteModal extends obsidian.Modal {
  constructor(app, fileName, onConfirm) {
    super(app);
    this.fileName = fileName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("p", {
      text: `「${this.fileName}」は他のノートから参照されていません。画像ファイルも削除しますか？`,
    });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

    buttonContainer.createEl("button", { text: "ファイルも削除", cls: "mod-warning" }, (btn) => {
      btn.addEventListener("click", () => {
        this.onConfirm(true);
        this.close();
      });
    });

    buttonContainer.createEl("button", { text: "埋め込みだけ削除" }, (btn) => {
      btn.addEventListener("click", () => {
        this.onConfirm(false);
        this.close();
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ImageDeletePlugin extends obsidian.Plugin {
  async onload() {
    this._pendingPaths = new Set();
    this._pendingTimer = null;

    const ext = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;

      const removed = new Set();

      update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        const removedText = update.startState.doc.sliceString(fromA, toA);
        for (const p of extractImagePaths(removedText)) removed.add(p);
        const insertedText = inserted.toString();
        for (const p of extractImagePaths(insertedText)) removed.delete(p);
      });

      if (removed.size === 0) return;

      const newDoc = update.state.doc.toString();
      for (const p of [...removed]) {
        if (newDoc.includes(`![[${p}`) || newDoc.includes(`](${p})`)) {
          removed.delete(p);
        }
      }

      if (removed.size === 0) return;

      for (const p of removed) this._pendingPaths.add(p);
      if (this._pendingTimer) clearTimeout(this._pendingTimer);
      this._pendingTimer = setTimeout(() => {
        const paths = [...this._pendingPaths];
        this._pendingPaths.clear();
        this._promptForPaths(paths);
      }, 300);
    });

    this.registerEditorExtension(ext);
  }

  _promptForPaths(paths) {
    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const currentFilePath = view?.file?.path || "";

    const toPrompt = [];
    for (const filePath of paths) {
      const imageFile = this.app.metadataCache.getFirstLinkpathDest(filePath, currentFilePath);
      if (!imageFile) continue;
      const refs = countReferencesExcluding(this.app, imageFile, currentFilePath);
      if (refs === 0) toPrompt.push(imageFile);
    }

    this._showNextModal(toPrompt, 0);
  }

  _showNextModal(files, index) {
    if (index >= files.length) return;
    const imageFile = files[index];

    new ConfirmDeleteModal(this.app, imageFile.name, (shouldDelete) => {
      if (shouldDelete) {
        this.app.vault.trash(imageFile, false);
      }
      this._showNextModal(files, index + 1);
    }).open();
  }
}

module.exports = ImageDeletePlugin;
