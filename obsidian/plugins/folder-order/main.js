const obsidian = require("obsidian");

const ORDER_FILE = ".obsidian/folder-order.md";
const POLL_INTERVAL_MS = 2000;
const ROOT = "/";

const TEMPLATE = `# 表示したい順に 1 行 1 つ書く
# インデントすると、その 1 つ上の行のフォルダの中身の順番になる
# ここに書かなかったものは、この下に Obsidian の通常の順番で並ぶ
# "#" で始まる行と空行は無視される

`;

module.exports = class FolderOrderPlugin extends obsidian.Plugin {
  // parentPath -> Map<childPath, index>
  orderIndex = new Map();
  lastStamp = null;
  uninstallPatch = null;

  async onload() {
    this.app.workspace.onLayoutReady(async () => {
      await this.ensureOrderFile();
      await this.loadOrder();
      await this.patchFileExplorer();
      this.requestSort();
    });

    this.addCommand({
      id: "reload",
      name: "Reload folder order",
      callback: async () => {
        await this.loadOrder();
        this.requestSort();
        new obsidian.Notice("Folder Order: 並び順を読み直しました");
      },
    });

    this.addCommand({
      id: "open-order-file",
      name: "Open folder order file",
      callback: () => this.openOrderFile(),
    });

    this.registerInterval(
      window.setInterval(() => this.reloadIfChanged(), POLL_INTERVAL_MS)
    );

    this.register(() => {
      if (this.uninstallPatch) this.uninstallPatch();
      this.requestSort();
    });
  }

  // ---- 並び順ファイル ----

  async ensureOrderFile() {
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(ORDER_FILE)) return;

    const folders = this.app.vault
      .getRoot()
      .children.filter((child) => child instanceof obsidian.TFolder)
      .map((folder) => folder.name)
      .sort((a, b) => a.localeCompare(b));

    await adapter.write(ORDER_FILE, TEMPLATE + folders.join("\n") + "\n");
  }

  async openOrderFile() {
    // .obsidian の中はノートとして開けないので、外部エディタに任せる
    const full = this.app.vault.adapter.getFullPath(ORDER_FILE);
    window.require("electron").shell.openPath(full);
  }

  async reloadIfChanged() {
    const stat = await this.app.vault.adapter.stat(ORDER_FILE).catch(() => null);
    const stamp = stat ? `${stat.mtime}:${stat.size}` : null;
    if (stamp === this.lastStamp) return;
    this.lastStamp = stamp;
    await this.loadOrder();
    this.requestSort();
  }

  async loadOrder() {
    const adapter = this.app.vault.adapter;
    const text = (await adapter.exists(ORDER_FILE))
      ? await adapter.read(ORDER_FILE)
      : "";

    const stat = await adapter.stat(ORDER_FILE).catch(() => null);
    this.lastStamp = stat ? `${stat.mtime}:${stat.size}` : null;

    this.orderIndex = buildOrderIndex(text);
  }

  // ---- ファイルエクスプローラーへの割り込み ----

  async patchFileExplorer() {
    const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
    if (!leaf) return;
    if (leaf.isDeferred && leaf.loadIfDeferred) await leaf.loadIfDeferred();

    const view = leaf.view;
    if (typeof view?.getSortedFolderItems !== "function") return;

    const proto = Object.getPrototypeOf(view);
    const original = proto.getSortedFolderItems;
    const plugin = this;

    proto.getSortedFolderItems = function (folder) {
      const items = original.call(this, folder);
      return plugin.applyOrder(folder, items);
    };

    this.uninstallPatch = () => {
      proto.getSortedFolderItems = original;
      this.uninstallPatch = null;
    };
  }

  applyOrder(folder, items) {
    const index = this.orderIndex.get(folder?.path ?? ROOT);
    if (!index || !Array.isArray(items)) return items;

    const listed = [];
    const rest = [];
    for (const item of items) {
      const path = pathOf(item);
      if (path != null && index.has(path)) listed.push(item);
      else rest.push(item);
    }
    if (listed.length === 0) return items;

    listed.sort((a, b) => index.get(pathOf(a)) - index.get(pathOf(b)));
    return listed.concat(rest);
  }

  requestSort() {
    const view = this.app.workspace.getLeavesOfType("file-explorer")[0]?.view;
    view?.requestSort?.();
  }
};

// getSortedFolderItems が返す要素は Obsidian のバージョンによって
// TAbstractFile そのものだったり、それを包んだオブジェクトだったりする
function pathOf(item) {
  return item?.path ?? item?.file?.path ?? item?.folder?.path ?? null;
}

function buildOrderIndex(text) {
  const index = new Map();
  const stack = []; // { indent, path }

  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;

    const indent = raw.length - raw.trimStart().length;
    let name = raw.trim().replace(/^[-*]\s+/, "").replace(/\/+$/, "");
    if (!name) continue;

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    const base = stack.length ? stack[stack.length - 1].path : ROOT;
    const path = base === ROOT ? name : `${base}/${name}`;

    // "Projects/Work" のようにパスを直接書いた行も正しい親にぶら下げる
    const slash = path.lastIndexOf("/");
    const parentPath = slash === -1 ? ROOT : path.slice(0, slash);

    let siblings = index.get(parentPath);
    if (!siblings) {
      siblings = new Map();
      index.set(parentPath, siblings);
    }
    if (!siblings.has(path)) siblings.set(path, siblings.size);

    stack.push({ indent, path });
  }

  return index;
}
