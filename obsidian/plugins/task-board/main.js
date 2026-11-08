"use strict";

const {
  Plugin,
  BasesView,
  Modal,
  SuggestModal,
  Platform,
  Menu,
  Notice,
  Keymap,
  TFile,
  setIcon,
  parseLinktext,
  parsePropertyId,
  moment
} = require("obsidian");

// タスクのノートを置くフォルダ
const TASK_FOLDER = "tasks";

// カンバンの列。この順番で左から並べる
const STATUSES = ["BLOCKED", "TODO", "WIP", "DONE", "ARCHIVE"];

// この status のカードは「終わったカード」として扱い、他のカードをブロックしない
const FINISHED_STATUSES = new Set(["DONE", "ARCHIVE"]);

// この status のカードは KANBAN に表示しない（記録として残すだけの片付け済みのカード）
const HIDDEN_STATUS = "ARCHIVE";

// ファイル名の先頭に付ける日付。カードには表示しない。
// 以前は時刻も付けていた（261109-0340_）ので、その形のファイル名からも取り除けるようにしている。
const PREFIX_FORMAT = "YYMMDD";
const PREFIX_PATTERN = /^\d{6}(-\d{4})?_/;

// 依存関係を書くプロパティと、その逆向きのプロパティ
const LINK_KEYS = ["blocked_by", "blocking"];
const OPPOSITE_KEY = { blocked_by: "blocking", blocking: "blocked_by" };

const KANBAN_VIEW_TYPE = "task-kanban";
const DEPENDENCY_VIEW_TYPE = "task-dependencies";
const TABLE_VIEW_TYPE = "task-table";
const TASK_VIEW_TYPES = new Set([KANBAN_VIEW_TYPE, DEPENDENCY_VIEW_TYPE, TABLE_VIEW_TYPE]);

// カードの右クリックメニューの区切り。task-board の項目を MENU_SECTION にまとめて一番上に出し、
// その下は Obsidian のファイル一覧のメニューと同じ並び（Obsidian 1.15 の中身から写したもの）にする
const MENU_SECTION = "task-board";
const FILE_MENU_SECTIONS = ["title", "open", "action-primary", "action", "info", "info.copy", "view", "system", "", "danger"];

// DEPENDENCIES の図のカードの幅と間隔（px）。高さが測れなかったときは GRAPH_CARD_MIN_HEIGHT として扱う
const GRAPH_CARD_WIDTH = 240;
const GRAPH_CARD_MIN_HEIGHT = 64;
const GRAPH_COLUMN_GAP = 72;
const GRAPH_ROW_GAP = 16;

// TABLE の列の幅（px）。幅を手で変えていない列はこの幅で表示する
const DEFAULT_COLUMN_WIDTHS = {
  "file.name": 280,
  "note.blocked_by": 260,
  "note.blocking": 260,
  "formula.ready": 80,
  "note.status": 120,
  "note.date": 150
};
const DEFAULT_COLUMN_WIDTH = 160;
const MIN_COLUMN_WIDTH = 48;

// TABLE の cmd + z で戻せる変更の数
const MAX_UNDO = 100;

// 絵文字の候補を出すコマンド。zsh の emoji 関数（dotfiles/zsh/rc/claude.zsh）を使う。
// Obsidian から起動したコマンドにはターミナルの設定が入っていないので、
// .zprofile（PATH）と .zshrc（emoji 関数）を読み込む -l -i 付きの zsh で実行する
const EMOJI_SHELL = "/bin/zsh";
const EMOJI_SHELL_ARGS = ["-l", "-i", "-c", 'emoji "$1"', "zsh"];
const EMOJI_TIMEOUT = 60 * 1000;

// 前後のカードの order の差がこれより小さくなったら、列の order を 1, 2, 3... に振り直す
const MIN_ORDER_GAP = 1e-6;


function isTaskFile(file) {
  return (
    file instanceof TFile &&
    file.extension === "md" &&
    file.path.startsWith(TASK_FOLDER + "/")
  );
}

function taskTitle(file) {
  return file.basename.replace(PREFIX_PATTERN, "");
}

function toList(value) {
  if (Array.isArray(value)) return value.slice();
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function linkpathOf(entry) {
  if (typeof entry !== "string") return null;
  const match = entry.trim().match(/^\[\[([^\]]+)\]\]$/);
  const inner = match ? match[1] : entry;
  const linkpath = parseLinktext(inner.split("|")[0]).path.trim();
  return linkpath || null;
}

function resolveLink(app, entry, sourcePath) {
  const linkpath = linkpathOf(entry);
  if (!linkpath) return null;
  return app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
}

// 消えたノートへのリンクは解決できないので、そのときはパスの文字列で比べる
function refersTo(app, entry, targetPath, sourcePath) {
  const linkpath = linkpathOf(entry);
  if (!linkpath) return false;
  const dest = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
  if (dest) return dest.path === targetPath;
  const withoutExt = targetPath.replace(/\.md$/, "");
  const name = linkpath.replace(/\.md$/, "");
  return name === withoutExt || name === withoutExt.split("/").pop();
}

function formatLink(app, file, sourcePath) {
  return `[[${app.metadataCache.fileToLinktext(file, sourcePath, true)}]]`;
}

function normalizeStatus(value) {
  const status = String(value ?? "").trim().toUpperCase();
  return STATUSES.includes(status) ? status : "TODO";
}

function readLinkPaths(app, file, frontmatter, key) {
  const paths = new Set();
  for (const entry of toList(frontmatter?.[key])) {
    const dest = resolveLink(app, entry, file.path);
    if (dest && isTaskFile(dest) && dest.path !== file.path) paths.add(dest.path);
  }
  return paths;
}

function readOrder(value) {
  if (value === null || value === undefined || value === "") return null;
  const order = Number(value);
  return Number.isFinite(order) ? order : null;
}

function readTask(app, file) {
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  return {
    file,
    title: taskTitle(file),
    status: normalizeStatus(frontmatter?.status),
    order: readOrder(frontmatter?.order),
    icon: typeof frontmatter?.icon === "string" ? frontmatter.icon.trim() : "",
    blocked_by: readLinkPaths(app, file, frontmatter, "blocked_by"),
    blocking: readLinkPaths(app, file, frontmatter, "blocking")
  };
}

function buildTaskIndex(app) {
  const index = new Map();
  for (const file of app.vault.getMarkdownFiles()) {
    if (isTaskFile(file)) index.set(file.path, readTask(app, file));
  }
  return index;
}

function isFinished(task) {
  return FINISHED_STATUSES.has(task.status);
}

function unfinishedBlockers(task, index) {
  return [...task.blocked_by].filter((path) => {
    const blocker = index.get(path);
    return blocker && !isFinished(blocker);
  });
}

function displayStatus(task, index) {
  if (isFinished(task)) return task.status;
  return unfinishedBlockers(task, index).length > 0 ? "BLOCKED" : task.status;
}

