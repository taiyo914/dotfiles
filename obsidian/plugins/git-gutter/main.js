const obsidian = require("obsidian");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { gutter, GutterMarker, EditorView } = require("@codemirror/view");
const { StateField, StateEffect, RangeSetBuilder, RangeSet } = require("@codemirror/state");

const execFileAsync = promisify(execFile);

const DEBOUNCE_MS = 500;
// 行数がこれを超えるファイルはLCS計算(O(行数^2))が重くなるため差分表示をスキップする
const MAX_DIFF_LINES = 4000;

// --- 行単位のLCS差分 ---
// oldLines/newLines を比較し、各行が equal / remove / add のどれかを表す配列を返す。
// remove/add はどちらも登場順を保ったまま並ぶ（後段のhunk分割で利用する）。
function diffLines(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: "equal", newLine: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove" });
      i++;
    } else {
      ops.push({ type: "add", newLine: j });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "remove" });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", newLine: j });
    j++;
  }
  return ops;
}

// opsをhunk（連続した非equal区間）ごとに分割し、行ステータスに変換する。
// - remove/addが同数までは「変更」(黄)としてペアにする
// - 余ったaddは「追加」(緑)
// - 余ったremoveは、対応するadd行が現在の文書上に存在しないため、
//   hunk直後の行に「削除あり」の印(deleteBefore)を付ける。文書末尾での削除はdeleteAtEndにする。
function buildLineStatuses(ops, newLineCount) {
  const added = new Set();
  const modified = new Set();
  const deleteBefore = new Set();
  let deleteAtEnd = false;

  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "equal") {
      k++;
      continue;
    }

    let removeCount = 0;
    const addLines = [];
    while (k < ops.length && ops[k].type !== "equal") {
      if (ops[k].type === "remove") removeCount++;
      else addLines.push(ops[k].newLine);
      k++;
    }

    const pairedCount = Math.min(removeCount, addLines.length);
    addLines.forEach((newLine, idx) => {
      if (idx < pairedCount) modified.add(newLine);
      else added.add(newLine);
    });

    if (removeCount > addLines.length) {
      const boundary = k < ops.length ? ops[k].newLine : newLineCount;
      if (boundary >= newLineCount) deleteAtEnd = true;
      else deleteBefore.add(boundary);
    }
  }

  return { added, modified, deleteBefore, deleteAtEnd };
}

// --- CodeMirror6 gutter ---
class GitGutterMarker extends GutterMarker {
  constructor(classes) {
    super();
    this.classes = classes;
  }
  eq(other) {
    return this.classes.join(",") === other.classes.join(",");
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-git-gutter-marker " + this.classes.join(" ");
    return el;
  }
}

const setGitGutterMarkers = StateEffect.define();

const gitGutterField = StateField.define({
  create() {
    return RangeSet.empty;
  },
  update(markers, tr) {
    for (const e of tr.effects) {
      if (e.is(setGitGutterMarkers)) return e.value;
    }
    if (tr.docChanged) return markers.map(tr.changes);
    return markers;
  },
});

function buildMarkerRangeSet(doc, gutterData) {
  const { added, modified, deleteBefore, deleteAtEnd } = gutterData;
  const builder = new RangeSetBuilder();
  const totalLines = doc.lines;

  for (let lineNo = 1; lineNo <= totalLines; lineNo++) {
    const zeroIdx = lineNo - 1;
    const classes = [];
    if (modified.has(zeroIdx)) classes.push("cm-git-gutter-modified");
    else if (added.has(zeroIdx)) classes.push("cm-git-gutter-added");
    if (deleteBefore.has(zeroIdx)) classes.push("cm-git-gutter-delete-before");
    if (deleteAtEnd && lineNo === totalLines) classes.push("cm-git-gutter-delete-after");
    if (classes.length === 0) continue;

    const linePos = doc.line(lineNo).from;
    builder.add(linePos, linePos, new GitGutterMarker(classes));
  }
  return builder.finish();
}

const gitGutterExtension = gutter({
  class: "cm-git-gutter",
  markers: (view) => view.state.field(gitGutterField),
});

