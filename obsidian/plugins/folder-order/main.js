const obsidian = require("obsidian");

const ORDER_FILE = "folder_order.md";
// 以前の置き場所。新しい場所にファイルがなければ中身を引き継ぐ
const LEGACY_ORDER_FILE = ".obsidian/folder-order.md";
const POLL_INTERVAL_MS = 2000;
const ROOT = "/";
// Obsidian のエディタのタブ幅の初期値に合わせる
const TAB_WIDTH = 4;

const TEMPLATE = `# 表示したい順に 1 行 1 つ書く
# インデントすると、その 1 つ上の行のフォルダの中身の順番になる
# ここに書かなかったものは、この下に Obsidian の通常の順番で並ぶ
# "#" で始まる行と空行は無視される
# フォルダ名の後ろに ": asc" か ": desc" を付けると、そのフォルダの中で
# ここに書かなかったものが名前の昇順 / 降順で並ぶ (例: "notes: desc")
# "*" は 1 階層分の任意の名前、"**" は 0 階層以上の任意のフォルダに一致する
# (例: "*/notes" は books/notes や tmp/notes、"**/notes" は深さを問わず notes)
# 1 つのフォルダに複数の行が当てはまるときは、上に書いた行が優先される

`;

const DIRECTION_PATTERN = /\s*:\s*(asc|desc)\s*$/i;
const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

module.exports = class FolderOrderPlugin extends obsidian.Plugin {
  // 並び順ファイルの 1 行ごとの規則。上に書いた行ほど前にある
  rules = [];
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

    if (await adapter.exists(LEGACY_ORDER_FILE)) {
      await adapter.write(ORDER_FILE, await adapter.read(LEGACY_ORDER_FILE));
      return;
    }

    const folders = this.app.vault
      .getRoot()
      .children.filter((child) => child instanceof obsidian.TFolder)
      .map((folder) => folder.name)
      .sort((a, b) => a.localeCompare(b));

    await adapter.write(ORDER_FILE, TEMPLATE + folders.join("\n") + "\n");
  }

  async openOrderFile() {
    await this.ensureOrderFile();
    await this.app.workspace.openLinkText(ORDER_FILE, "", false);
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

    this.rules = parseOrderFile(text);
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
    if (!Array.isArray(items) || this.rules.length === 0) return items;

    const folderSegments = splitPath(folder?.path ?? ROOT);
    const direction = this.rules.find(
      (rule) => rule.direction && matchSegments(rule.pattern, folderSegments)
    )?.direction;

    // 各要素に、当てはまる最初の行の番号を付ける。当てはまらなければ rest に回す
    const listed = [];
    const rest = [];
    for (const item of items) {
      const path = pathOf(item);
      const segments = path == null ? null : splitPath(path);
      const rank =
        segments == null
          ? -1
          : this.rules.findIndex((rule) => matchSegments(rule.pattern, segments));
      if (rank === -1) rest.push(item);
      else listed.push({ item, rank });
    }
    if (listed.length === 0 && !direction) return items;

    // 同じ行に当てはまったもの同士 ("2024-*" など) は元の順番のまま並ぶ
    listed.sort((a, b) => a.rank - b.rank);
    if (direction) sortByName(rest, direction);
    return listed.map(({ item }) => item).concat(rest);
  }

  requestSort() {
    const view = this.app.workspace.getLeavesOfType("file-explorer")[0]?.view;
    view?.requestSort?.();
  }
};

// getSortedFolderItems が返す要素は Obsidian のバージョンによって
// TAbstractFile そのものだったり、それを包んだオブジェクトだったりする
function pathOf(item) {
  return fileOf(item)?.path ?? null;
}

function fileOf(item) {
  if (item instanceof obsidian.TAbstractFile) return item;
  return item?.file ?? item?.folder ?? null;
}

// Obsidian の通常の並びと同じく、フォルダを先、ファイルを後にしたうえで名前順に並べる
function sortByName(items, direction) {
  const sign = direction === "desc" ? -1 : 1;
  items.sort((a, b) => {
    const fa = fileOf(a);
    const fb = fileOf(b);
    const folderA = fa instanceof obsidian.TFolder ? 0 : 1;
    const folderB = fb instanceof obsidian.TFolder ? 0 : 1;
    if (folderA !== folderB) return folderA - folderB;
    return sign * nameCollator.compare(fa?.name ?? "", fb?.name ?? "");
  });
}

function splitPath(path) {
  return path === ROOT ? [] : path.split("/");
}

// "*" を含む名前は正規表現に、"**" は GLOBSTAR に変換する
const GLOBSTAR = Symbol("globstar");

function compileSegment(segment) {
  if (segment === "**") return GLOBSTAR;
  if (!segment.includes("*")) return segment;
  const source = segment
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${source}$`);
}

function matchSegments(pattern, segments, p = 0, s = 0) {
  if (p === pattern.length) return s === segments.length;

  const segment = pattern[p];
  if (segment === GLOBSTAR) {
    // 0 階層から残り全部までを順に試す
    for (let skip = s; skip <= segments.length; skip++) {
      if (matchSegments(pattern, segments, p + 1, skip)) return true;
    }
    return false;
  }

  if (s === segments.length) return false;
  const matched =
    segment instanceof RegExp
      ? segment.test(segments[s])
      : segment === segments[s];
  return matched && matchSegments(pattern, segments, p + 1, s + 1);
}

// タブとスペースが混ざっていても深さを比べられるように、タブを TAB_WIDTH 桁として数える
function indentWidth(line) {
  let width = 0;
  for (const char of line) {
    if (char === "\t") width += TAB_WIDTH - (width % TAB_WIDTH);
    else if (char === " ") width += 1;
    else break;
  }
  return width;
}

function parseOrderFile(text) {
  const rules = []; // { pattern, direction }
  const stack = []; // { indent, path }

  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;

    const indent = indentWidth(raw);
    let name = raw.trim().replace(/^[-*]\s+/, "");
    const direction = name.match(DIRECTION_PATTERN)?.[1]?.toLowerCase();
    name = name.replace(DIRECTION_PATTERN, "").replace(/\/+$/, "");
    if (!name) continue;

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    const base = stack.length ? stack[stack.length - 1].path : ROOT;
    const path = base === ROOT ? name : `${base}/${name}`;

    // "Projects/Work" のようにパスを直接書いた行も、パス全体で照らし合わせるので正しい親に効く
    rules.push({ pattern: path.split("/").map(compileSegment), direction });

    stack.push({ indent, path });
  }

  return rules;
}