// order のあるカードを order の小さい順に並べ、order のないカードはその後ろに元の順番のまま並べる
function compareByOrder(a, b) {
  if (a.order === null || b.order === null) return (a.order === null) - (b.order === null);
  return a.order - b.order;
}

// 落とした位置の前後のカードの order から、動かしたカードの order を決める。
// 前のカードに order がないときや、前後の order の差がほとんどないときは、列の全カードに 1, 2, 3... を振り直す。
// 戻り値は「カード → 新しい order」。書き換えが要らないカードは含めない。
function planOrders(others, moved, insertAt) {
  const prev = others[insertAt - 1];
  const next = others[insertAt];
  const changes = new Map();

  const alreadyInPlace =
    moved.order !== null &&
    (!prev || (prev.order !== null && prev.order < moved.order)) &&
    (!next || next.order === null || moved.order < next.order);
  if (alreadyInPlace || (!prev && !next)) return changes;

  if (!prev) {
    changes.set(moved, next.order === null ? 1 : next.order - 1);
    return changes;
  }
  if (prev.order !== null && (!next || next.order === null)) {
    changes.set(moved, prev.order + 1);
    return changes;
  }
  if (prev.order !== null && next.order - prev.order > MIN_ORDER_GAP) {
    changes.set(moved, (prev.order + next.order) / 2);
    return changes;
  }

  const reordered = [...others.slice(0, insertAt), moved, ...others.slice(insertAt)];
  reordered.forEach((task, i) => {
    if (task.order !== i + 1) changes.set(task, i + 1);
  });
  return changes;
}

function sanitizeFileName(title) {
  const name = title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
  return name || "無題";
}

// ---------------------------------------------------------------------------
// blocked_by と blocking の同期
// ---------------------------------------------------------------------------

class LinkSync {
  constructor(app) {
    this.app = app;
    // ノートごとの、前回読んだときのつながり（path → { blocked_by: Set, blocking: Set }）
    this.snapshot = new Map();
  }

  emptyLinks() {
    return { blocked_by: new Set(), blocking: new Set() };
  }

  readLinks(file) {
    const task = readTask(this.app, file);
    return { blocked_by: task.blocked_by, blocking: task.blocking };
  }

  // 片方にしか書かれていないつながりを、もう片方にも書き足す
  async reconcileAll() {
    this.snapshot.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (isTaskFile(file)) this.snapshot.set(file.path, this.readLinks(file));
    }

    const edits = new EditQueue();
    for (const [path, links] of this.snapshot) {
      for (const key of LINK_KEYS) {
        for (const other of links[key]) {
          const otherLinks = this.snapshot.get(other);
          if (!otherLinks?.[OPPOSITE_KEY[key]].has(path)) {
            edits.add(other, OPPOSITE_KEY[key], path);
          }
        }
      }
    }
    await this.applyEdits(edits);

    for (const path of this.snapshot.keys()) {
      const file = this.app.vault.getFileByPath(path);
      if (file) await this.normalizeLinks(file);
    }
  }

  // 増えたつながりは相手に追加し、消えたつながりは相手から削除する
  async onChanged(file) {
    if (!isTaskFile(file)) return;

    const next = this.readLinks(file);
    const prev = this.snapshot.get(file.path) ?? this.emptyLinks();
    this.snapshot.set(file.path, next);

    const edits = new EditQueue();
    for (const key of LINK_KEYS) {
      for (const other of next[key]) {
        if (!prev[key].has(other)) edits.add(other, OPPOSITE_KEY[key], file.path);
      }
      for (const other of prev[key]) {
        if (!next[key].has(other)) edits.remove(other, OPPOSITE_KEY[key], file.path);
      }
    }
    await this.applyEdits(edits);
    await this.normalizeLinks(file);
  }

  // 表示名付きのリンク（[[ファイル名|タイトル]]）などを、ファイル名だけのリンク（[[ファイル名]]）にそろえる。
  // 書き直した後の変更イベントでは書き直すリンクが無いので、書き込みは繰り返されない。
  async normalizeLinks(file) {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const needsRewrite = LINK_KEYS.some((key) =>
      toList(frontmatter?.[key]).some((entry) => this.normalizedEntry(entry, file) !== entry)
    );
    if (!needsRewrite) return;

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const key of LINK_KEYS) {
        if (key in frontmatter) {
          frontmatter[key] = toList(frontmatter[key]).map((entry) => this.normalizedEntry(entry, file));
        }
      }
    });
  }

  normalizedEntry(entry, file) {
    const dest = resolveLink(this.app, entry, file.path);
    return dest && isTaskFile(dest) ? formatLink(this.app, dest, file.path) : entry;
  }

  onDelete(file) {
    return this.detach(file.path);
  }

  // 消えたノートへのつながりを相手から削除する
  async detach(path) {
    const links = this.snapshot.get(path);
    if (!links) return;
    this.snapshot.delete(path);

    const edits = new EditQueue();
    for (const key of LINK_KEYS) {
      for (const other of links[key]) edits.remove(other, OPPOSITE_KEY[key], path);
    }
    await this.applyEdits(edits);
  }

  // 前回の状態のパスを付け替える。相手のノートのリンクは Obsidian の「リンクを自動更新」が書き換える
  onRename(file, oldPath) {
    const links = this.snapshot.get(oldPath);
    if (!links) return;

    // Obsidian のゴミ箱（.trash）への移動は削除ではなく名前の変更として届くので、ここで削除として扱う
    if (!isTaskFile(file)) return this.detach(oldPath);

    this.snapshot.delete(oldPath);
    this.snapshot.set(file.path, links);
    for (const other of this.snapshot.values()) {
      for (const key of LINK_KEYS) {
        if (other[key].delete(oldPath)) other[key].add(file.path);
      }
    }
  }

  // 相手のノートに書き込む前に相手の前回の状態も更新しておく。
  // こうすると、書き込みで起きる変更イベントで差分が出ず、書き込みが繰り返されない。
  async applyEdits(edits) {
    for (const [targetPath, edit] of edits.entries()) {
      const target = this.app.vault.getFileByPath(targetPath);
      if (!target || !isTaskFile(target)) continue;

      const links = this.snapshot.get(targetPath) ?? this.readLinks(target);
      for (const key of LINK_KEYS) {
        for (const path of edit[key].add) links[key].add(path);
        for (const path of edit[key].remove) links[key].delete(path);
      }
      this.snapshot.set(targetPath, links);

      await this.app.fileManager.processFrontMatter(target, (frontmatter) => {
        for (const key of LINK_KEYS) {
          const { add, remove } = edit[key];
          if (add.size === 0 && remove.size === 0) continue;

          const list = toList(frontmatter[key]).filter(
            (entry) => ![...remove].some((path) => refersTo(this.app, entry, path, target.path))
          );
          for (const path of add) {
            const file = this.app.vault.getFileByPath(path);
            const exists = list.some((entry) => refersTo(this.app, entry, path, target.path));
            if (file && !exists) list.push(formatLink(this.app, file, target.path));
          }
          frontmatter[key] = list;
        }
      });
    }
  }
}