// --- git連携 ---
async function findGitRoot(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function gitShowHead(gitRoot, relPath) {
  const { stdout } = await execFileAsync("git", ["show", `HEAD:${relPath}`], {
    cwd: gitRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function isGitIgnored(gitRoot, relPath) {
  try {
    await execFileAsync("git", ["check-ignore", "-q", relPath], { cwd: gitRoot });
    return true;
  } catch (err) {
    // exit code 1 = 無視されていない、それ以外(コマンド自体の失敗等)も無視されていない扱いにする
    return false;
  }
}

module.exports = class GitGutterPlugin extends obsidian.Plugin {
  gitRoot = null;
  basePath = null;
  refreshTimer = null;
  requestSeq = 0;

  async onload() {
    // エディタ内をクリックしたとき(≒そのノートを見に来たとき)にも再計算する
    const clickRefreshExtension = EditorView.domEventHandlers({
      click: () => {
        this.scheduleRefresh(0);
        return false;
      },
    });
    this.registerEditorExtension([gitGutterField, gitGutterExtension, clickRefreshExtension]);

    if (!(this.app.vault.adapter instanceof obsidian.FileSystemAdapter)) {
      console.warn("[git-gutter] デスクトップ版のみ対応しています");
      return;
    }

    this.basePath = this.app.vault.adapter.getBasePath();
    this.gitRoot = await findGitRoot(this.basePath);
    if (!this.gitRoot) {
      console.warn("[git-gutter] Vault内にgitリポジトリが見つかりませんでした");
      return;
    }

    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleRefresh(0)));
    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleRefresh(DEBOUNCE_MS)));
    // vault-launcherの sync コマンド(git commit)完了時に再計算する
    this.registerEvent(this.app.workspace.on("vault-launcher:sync-done", () => this.scheduleRefresh(0)));
    // VSCodeなどObsidianの外でファイルやgit状態を変更してから戻ってきたときに再計算する
    this.registerDomEvent(window, "focus", () => this.scheduleRefresh(0));

    this.addCommand({
      id: "refresh-git-gutter",
      name: "Gitガター表示を更新",
      callback: () => this.scheduleRefresh(0),
    });

    this.scheduleRefresh(0);
  }

  onunload() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  scheduleRefresh(delay) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), delay);
  }

  async refresh() {
    if (!this.gitRoot) return;
    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view || !view.file) return;
    const cm = view.editor?.cm;
    if (!cm) return;

    const relPath = path
      .relative(this.gitRoot, path.join(this.basePath, view.file.path))
      .split(path.sep)
      .join("/");

    const seq = ++this.requestSeq;

    if (await isGitIgnored(this.gitRoot, relPath)) {
      if (seq !== this.requestSeq) return;
      const currentView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (currentView?.editor?.cm !== cm) return;
      cm.dispatch({ effects: setGitGutterMarkers.of(RangeSet.empty) });
      return;
    }

    let oldContent = "";
    try {
      oldContent = await gitShowHead(this.gitRoot, relPath);
    } catch {
      // 未コミット/未追跡ファイル → 変更前の内容は空として扱う(全行が追加扱いになる)
      oldContent = "";
    }

    // 差分取得中にファイル切り替えが起きていたら破棄する
    if (seq !== this.requestSeq) return;
    const currentView = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (currentView?.editor?.cm !== cm) return;

    const newContent = cm.state.doc.toString();
    const oldLines = oldContent.length ? oldContent.split("\n") : [];
    const newLines = newContent.length ? newContent.split("\n") : [];

    let gutterData = { added: new Set(), modified: new Set(), deleteBefore: new Set(), deleteAtEnd: false };
    if (oldLines.length <= MAX_DIFF_LINES && newLines.length <= MAX_DIFF_LINES) {
      const ops = diffLines(oldLines, newLines);
      gutterData = buildLineStatuses(ops, newLines.length);
    } else {
      console.debug("[git-gutter] ファイルが大きすぎるため差分表示をスキップしました:", relPath);
    }

    const rangeSet = buildMarkerRangeSet(cm.state.doc, gutterData);
    cm.dispatch({ effects: setGitGutterMarkers.of(rangeSet) });
  }
};