class EditQueue {
  constructor() {
    this.edits = new Map();
  }

  get(targetPath) {
    if (!this.edits.has(targetPath)) {
      this.edits.set(targetPath, {
        blocked_by: { add: new Set(), remove: new Set() },
        blocking: { add: new Set(), remove: new Set() }
      });
    }
    return this.edits.get(targetPath);
  }

  add(targetPath, key, path) {
    if (targetPath === path) return;
    const edit = this.get(targetPath)[key];
    edit.remove.delete(path);
    edit.add.add(path);
  }

  remove(targetPath, key, path) {
    if (targetPath === path) return;
    const edit = this.get(targetPath)[key];
    edit.add.delete(path);
    edit.remove.add(path);
  }

  entries() {
    return this.edits.entries();
  }
}

// ---------------------------------------------------------------------------
// カード
// ---------------------------------------------------------------------------

class TaskTitleModal extends Modal {
  constructor(app, heading, onSubmit) {
    super(app);
    this.heading = heading;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.titleEl.setText(this.heading);
    const input = this.contentEl.createEl("input", {
      type: "text",
      cls: "task-board-title-input",
      attr: { placeholder: "タイトル" }
    });
    // 日本語入力の変換を確定する Enter では作成しない
    input.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" || evt.isComposing) return;
      evt.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      this.close();
      this.onSubmit(title);
    });
    window.setTimeout(() => input.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// emoji コマンドの出力（「🛒 shopping cart」の行が並ぶ）から、絵文字で始まる行だけを取り出す
function parseEmojiCandidates(output) {
  const candidates = [];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\S+)\s+(.+)$/);
    if (match && /\p{Extended_Pictographic}/u.test(match[1])) {
      candidates.push({ emoji: match[1], name: match[2] });
    }
  }
  return candidates;
}

function runEmojiCommand(keyword) {
  const { execFile } = require("child_process");
  return new Promise((resolve, reject) => {
    execFile(EMOJI_SHELL, [...EMOJI_SHELL_ARGS, keyword], { timeout: EMOJI_TIMEOUT }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// 絵文字を選ぶ画面。絵文字を直接入力して決めるか、「候補を探す」を選んだときだけ Claude に候補を出してもらう。
// 一覧の項目は kind で分ける: emoji（決める絵文字）/ search（候補を探す）/ remove（絵文字を外す）/ message（選べない案内）
class EmojiSuggestModal extends SuggestModal {
  constructor(app, { fileName, hasIcon, candidates, search, onChoose }) {
    super(app);
    // どのノートの絵文字を選んでいるかを、入力欄の上に小さく出す
    this.modalEl.prepend(createDiv({ cls: "task-board-emoji-target", text: fileName }));
    this.hasIcon = hasIcon;
    this.candidates = candidates ?? [];
    this.search = search;
    this.onChoose = onChoose;
    this.message = null;
    this.searching = false;
    this.setPlaceholder("絵文字を入力する");
  }

  getSuggestions(query) {
    const q = query.trim();
    const items = [];
    if (/\p{Extended_Pictographic}/u.test(q)) items.push({ kind: "emoji", emoji: q, name: "入力した絵文字を使う" });
    for (const c of this.candidates) {
      if (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.emoji.includes(q)) {
        items.push({ kind: "emoji", ...c });
      }
    }
    if (q) return items;

    if (this.searching) items.push({ kind: "message", name: "候補を探しています…", loading: true });
    else if (this.message) items.push({ kind: "message", name: this.message });
    else if (this.candidates.length === 0 && this.search) items.push({ kind: "search", name: "候補を探す" });
    if (this.hasIcon) items.push({ kind: "remove", name: "絵文字を外す" });
    return items;
  }

  renderSuggestion(item, el) {
    el.addClass("task-board-emoji-suggestion");
    el.toggleClass("is-message", item.kind === "message");
    const markEl = el.createSpan({ cls: "task-board-emoji-suggestion-emoji" });
    if (item.kind === "emoji") markEl.setText(item.emoji);
    else if (item.kind === "search") setIcon(markEl, "sparkles");
    else if (item.kind === "remove") setIcon(markEl, "x");
    else if (item.loading) markEl.createSpan({ cls: "task-board-spinner" });
    el.createSpan({ cls: "task-board-emoji-suggestion-name", text: item.name });
  }

  // 「候補を探す」と案内の行では画面を閉じない。それ以外は通常どおり閉じて onChooseSuggestion に進む
  selectSuggestion(item, evt) {
    if (item.kind === "message") return;
    if (item.kind === "search") {
      this.runSearch();
      return;
    }
    super.selectSuggestion(item, evt);
  }

  async runSearch() {
    this.searching = true;
    this.refresh();
    try {
      this.candidates = await this.search();
      if (this.candidates.length === 0) this.message = "候補が見つかりませんでした。絵文字を直接入力してください";
    } catch (error) {
      this.message = `候補を出せませんでした（${error.message}）`;
    }
    this.searching = false;
    this.refresh();
  }

  refresh() {
    this.inputEl.dispatchEvent(new Event("input"));
  }

  onChooseSuggestion(item) {
    this.onChoose(item.kind === "remove" ? "" : item.emoji);
  }
}

function renderCardTitle(containerEl, task) {
  const titleEl = containerEl.createDiv({ cls: "task-board-card-title" });
  if (task.icon) titleEl.createSpan({ cls: "task-board-card-icon", text: task.icon });
  titleEl.createSpan({ cls: "task-board-card-text", text: task.title });
}

function renderRelations(plugin, containerEl, task, index) {
  const relations = [
    ...[...task.blocked_by].map((path) => ({ path, kind: "blocked_by" })),
    ...[...task.blocking].map((path) => ({ path, kind: "blocking" }))
  ];
  if (relations.length === 0) return;

  const listEl = containerEl.createDiv({ cls: "task-board-relations" });
  for (const { path, kind } of relations) {
    const other = index.get(path);
    if (!other) continue;

    const rowEl = listEl.createDiv({ cls: "task-board-relation" });
    rowEl.toggleClass("is-finished", isFinished(other));
    rowEl.setAttr("aria-label", kind === "blocked_by" ? "先にやるカード" : "このカードを待っているカード");
    const markEl = rowEl.createSpan({ cls: "task-board-relation-mark" });
    setIcon(markEl, kind === "blocked_by" ? (isFinished(other) ? "check" : "lock") : "arrow-right");
    if (other.icon) rowEl.createSpan({ text: other.icon });
    rowEl.createSpan({ cls: "task-board-relation-text", text: other.title });

    rowEl.addEventListener("click", (evt) => {
      evt.stopPropagation();
      plugin.openTask(other.file, evt);
    });
  }
}

function attachCardActions(plugin, cardEl, file) {
  cardEl.addEventListener("click", (evt) => plugin.openTask(file, evt));
  cardEl.addEventListener("contextmenu", (evt) => showTaskMenu(plugin, file, evt));
}

// 「ステータスを変更」の下に、今の status に印を付けた status の一覧を開く。
// setSubmenu は公開 API ではないので、無いときは一覧をメニューにそのまま並べる
function addStatusItems(menu, currentStatus, writeStatus) {
  const addStatus = (target, status) =>
    target.addItem((item) =>
      item
        .setTitle(status)
        .setSection(MENU_SECTION)
        .setChecked(status === currentStatus)
        .onClick(() => {
          if (status !== currentStatus) writeStatus(status);
        })
    );

  menu.addItem((item) => {
    item.setTitle("ステータスを変更").setIcon("circle-dot").setSection(MENU_SECTION);
    const submenu = item.setSubmenu?.();
    if (submenu) {
      for (const status of STATUSES) addStatus(submenu, status);
    } else {
      item.setIsLabel?.(true);
      for (const status of STATUSES) addStatus(menu, status);
    }
  });
}

// 他のプラグインが足す項目（絵文字を選ぶなど）と、ノートの削除を並べた右クリックメニューを出す。
// 削除は Obsidian の「削除したファイル」の設定（ゴミ箱に移すなど）に従う
// setStatus を渡すと status の書き換えをそちらに任せる（TABLE では cmd + z で戻せるようにするため）
function showTaskMenu(plugin, file, evt, setStatus) {
  evt.preventDefault();
  const menu = new Menu();
  // task-board の項目を一番上に出すため、ファイル一覧のメニューと同じ並びの先頭に task-board の区切りを足す。
  // addSections は公開 API ではないので、無いときは Obsidian の決めた順番のままにする
  menu.addSections?.([MENU_SECTION, ...FILE_MENU_SECTIONS]);
  plugin.app.workspace.trigger("file-menu", menu, file, "task-board");
  if (isTaskFile(file)) {
    const writeStatus =
      setStatus ??
      ((status) =>
        plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.status = status;
        }));
    addStatusItems(menu, readTask(plugin.app, file).status, writeStatus);
  }
  menu.addItem((item) =>
    item
      .setTitle("削除")
      .setIcon("trash-2")
      .setSection(MENU_SECTION)
      .setWarning(true)
      .onClick(() => plugin.app.fileManager.trashFile(file))
  );
  menu.showAtMouseEvent(evt);
}

// ---------------------------------------------------------------------------
// KANBAN
// ---------------------------------------------------------------------------

class TaskKanbanView extends BasesView {
  constructor(controller, containerEl, plugin) {
    super(controller);
    this.type = KANBAN_VIEW_TYPE;
    this.plugin = plugin;
    this.rootEl = containerEl.createDiv({ cls: "task-board-kanban" });
    this.dropIndicatorEl = createDiv({ cls: "task-board-drop-indicator" });
  }

  onDataUpdated() {
    this.render();
  }

  // Bases の絞り込みの結果を、表示する status ごとの列に分けて order の順に並べる
  render() {
    const index = buildTaskIndex(this.app);
    const columns = new Map(STATUSES.map((status) => [status, []]));
    for (const entry of this.data.data) {
      const task = index.get(entry.file.path);
      if (task) columns.get(displayStatus(task, index)).push(task);
    }
    for (const tasks of columns.values()) tasks.sort(compareByOrder);
    this.columns = columns;

    this.rootEl.empty();
    for (const status of STATUSES) {
      this.renderColumn(status, columns.get(status), index);
    }
  }

  renderColumn(status, tasks, index) {
    const columnEl = this.rootEl.createDiv({ cls: "task-board-column" });
    columnEl.dataset.status = status;

    const headerEl = columnEl.createDiv({ cls: "task-board-column-header" });
    const pillEl = headerEl.createSpan({ cls: "task-board-pill" });
    pillEl.dataset.status = status;
    pillEl.createSpan({ cls: "task-board-pill-dot" });
    pillEl.createSpan({ text: status });
    headerEl.createSpan({ cls: "task-board-column-count", text: String(tasks.length) });

    // ARCHIVE は片付け済みのカードの置き場所なので、カードは表示せず、落とす場所としてだけ使う
    if (status === HIDDEN_STATUS) {
      columnEl.addClass("is-hidden-column");
      columnEl.createDiv({ cls: "task-board-hidden-hint", text: "Drop here" });
      this.attachDropTarget(columnEl, null, status, index);
      return;
    }

    if (status === "DONE" && tasks.length > 0) {
      const archiveEl = headerEl.createSpan({ cls: "task-board-header-button", attr: { "aria-label": "全部アーカイブ" } });
      setIcon(archiveEl, "archive");
      archiveEl.addEventListener("click", () => this.archiveAll(tasks));
    }

    for (const task of tasks) this.renderCard(columnEl, task, index);

    const addEl = columnEl.createDiv({ cls: "task-board-add" });
    setIcon(addEl.createSpan(), "plus");
    addEl.createSpan({ text: "新規ページ" });
    addEl.addEventListener("click", () => this.plugin.promptNewTask(status));

    this.attachDropTarget(columnEl, addEl, status, index);
  }

  async archiveAll(tasks) {
    for (const task of tasks) {
      await this.app.fileManager.processFrontMatter(task.file, (frontmatter) => {
        frontmatter.status = HIDDEN_STATUS;
      });
    }
    new Notice(`${tasks.length} 枚のカードをアーカイブしました`);
  }

  renderCard(columnEl, task, index) {
    const cardEl = columnEl.createDiv({ cls: "task-board-card" });
    cardEl.dataset.path = task.file.path;
    cardEl.toggleClass("is-waiting", unfinishedBlockers(task, index).length > 0);
    cardEl.draggable = true;

    renderCardTitle(cardEl, task);
    renderRelations(this.plugin, cardEl, task, index);
    attachCardActions(this.plugin, cardEl, task.file);

    cardEl.addEventListener("dragstart", (evt) => {
      evt.dataTransfer.setData("text/plain", task.file.path);
      evt.dataTransfer.effectAllowed = "move";
      this.draggingPath = task.file.path;
      cardEl.addClass("is-dragging");
    });
    cardEl.addEventListener("dragend", () => {
      this.draggingPath = null;
      cardEl.removeClass("is-dragging");
      this.dropIndicatorEl.detach();
    });
  }

  // マウスの位置から、カードを何番目に入れるかを決めて線を表示する
  attachDropTarget(columnEl, addEl, status, index) {
    columnEl.addEventListener("dragover", (evt) => {
      if (!this.draggingPath) return;
      evt.preventDefault();
      columnEl.addClass("is-drop-target");
      if (status === HIDDEN_STATUS) return;

      const cardEls = [...columnEl.querySelectorAll(".task-board-card")].filter(
        (el) => el.dataset.path !== this.draggingPath
      );
      const insertAt = cardEls.findIndex((el) => {
        const rect = el.getBoundingClientRect();
        return evt.clientY < rect.top + rect.height / 2;
      });
      this.dropIndex = insertAt === -1 ? cardEls.length : insertAt;
      columnEl.insertBefore(this.dropIndicatorEl, cardEls[this.dropIndex] ?? addEl);
    });
    columnEl.addEventListener("dragleave", (evt) => {
      if (columnEl.contains(evt.relatedTarget)) return;
      columnEl.removeClass("is-drop-target");
      this.dropIndicatorEl.detach();
    });
    columnEl.addEventListener("drop", async (evt) => {
      evt.preventDefault();
      columnEl.removeClass("is-drop-target");
      this.dropIndicatorEl.detach();
      const task = index.get(this.draggingPath);
      this.draggingPath = null;
      if (task) await this.moveTask(task, status, this.dropIndex, index);
    });
  }

  // 別の列に落としたときは status を書き換え、落とした位置に合わせて order を書き換える
  async moveTask(task, status, insertAt, index) {
    const others = this.columns.get(status).filter((other) => other !== task);
    const orders = status === HIDDEN_STATUS ? new Map() : planOrders(others, task, insertAt);
    const statusChanged = displayStatus(task, index) !== status;

    if (statusChanged || orders.has(task)) {
      await this.app.fileManager.processFrontMatter(task.file, (frontmatter) => {
        if (statusChanged) frontmatter.status = status;
        if (orders.has(task)) frontmatter.order = orders.get(task);
      });
    }
    for (const [other, order] of orders) {
      if (other === task) continue;
      await this.app.fileManager.processFrontMatter(other.file, (frontmatter) => {
        frontmatter.order = order;
      });
    }

    if (statusChanged && status !== "BLOCKED" && !FINISHED_STATUSES.has(status) && unfinishedBlockers(task, index).length > 0) {
      new Notice(`「${task.title}」には終わっていない blocked_by があるので、BLOCKED 列に残ります`);
    }
  }
}

// ---------------------------------------------------------------------------
// DEPENDENCIES
// ---------------------------------------------------------------------------

// つながっているカードのまとまり（連結成分）に分ける
function splitIntoGroups(nodes, edges) {
  const neighbors = new Map(nodes.map((node) => [node, []]));
  for (const [from, to] of edges) {
    neighbors.get(from).push(to);
    neighbors.get(to).push(from);
  }

  const groups = [];
  const seen = new Set();
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const group = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const node = stack.pop();
      group.push(node);
      for (const next of neighbors.get(node)) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

// 先にやるカードを左、後でやるカードを右に置くように、カードを段に分ける。
// 段は「そのカードの前に続いているカードの数」の最大値。循環しているつながりは段の計算に使わない。
function assignLayers(nodes, edges, order) {
  const successors = new Map(nodes.map((node) => [node, []]));
  const predecessors = new Map(nodes.map((node) => [node, []]));
  for (const [from, to] of edges) {
    successors.get(from).push(to);
    predecessors.get(to).push(from);
  }

  const byOrder = (a, b) => order.get(a) - order.get(b);
  const roots = nodes.filter((node) => predecessors.get(node).length === 0).sort(byOrder);
  const rest = nodes.filter((node) => predecessors.get(node).length > 0).sort(byOrder);

  const state = new Map();
  const acyclic = [];
  const postorder = [];
  const visit = (node) => {
    state.set(node, "visiting");
    for (const next of successors.get(node)) {
      if (state.get(next) === "visiting") continue;
      acyclic.push([node, next]);
      if (!state.has(next)) visit(next);
    }
    state.set(node, "done");
    postorder.push(node);
  };
  for (const node of [...roots, ...rest]) {
    if (!state.has(node)) visit(node);
  }

  const layer = new Map(nodes.map((node) => [node, 0]));
  const acyclicSuccessors = new Map(nodes.map((node) => [node, []]));
  for (const [from, to] of acyclic) acyclicSuccessors.get(from).push(to);
  for (const node of postorder.reverse()) {
    for (const next of acyclicSuccessors.get(node)) {
      layer.set(next, Math.max(layer.get(next), layer.get(node) + 1));
    }
  }

  const layerCount = Math.max(...layer.values()) + 1;
  const layers = Array.from({ length: layerCount }, () => []);
  for (const node of [...nodes].sort(byOrder)) layers[layer.get(node)].push(node);

  // 前の段でつながっているカードの位置の平均で並べ、矢印の交差を減らす
  const position = new Map();
  layers[0].forEach((node, i) => position.set(node, i));
  for (let i = 1; i < layers.length; i++) {
    const weight = (node) => {
      const placed = predecessors.get(node).filter((p) => position.has(p));
      if (placed.length === 0) return Infinity;
      return placed.reduce((sum, p) => sum + position.get(p), 0) / placed.length;
    };
    layers[i].sort((a, b) => weight(a) - weight(b) || byOrder(a, b));
    layers[i].forEach((node, j) => position.set(node, j));
  }
  return layers;
}

function createSvgElement(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

class TaskDependencyView extends BasesView {
  constructor(controller, containerEl, plugin) {
    super(controller);
    this.type = DEPENDENCY_VIEW_TYPE;
    this.plugin = plugin;
    this.rootEl = containerEl.createDiv({ cls: "task-board-dependencies" });
  }

  onDataUpdated() {
    this.render();
  }

  // Bases の絞り込みに残ったカードのうち、つながりのあるカードだけをまとまりごとに描く
  render() {
    const index = buildTaskIndex(this.app);
    const order = new Map();
    this.data.data.forEach((entry, i) => {
      if (index.has(entry.file.path)) order.set(entry.file.path, i);
    });

    const edgeKeys = new Set();
    const edges = [];
    const addEdge = (from, to) => {
      const key = `${from}\n${to}`;
      if (!order.has(from) || !order.has(to) || edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push([from, to]);
    };
    for (const path of order.keys()) {
      const task = index.get(path);
      for (const blocker of task.blocked_by) addEdge(blocker, path);
      for (const waiting of task.blocking) addEdge(path, waiting);
    }

    const nodes = [...new Set(edges.flat())];
    const hideFinished = this.config.get("hideFinished") ?? true;
    const groups = splitIntoGroups(nodes, edges)
      .filter((group) => !hideFinished || group.some((path) => !isFinished(index.get(path))))
      .sort((a, b) => Math.min(...a.map((p) => order.get(p))) - Math.min(...b.map((p) => order.get(p))));

    this.rootEl.empty();
    if (groups.length === 0) {
      this.rootEl.createDiv({ cls: "task-board-empty", text: "依存関係のあるカードはありません" });
      return;
    }
    for (const group of groups) {
      const groupSet = new Set(group);
      const groupEdges = edges.filter(([from]) => groupSet.has(from));
      this.renderGroup(group, groupEdges, order, index);
    }
  }

  // タイトルの長さでカードの高さが変わるので、先にカードを置いて高さを測ってから位置を決める
  renderGroup(nodes, edges, order, index) {
    const layers = assignLayers(nodes, edges, order);
    const groupEl = this.rootEl.createDiv({ cls: "task-board-graph" });

    const cardEls = new Map();
    const heights = new Map();
    for (const path of nodes) {
      const cardEl = this.renderNode(groupEl, index.get(path), index);
      cardEls.set(path, cardEl);
      heights.set(path, cardEl.offsetHeight || GRAPH_CARD_MIN_HEIGHT);
    }

    const layerHeight = (layer) =>
      layer.reduce((sum, path) => sum + heights.get(path), 0) + (layer.length - 1) * GRAPH_ROW_GAP;
    const width = layers.length * (GRAPH_CARD_WIDTH + GRAPH_COLUMN_GAP) - GRAPH_COLUMN_GAP;
    const height = Math.max(...layers.map(layerHeight));
    groupEl.style.width = `${width}px`;
    groupEl.style.height = `${height}px`;

    // 段ごとに縦方向の中央にそろえる
    const positions = new Map();
    layers.forEach((layer, column) => {
      let y = (height - layerHeight(layer)) / 2;
      for (const path of layer) {
        const position = { x: column * (GRAPH_CARD_WIDTH + GRAPH_COLUMN_GAP), y, height: heights.get(path) };
        positions.set(path, position);
        cardEls.get(path).style.left = `${position.x}px`;
        cardEls.get(path).style.top = `${position.y}px`;
        y += position.height + GRAPH_ROW_GAP;
      }
    });

    this.renderArrows(groupEl, edges, positions, index, width, height);
  }

  renderArrows(groupEl, edges, positions, index, width, height) {
    const svg = createSvgElement("svg", { class: "task-board-arrows", width, height });
    const defs = createSvgElement("defs", {});
    for (const id of ["task-board-arrowhead", "task-board-arrowhead-finished"]) {
      const marker = createSvgElement("marker", {
        id,
        class: id,
        viewBox: "0 0 10 10",
        refX: 9,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: "auto"
      });
      marker.appendChild(createSvgElement("path", { d: "M 0 0 L 10 5 L 0 10 z" }));
      defs.appendChild(marker);
    }
    svg.appendChild(defs);

    for (const [from, to] of edges) {
      const start = positions.get(from);
      const end = positions.get(to);
      const x1 = start.x + GRAPH_CARD_WIDTH;
      const y1 = start.y + start.height / 2;
      const x2 = end.x;
      const y2 = end.y + end.height / 2;
      const bend = Math.max(GRAPH_COLUMN_GAP / 2, Math.abs(x2 - x1) / 2);
      const finished = isFinished(index.get(from));
      const path = createSvgElement("path", {
        d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        class: finished ? "task-board-arrow is-finished" : "task-board-arrow",
        "marker-end": finished ? "url(#task-board-arrowhead-finished)" : "url(#task-board-arrowhead)"
      });
      svg.appendChild(path);
    }
    groupEl.prepend(svg);
  }

  renderNode(groupEl, task, index) {
    const cardEl = groupEl.createDiv({ cls: "task-board-card task-board-graph-card" });
    cardEl.style.width = `${GRAPH_CARD_WIDTH}px`;
    cardEl.toggleClass("is-waiting", unfinishedBlockers(task, index).length > 0);
    cardEl.toggleClass("is-finished", isFinished(task));

    const status = displayStatus(task, index);
    const pillEl = cardEl.createSpan({ cls: "task-board-pill is-small" });
    pillEl.dataset.status = status;
    pillEl.createSpan({ cls: "task-board-pill-dot" });
    pillEl.createSpan({ text: status });

    renderCardTitle(cardEl, task);
    attachCardActions(this.plugin, cardEl, task.file);
    return cardEl;
  }
}

// ---------------------------------------------------------------------------
// TABLE
// ---------------------------------------------------------------------------

// Obsidian 本体の表は行の高さが決まった高さになるので、中身に合わせて行が伸びる表を自前で描く
class TaskTableView extends BasesView {
  constructor(controller, containerEl, plugin) {
    super(controller);
    this.type = TABLE_VIEW_TYPE;
    this.plugin = plugin;
    // 表のどこかをクリックしたら表にフォーカスが移り、cmd + z を受け取れるようにする
    this.rootEl = containerEl.createDiv({ cls: "task-board-table-wrap", attr: { tabIndex: 0 } });
    this.renderPending = false;
    this.undoStack = [];
    this.redoStack = [];

    // 入力中に描き直すと入力欄が消えるので、入力欄から出たときに後回しにした描き直しをする
    this.rootEl.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (this.renderPending && !this.isEditing()) this.render();
      }, 0);
    });

    // 本体の表と同じく、cmd + z で元に戻し、cmd + shift + z でやり直す
    this.rootEl.addEventListener("keydown", (evt) => {
      if (evt.isComposing || evt.defaultPrevented || evt.key.toLowerCase() !== "z" || !Keymap.isModifier(evt, "Mod")) return;
      if (this.isTypingText()) return;
      evt.preventDefault();
      if (evt.shiftKey) this.redo();
      else this.undo();
    });
  }

  onDataUpdated() {
    if (this.isEditing()) {
      this.renderPending = true;
      return;
    }
    this.render();
  }

  isEditing() {
    const active = this.rootEl.doc.activeElement;
    return active !== this.rootEl && this.rootEl.contains(active);
  }

  // 入力欄に打ちかけの文字があるときは、cmd + z をその文字の取り消しに使わせる
  isTypingText() {
    const active = this.rootEl.doc.activeElement;
    if (active?.isContentEditable) return active.textContent.length > 0;
    return active instanceof HTMLInputElement && active.type === "text" && active.value.length > 0;
  }

  // 書き込む前の値を覚えておき、cmd + z で戻せるようにする。
  // 入力欄から続けて書き込むときはメタデータの読み込みが追いつかないので、入力欄が覚えている前の値を before に渡す。
  async writeProperty(file, key, value, before = this.app.metadataCache.getFileCache(file)?.frontmatter?.[key] ?? null) {
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    this.undoStack.push({ file, key, before: structuredClone(before), after: structuredClone(value) });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[key] = value;
    });
  }

  undo() {
    return this.replayChange(this.undoStack, this.redoStack, (change) => change.before);
  }

  redo() {
    return this.replayChange(this.redoStack, this.undoStack, (change) => change.after);
  }

  // 入力欄の中にいると描き直しが後回しになるので、先に入力欄から出てから書き込む
  async replayChange(fromStack, toStack, pickValue) {
    const change = fromStack.pop();
    if (!change) return;
    toStack.push(change);
    this.rootEl.focus();
    await this.app.fileManager.processFrontMatter(change.file, (frontmatter) => {
      frontmatter[change.key] = structuredClone(pickValue(change));
    });
  }

  // 列は Bases の「プロパティ」で選んだもの、行は Bases の絞り込みと並べ替えの結果
  render() {
    this.renderPending = false;
    const index = buildTaskIndex(this.app);
    const properties = this.config.getOrder();
    const widths = this.columnWidths(properties);

    this.rootEl.empty();
    const tableEl = this.rootEl.createEl("table", { cls: "task-board-table" });
    const setTableWidth = () => {
      tableEl.style.width = `${properties.reduce((sum, property) => sum + widths[property], 0)}px`;
    };
    setTableWidth();

    const colgroupEl = tableEl.createEl("colgroup");
    const headRowEl = tableEl.createEl("thead").createEl("tr");
    for (const property of properties) {
      const colEl = colgroupEl.createEl("col");
      colEl.style.width = `${widths[property]}px`;
      const thEl = headRowEl.createEl("th", { text: this.config.getDisplayName(property) });
      this.attachResizeHandle(thEl, colEl, property, widths, setTableWidth);
    }

    const bodyEl = tableEl.createEl("tbody");
    for (const entry of this.data.data) {
      const rowEl = bodyEl.createEl("tr");
      // 行のどこを右クリックしても、その行のノートのメニューを出す。
      // ただし入力欄の中は、そこに並んだ別のノートへのリンクを消してしまわないように、入力欄のメニューに任せる
      rowEl.addEventListener("contextmenu", (evt) => {
        if (evt.defaultPrevented || evt.target.closest?.(".task-board-table-editor")) return;
        showTaskMenu(this.plugin, entry.file, evt, (status) => this.writeProperty(entry.file, "status", status));
      });
      for (const property of properties) {
        this.renderCell(rowEl.createEl("td"), entry, property, index.get(entry.file.path));
      }
    }
  }

  // 本体の表と同じ columnSize に保存した幅を使い、保存していない列は決まった幅にする
  columnWidths(properties) {
    const saved = this.config.get("columnSize") ?? {};
    const widths = {};
    for (const property of properties) {
      widths[property] = Number.isFinite(saved[property])
        ? saved[property]
        : DEFAULT_COLUMN_WIDTHS[property] ?? DEFAULT_COLUMN_WIDTH;
    }
    return widths;
  }

  // 見出しの右端をドラッグして列の幅を変え、離したときに .base ファイルに保存する
  attachResizeHandle(thEl, colEl, property, widths, setTableWidth) {
    const handleEl = thEl.createDiv({ cls: "task-board-table-resize" });
    handleEl.addEventListener("pointerdown", (evt) => {
      evt.preventDefault();
      handleEl.setPointerCapture(evt.pointerId);
      handleEl.addClass("is-dragging");
      const startX = evt.clientX;
      const startWidth = widths[property];

      const onMove = (moveEvt) => {
        widths[property] = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvt.clientX - startX));
        colEl.style.width = `${widths[property]}px`;
        setTableWidth();
      };
      const onUp = () => {
        handleEl.removeEventListener("pointermove", onMove);
        handleEl.removeClass("is-dragging");
        this.config.set("columnSize", { ...(this.config.get("columnSize") ?? {}), [property]: widths[property] });
      };
      handleEl.addEventListener("pointermove", onMove);
      handleEl.addEventListener("pointerup", onUp, { once: true });
      handleEl.addEventListener("pointercancel", onUp, { once: true });
    });
  }

  renderCell(cellEl, entry, property, task) {
    const { type, name } = parsePropertyId(property);

    if (type === "file" && (name === "name" || name === "basename")) {
      const nameEl = cellEl.createDiv({ cls: "task-board-table-name" });
      if (task) this.renderIconButton(nameEl, task);
      // 右クリックは行のメニュー（status の変更を cmd + z で戻せる）に任せるので、ここではクリックだけ受け取る
      const linkEl = nameEl.createSpan({ cls: "task-board-table-link", text: entry.file.basename });
      linkEl.addEventListener("click", (evt) => this.plugin.openTask(entry.file, evt));
      return;
    }
    if (task && type === "note" && name === "status") {
      this.renderStatusSelect(cellEl, task);
      return;
    }
    if (type === "note" && entry.file.extension === "md" && this.renderPropertyEditor(cellEl, entry.file, name)) {
      return;
    }
    if (task && type === "note" && LINK_KEYS.includes(name)) {
      this.renderLinkChips(cellEl, task, name);
      return;
    }

    const value = entry.getValue(property);
    if (!value) return;
    try {
      value.renderTo(cellEl, this.app.renderContext);
    } catch {
      cellEl.setText(value.toString());
    }
  }

  // ノートのプロパティ欄と同じ入力欄を置く。この部品は公開 API ではない（app.metadataTypeManager）ので、
  // 使えないとき（Obsidian の更新で中身が変わったとき）は false を返し、呼び出し元で表示だけにする。
  renderPropertyEditor(cellEl, file, key) {
    const value = this.app.metadataCache.getFileCache(file)?.frontmatter?.[key] ?? null;
    const widget = this.app.metadataTypeManager?.getTypeInfo?.(key, value)?.inferred;
    if (typeof widget?.render !== "function") return false;

    const editorEl = cellEl.createDiv({ cls: "metadata-property-value task-board-table-editor" });
    editorEl.setAttr("data-property-type", widget.type);
    let savedJson = JSON.stringify(value);
    try {
      widget.render(editorEl, value, {
        app: this.app,
        key,
        sourcePath: file.path,
        hoverSource: "bases",
        blur: () => {},
        // 本体の表と同じく、空の文字と空のリストは空の値（null）として保存する
        onChange: (newValue) => {
          const cleaned = newValue === "" || (Array.isArray(newValue) && newValue.length === 0) ? null : newValue;
          if (JSON.stringify(cleaned) === savedJson) return;
          const before = JSON.parse(savedJson);
          savedJson = JSON.stringify(cleaned);
          this.writeProperty(file, key, cleaned, before);
        }
      });
    } catch {
      editorEl.remove();
      return false;
    }
    return true;
  }

  // ファイル名の前の絵文字。クリックすると絵文字を選ぶ画面を開く。絵文字がない行は、マウスを乗せたときだけ選ぶボタンを出す
  renderIconButton(nameEl, task) {
    const iconEl = nameEl.createSpan({ cls: "task-board-table-icon", attr: { "aria-label": "絵文字を選ぶ" } });
    if (task.icon) {
      iconEl.setText(task.icon);
    } else {
      iconEl.addClass("is-empty");
      setIcon(iconEl, "smile-plus");
    }
    iconEl.addEventListener("click", (evt) => {
      evt.stopPropagation();
      this.plugin.pickEmoji(task.file);
    });
  }

  renderStatusSelect(cellEl, task) {
    cellEl.addClass("is-compact");
    const selectEl = cellEl.createEl("select", { cls: "dropdown task-board-table-status" });
    selectEl.dataset.status = task.status;
    for (const status of STATUSES) selectEl.createEl("option", { value: status, text: status });
    selectEl.value = task.status;
    selectEl.addEventListener("change", () => this.writeProperty(task.file, "status", selectEl.value));
  }

  // つながりのあるノートを、クリックで開けるリンクと小さい × ボタンの組で並べる
  renderLinkChips(cellEl, task, key) {
    const listEl = cellEl.createDiv({ cls: "task-board-table-chips" });
    for (const path of task[key]) {
      const other = this.app.vault.getFileByPath(path);
      if (!other) continue;

      const chipEl = listEl.createDiv({ cls: "task-board-table-chip" });
      const linkEl = chipEl.createSpan({ cls: "task-board-table-link", text: other.basename });
      attachCardActions(this.plugin, linkEl, other);

      const removeEl = chipEl.createSpan({ cls: "task-board-table-chip-remove", attr: { "aria-label": "つながりを外す" } });
      setIcon(removeEl, "x");
      removeEl.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const current = this.app.metadataCache.getFileCache(task.file)?.frontmatter?.[key];
        const remaining = toList(current).filter((entry) => !refersTo(this.app, entry, path, task.file.path));
        this.writeProperty(task.file, key, remaining);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// プラグイン
// ---------------------------------------------------------------------------

module.exports = class TaskBoardPlugin extends Plugin {
  async onload() {
    this.sync = new LinkSync(this.app);
    this.sideLeaf = null;

    this.registerBasesView(KANBAN_VIEW_TYPE, {
      name: "Kanban",
      icon: "lucide-square-kanban",
      factory: (controller, containerEl) => {
        this.takeOverNewButton(controller);
        return new TaskKanbanView(controller, containerEl, this);
      }
    });
    this.registerBasesView(DEPENDENCY_VIEW_TYPE, {
      name: "Dependencies",
      icon: "lucide-git-fork",
      factory: (controller, containerEl) => {
        this.takeOverNewButton(controller);
        return new TaskDependencyView(controller, containerEl, this);
      },
      options: () => [
        { type: "toggle", key: "hideFinished", displayName: "全部終わったつながりを隠す", default: true }
      ]
    });
    this.registerBasesView(TABLE_VIEW_TYPE, {
      name: "Task table",
      icon: "lucide-table",
      factory: (controller, containerEl) => {
        this.takeOverNewButton(controller);
        return new TaskTableView(controller, containerEl, this);
      }
    });

    this.addCommand({
      id: "create-task",
      name: "タスクを作成",
      callback: () => this.promptNewTask("TODO")
    });

    // 絵文字の候補は外部のコマンドで出すので、外部のコマンドを動かせるパソコンの Obsidian でだけ使えるようにする
    if (Platform.isDesktopApp) {
      this.registerEvent(
        this.app.workspace.on("file-menu", (menu, file) => {
          if (!isTaskFile(file)) return;
          menu.addItem((item) =>
            item
              .setTitle("絵文字を選ぶ")
              .setIcon("smile-plus")
              .setSection(MENU_SECTION)
              .onClick(() => this.pickEmoji(file))
          );
        })
      );
      this.addCommand({
        id: "pick-emoji",
        name: "開いているタスクの絵文字を選ぶ",
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (!isTaskFile(file)) return false;
          if (!checking) this.pickEmoji(file);
          return true;
        }
      });
    }

    // 起動時に読み込まれるノートで同期が走らないように、起動が終わってから同期を始める
    this.app.workspace.onLayoutReady(async () => {
      await this.sync.reconcileAll();
      this.registerEvent(this.app.metadataCache.on("changed", (file) => this.sync.onChanged(file)));
      this.registerEvent(this.app.vault.on("delete", (file) => this.sync.onDelete(file)));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.sync.onRename(file, oldPath)));
    });
  }

  // Bases のツールバーの「新規」は、表示に関係なく「無題のファイル」を作る。
  // task-board の表示を出しているときだけ、カンバンの「+ 新規ページ」と同じタイトル入力に置き換える。
  // ボタンは公開 API ではない controller.viewHeaderEl の中から探し、見つからなければ何もしない
  takeOverNewButton(controller) {
    this.controllersWithNewButton ??= new WeakSet();
    if (this.controllersWithNewButton.has(controller)) return;
    const buttonAreaEl = controller.viewHeaderEl?.querySelector?.(".bases-toolbar-new-item-menu");
    if (!buttonAreaEl) return;
    this.controllersWithNewButton.add(controller);

    const handler = (evt) => {
      if (evt.type === "keydown" && evt.key !== "Enter" && evt.key !== " ") return;
      if (!TASK_VIEW_TYPES.has(controller.view?.type)) return;
      evt.preventDefault();
      evt.stopPropagation();
      this.promptNewTask("TODO");
    };
    // ボタン自身のクリック処理より先に受け取るため、capture で登録する
    buttonAreaEl.addEventListener("click", handler, true);
    buttonAreaEl.addEventListener("keydown", handler, true);
    this.register(() => {
      buttonAreaEl.removeEventListener("click", handler, true);
      buttonAreaEl.removeEventListener("keydown", handler, true);
    });
  }

  // タイトルをキーワードにして emoji コマンドで候補を出し、選んだ絵文字を icon に入れる
  // 一度出した候補はタイトルごとに覚えておき、同じタイトルでもう一度開いたときは Claude を呼ばずに出す
  pickEmoji(file) {
    this.emojiCache ??= new Map();
    const title = taskTitle(file);
    new EmojiSuggestModal(this.app, {
      fileName: file.basename,
      hasIcon: Boolean(readTask(this.app, file).icon),
      candidates: this.emojiCache.get(title),
      search: Platform.isDesktopApp
        ? async () => {
            const candidates = parseEmojiCandidates(await runEmojiCommand(title));
            if (candidates.length > 0) this.emojiCache.set(title, candidates);
            return candidates;
          }
        : null,
      onChoose: (emoji) => {
        this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.icon = emoji;
        });
      }
    }).open();
  }

  promptNewTask(status) {
    new TaskTitleModal(this.app, `新しいタスク（${status}）`, (title) => this.createTask(title, status)).open();
  }

  async createTask(title, status) {
    if (!this.app.vault.getFolderByPath(TASK_FOLDER)) {
      await this.app.vault.createFolder(TASK_FOLDER);
    }

    const base = `${moment().format(PREFIX_FORMAT)}_${sanitizeFileName(title)}`;
    let path = `${TASK_FOLDER}/${base}.md`;
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) {
      path = `${TASK_FOLDER}/${base} ${n}.md`;
    }

    const content = ["---", `status: ${status}`, "icon: \"\"", "blocked_by: []", "blocking: []", "---", ""].join("\n");
    return this.app.vault.create(path, content);
  }

  // Notion のサイドピークのように、ボードの右側の同じ場所にノートを開く
  openTask(file, evt) {
    const modifier = Keymap.isModEvent(evt);
    if (modifier) {
      this.app.workspace.getLeaf(modifier).openFile(file);
      return;
    }
    if (!this.isLeafOpen(this.sideLeaf)) {
      this.sideLeaf = this.app.workspace.getLeaf("split", "vertical");
    }
    this.sideLeaf.openFile(file);
  }

  isLeafOpen(leaf) {
    if (!leaf) return false;
    let found = false;
    this.app.workspace.iterateRootLeaves((other) => {
      if (other === leaf) found = true;
    });
    return found;
  }
};
