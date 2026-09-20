const obsidian = require("obsidian");
const { ViewPlugin } = require("@codemirror/view");

const DEFAULT_SETTINGS = {
  readingView: true,
  livePreview: true,
};

// 開閉状態をどれだけ覚えておくか。編集中に無限に増えるのを防ぐための上限。
const OPEN_STATE_LIMIT = 300;

// ---------------------------------------------------------------------------
// ソースの解析
// ---------------------------------------------------------------------------

// ```xxx / ~~~xxx のフェンス行を判定する。
function parseFence(line) {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length, info: m[2] };
}

function isFenceClose(fence, line) {
  const f = parseFence(line);
  return !!f && f.char === fence.char && f.len >= fence.len && f.info.trim() === "";
}

// <details ...> だけの行を判定する。同じ行に <summary>...</summary> を続けた書き方も許す。
function matchOpen(line) {
  const m = /^<details(\s[^>]*?)?>(.*)$/.exec(line);
  if (!m) return null;
  const attrs = m[1] || "";
  const rest = m[2].trim();
  let summary = null;
  if (rest !== "") {
    const s = /^<summary>([\s\S]*)<\/summary>$/.exec(rest);
    // <details> の後ろに <summary> 以外のものが続く行は、GitHubでの見え方と揃わないので対象外にする
    if (!s) return null;
    summary = s[1];
  }
  return { open: /(^|\s)open(\s|=|$)/.test(attrs), summary };
}

function matchSummary(line) {
  const m = /^<summary>([\s\S]*)<\/summary>\s*$/.exec(line);
  return m ? m[1] : null;
}

function isClose(line) {
  return /^<\/details>\s*$/.test(line);
}

// openIdx 行の <details> に対応する </details> の行番号を返す。見つからなければ -1。
// コードフェンスの中と入れ子の <details> は読み飛ばす。
function findClose(lines, openIdx, to) {
  let depth = 1;
  let fence = null;
  for (let j = openIdx + 1; j < to; j++) {
    const line = lines[j];
    if (fence) {
      if (isFenceClose(fence, line)) fence = null;
      continue;
    }
    const f = parseFence(line);
    if (f) {
      fence = f;
      continue;
    }
    if (matchOpen(line)) {
      depth++;
      continue;
    }
    if (isClose(line)) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

// lines の [from, to) を「素のMarkdown部分」と「details ブロック」に分解する。
// details ブロックの中身も同じ関数で分解するので、入れ子にも対応する。
function parseNodes(lines, from, to) {
  const nodes = [];
  let plainStart = from;
  let fence = null;
  let i = from;

  const flushPlain = (end) => {
    if (end > plainStart) nodes.push({ type: "plain", from: plainStart, to: end });
  };

  while (i < to) {
    const line = lines[i];
    if (fence) {
      if (isFenceClose(fence, line)) fence = null;
      i++;
      continue;
    }
    const f = parseFence(line);
    if (f) {
      fence = f;
      i++;
      continue;
    }

    const open = matchOpen(line);
    if (open) {
      const end = findClose(lines, i, to);
      // 閉じていない <details> は何もせず、Obsidian本来の表示に任せる
      if (end >= 0) {
        flushPlain(i);
        let bodyFrom = i + 1;
        let summary = open.summary;
        if (summary === null && bodyFrom < end) {
          const s = matchSummary(lines[bodyFrom]);
          if (s !== null) {
            summary = s;
            bodyFrom++;
          }
        }
        nodes.push({
          type: "details",
          from: i,
          to: end,
          open: open.open,
          summary,
          children: parseNodes(lines, bodyFrom, end),
        });
        i = end + 1;
        plainStart = i;
        continue;
      }
    }
    i++;
  }

  flushPlain(to);
  return nodes;
}

// 同じ本文を何度も解析しないよう、直近の結果を1件だけ覚えておく。
class BlockCache {
  constructor() {
    this.text = null;
    this.lines = null;
    this.blocks = null;
  }

  get(text) {
    if (this.text !== text) {
      const lines = text.split("\n");
      this.text = text;
      this.lines = lines;
      this.blocks = parseNodes(lines, 0, lines.length).filter((n) => n.type === "details");
    }
    return { lines: this.lines, blocks: this.blocks };
  }
}

// 折りたたみの開閉状態を、書かれているソースをキーにして覚えておく。
class OpenState {
  constructor() {
    this.map = new Map();
  }
  get(key) {
    return this.map.get(key);
  }
  set(key, value) {
    if (this.map.size > OPEN_STATE_LIMIT) this.map.clear();
    this.map.set(key, value);
  }
}

// ---------------------------------------------------------------------------
// 描画の共通部品
// ---------------------------------------------------------------------------

function rawTextOf(lines, from, to) {
  return lines.slice(from, to + 1).join("\n");
}

// 先頭が --- だとフロントマターと取り違えられるので、空行を1つ足して水平線として描かせる。
function guardFrontmatter(md) {
  return /^---+\s*$/.test(md.split("\n")[0]) ? "\n" + md : md;
}

// <summary> の中身を描画する。MarkdownRenderer が付ける <p> は外して1行に収める。
async function renderSummary(app, md, el, sourcePath, component) {
  const tmp = document.createElement("div");
  await obsidian.MarkdownRenderer.render(app, md, tmp, sourcePath, component);
  const only = tmp.children.length === 1 ? tmp.firstElementChild : null;
  const src = only && only.tagName === "P" ? only : tmp;
  while (src.firstChild) el.appendChild(src.firstChild);
}

// ---------------------------------------------------------------------------
// 閲覧モード：GitHubと同じ折りたたみとして描く
// ---------------------------------------------------------------------------

// el を含む閲覧モードのレンダラを探す。
function previewRendererFor(app, el) {
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    const renderer = view && view.previewMode ? view.previewMode.renderer : null;
    if (renderer && renderer.previewEl && renderer.previewEl.contains(el)) return renderer;
  }
  return null;
}

// 閲覧モードは各セクションの高さを覚えていて、それを元に表示範囲を決めている。
// 折りたたみを開くなどして高さが変わったら伝えないと、スクロールしたときに下が真っ白になる。
// Obsidian自身がリストの折りたたみでやっているのと同じ手順を使う。
function notifyHeightChanged(app, el) {
  try {
    const renderer = previewRendererFor(app, el);
    if (!renderer) return;
    const section = renderer.getSectionContainer ? renderer.getSectionContainer(el) : null;
    if (section && section.resetCompute) section.resetCompute();
    if (renderer.queueRender) renderer.queueRender();
  } catch (e) {
    console.error("[details-fold] 高さの再計算を頼めませんでした", e);
  }
}

// 画像やmermaidなど、描いたあとから読み込まれて高さが変わるものに追従する。
// 描いた直後に測った高さのままだと、読み込み後にずれて表示範囲の計算が狂う。
function watchHeight(app, el, component) {
  if (typeof ResizeObserver !== "function") return;
  if (el.detailsFoldWatched) return;
  el.detailsFoldWatched = true;

  let last = el.offsetHeight;
  const observer = new ResizeObserver(() => {
    const height = el.offsetHeight;
    // 表示範囲の外に出るとDOMから外されて0になる。高さが変わったわけではないので無視する
    if (height === 0 || height === last) return;
    last = height;
    notifyHeightChanged(app, el);
  });
  observer.observe(el);
  component.register(() => {
    observer.disconnect();
    el.detailsFoldWatched = false;
  });
}

async function renderNodes(app, lines, nodes, container, sourcePath, component, openState) {
  for (const node of nodes) {
    if (node.type === "plain") {
      const md = lines.slice(node.from, node.to).join("\n");
      if (md.trim() === "") continue;
      const wrap = container.createDiv({ cls: "details-fold-md" });
      await obsidian.MarkdownRenderer.render(app, guardFrontmatter(md), wrap, sourcePath, component);
      continue;
    }

    const details = container.createEl("details", { cls: "details-fold" });
    const raw = rawTextOf(lines, node.from, node.to);
    const saved = openState ? openState.get(raw) : undefined;
    if (saved !== undefined ? saved : node.open) details.setAttr("open", "");
    if (openState) {
      details.addEventListener("toggle", () => {
        openState.set(raw, details.open);
        notifyHeightChanged(app, details);
      });
    }
    if (node.summary !== null) {
      const summary = details.createEl("summary");
      await renderSummary(app, node.summary, summary, sourcePath, component);
    }
    const body = details.createDiv({ cls: "details-fold-body" });
    await renderNodes(app, lines, node.children, body, sourcePath, component, openState);
  }
}

// 断片のひとつ前にある宿主（ブロック本体を描いた要素）を探す。
function findPrecedingHost(el) {
  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.classList.contains("details-fold-host")) return prev;
    prev = prev.previousElementSibling;
  }
  return null;
}

async function renderIntoHost(plugin, host, lines, block, sourcePath, component) {
  const raw = rawTextOf(lines, block.from, block.to);
  if (host.detailsFoldRaw === raw) return;
  host.detailsFoldRaw = raw;
  host.empty();
  await renderNodes(plugin.app, lines, [block], host, sourcePath, component, plugin.openState);
  notifyHeightChanged(plugin.app, host);
}

// ---------------------------------------------------------------------------
// 編集画面（ライブプレビュー）：タグはそのままの文字、中身は普通に描く
// ---------------------------------------------------------------------------
//
// Obsidianは <details> を生のHTMLとみなし、div.cm-html-embed という箱にまとめて流し込む。
// この箱はObsidian自身が作るもので、装飾の優先度では奪えない。
// そこで箱を奪い合うのをやめ、できあがった箱の中身だけを差し替える。

const HTML_BOX_SELECTOR = ".cm-html-embed";

function sourcePathOf(state) {
  const info = state.field(obsidian.editorInfoField, false);
  return info && info.file ? info.file.path : "";
}

// ```js を「JavaScript」のように直す。Obsidianが編集画面のラベルで使っているのと同じ手順。
function languageName(lang) {
  try {
    const info = window.CodeMirror.findModeByName(lang);
    if (info && info.name && info.name !== "null") return info.name;
  } catch (e) {
    // CodeMirrorが取れないObsidianでは、書いたままの文字を出す
  }
  return lang;
}

// コードブロックの右上に言語名のラベルを付ける。Obsidian標準の見た目に合わせるため。
function addCodeFlair(wrap) {
  for (const pre of Array.from(wrap.querySelectorAll("pre"))) {
    if (pre.querySelector(".details-fold-flair")) continue;
    const code = pre.querySelector("code");
    if (!code) continue;
    const m = /(?:^|\s)language-(\S+)/.exec(code.className || "");
    if (!m) continue;
    pre.createSpan({ cls: "details-fold-flair", text: languageName(m[1]) });
  }
}

// [from, to] の行を、タグの行はそのままの文字、それ以外はMarkdownとして描く。
// 空行は空行のまま残すので、書いたとおりの行の並びで見える。
async function renderRawTagsBlock(app, lines, from, to, container, sourcePath, component) {
  let chunk = [];
  let fence = null;

  const flush = async () => {
    if (chunk.length === 0) return;
    const md = chunk.join("\n");
    chunk = [];
    if (md.trim() === "") return;
    // markdown-rendered を付けると、コードブロックや表にObsidian標準のスタイルが当たる
    const wrap = container.createDiv({ cls: "details-fold-md markdown-rendered" });
    await obsidian.MarkdownRenderer.render(app, guardFrontmatter(md), wrap, sourcePath, component);
    addCodeFlair(wrap);
  };

  for (let i = from; i <= to; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // コードブロックの中は、空行もタグに見える行もそのまま中身として扱う
    if (fence) {
      chunk.push(line);
      if (isFenceClose(fence, line)) fence = null;
      continue;
    }

    if (matchOpen(line) || matchSummary(line) !== null || isClose(line)) {
      await flush();
      container.createDiv({ cls: "details-fold-tag", text: line });
      continue;
    }

    if (line.trim() === "") {
      await flush();
      container.createDiv({ cls: "details-fold-blank" });
      continue;
    }

    const f = parseFence(line);
    if (f) fence = f;
    chunk.push(line);
  }

  await flush();
}

function livePreviewExtension(plugin) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.component = new obsidian.Component();
        this.component.load();
        this.timer = null;
        this.heights = new WeakMap();
        // 画像などで箱の高さが後から変わったら、CodeMirrorに測り直させる
        this.observer =
          typeof ResizeObserver === "function"
            ? new ResizeObserver((entries) => {
                let changed = false;
                for (const entry of entries) {
                  const el = entry.target;
                  const height = el.offsetHeight;
                  // 表示範囲の外に出ると0になる。高さが変わったわけではないので無視する
                  if (height === 0 || this.heights.get(el) === height) continue;
                  this.heights.set(el, height);
                  changed = true;
                }
                if (changed && this.view) this.view.requestMeasure();
              })
            : null;
        this.schedule(view);
      }

      update() {
        this.schedule(this.view);
      }

      schedule(view) {
        if (view) this.view = view;
        if (this.timer !== null) return;
        // 描き直しの最中にCodeMirrorのDOMを触らないよう、更新が終わってから動かす
        this.timer = window.setTimeout(() => {
          this.timer = null;
          try {
            this.apply();
          } catch (e) {
            console.error("[details-fold] 編集画面の描き直しに失敗しました", e);
          }
        }, 0);
      }

      apply() {
        const view = this.view;
        if (!view || !plugin.settings.livePreview) return;
        const boxes = view.contentDOM.querySelectorAll(HTML_BOX_SELECTOR);
        if (boxes.length === 0) return;

        const { lines } = plugin.cache.get(view.state.doc.toString());
        const sourcePath = sourcePathOf(view.state);
        const owned = [];

        for (const box of boxes) {
          const range = this.rangeOf(view, box, lines);
          if (!range) continue;
          owned.push(box);
          const raw = rawTextOf(lines, range.from, range.to);
          // 同じ内容を描き直さない（Obsidianは箱を作り直すことがあるので毎回確かめる）
          if (box.dataset.detailsFoldRaw === raw) continue;
          box.dataset.detailsFoldRaw = raw;
          box.addClass("details-fold-box");
          box.empty();
          // CodeMirrorは箱の高さを先に見積もっている。描き終わってから測り直させないと、
          // スクロールしたときに表示範囲の計算がずれて下が真っ白になる。
          renderRawTagsBlock(plugin.app, lines, range.from, range.to, box, sourcePath, this.component)
            .then(() => view.requestMeasure())
            .catch((e) => console.error("[details-fold] 箱の中身を描けませんでした", e));
        }

        if (this.observer) {
          // 作り直されて外れた古い箱を観察したままにしないよう、毎回つなぎ直す
          this.observer.disconnect();
          for (const box of owned) this.observer.observe(box);
        }
      }

      // 箱がソースのどの行に対応するかを求める。details のタグで始まっていなければ対象外。
      rangeOf(view, box, lines) {
        let pos;
        try {
          pos = view.posAtDOM(box);
        } catch (e) {
          return null;
        }
        const doc = view.state.doc;
        for (const candidate of [pos, pos - 1]) {
          if (candidate < 0 || candidate > doc.length) continue;
          const info = view.lineBlockAt(candidate);
          const from = doc.lineAt(info.from).number - 1;
          const to = doc.lineAt(info.to).number - 1;
          const head = lines[from];
          if (head === undefined) continue;
          if (matchOpen(head) || isClose(head) || matchSummary(head) !== null) return { from, to };
        }
        return null;
      }

      destroy() {
        if (this.timer !== null) window.clearTimeout(this.timer);
        if (this.observer) this.observer.disconnect();
        this.component.unload();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// 設定画面
// ---------------------------------------------------------------------------

class DetailsFoldSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new obsidian.Setting(containerEl)
      .setName("閲覧モードで有効にする")
      .setDesc("閲覧モードで <details> をGitHubと同じ折りたたみとして描く")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.readingView).onChange(async (value) => {
          this.plugin.settings.readingView = value;
          await this.plugin.saveSettings();
        })
      );

    new obsidian.Setting(containerEl)
      .setName("編集画面で有効にする")
      .setDesc(
        "編集画面で details のタグをそのままの文字で出し、中身だけを普通に描く。オフに戻したときは Cmd+R で読み込み直す"
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.livePreview).onChange(async (value) => {
          this.plugin.settings.livePreview = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

module.exports = class DetailsFoldPlugin extends obsidian.Plugin {
  cache = new BlockCache();
  openState = new OpenState();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DetailsFoldSettingTab(this.app, this));
    this.registerEditorExtension(livePreviewExtension(this));

    this.addCommand({
      id: "diagnose",
      name: "診断情報をコンソールに出す",
      callback: () => this.diagnose(),
    });

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      if (!this.settings.readingView) return;
      const info = ctx.getSectionInfo(el);
      // ファイルのセクションとして描かれたものだけを扱う（埋め込みやポップアップの中では何もしない）
      if (!info) return;

      const { lines, blocks } = this.cache.get(info.text);
      if (blocks.length === 0) return;

      for (const block of blocks) {
        if (info.lineStart === block.from) {
          const child = new obsidian.MarkdownRenderChild(el);
          ctx.addChild(child);
          el.addClass("details-fold-host");
          await renderIntoHost(this, el, lines, block, ctx.sourcePath, child);
          watchHeight(this.app, el, child);
          return;
        }

        if (info.lineStart > block.from && info.lineEnd <= block.to) {
          // 空行でHTMLブロックが打ち切られ、折りたたみの外に飛び出した断片。
          // 中身は宿主のほうで描き直すので、ここは隠すだけにする（消さないので取り戻せる）。
          el.addClass("details-fold-hidden");
          // 断片が描き直された = 本文が書き換わったということなので、宿主も最新の内容にする
          const host = findPrecedingHost(el);
          if (host) {
            const child = new obsidian.MarkdownRenderChild(el);
            ctx.addChild(child);
            await renderIntoHost(this, host, lines, block, ctx.sourcePath, child);
          }
          return;
        }
      }
    });
  }

  // うまく動かないときに、どこで止まっているかを見るためのコマンド。
  diagnose() {
    const out = {
      obsidian: obsidian.apiVersion,
      settings: this.settings,
    };
    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const cm = view && view.editor ? view.editor.cm : null;
    if (!cm) {
      out.editor = "エディタが取れなかった（閲覧モードで開いている可能性）";
    } else {
      const { blocks } = this.cache.get(cm.state.doc.toString());
      out.blockCount = blocks.length;
      out.blockLines = blocks.map((b) => `${b.from + 1}-${b.to + 1}`);
      const boxes = Array.from(cm.contentDOM.querySelectorAll(HTML_BOX_SELECTOR));
      out.boxCount = boxes.length;
      out.boxes = boxes.map((box) => {
        let pos = null;
        try {
          pos = cm.posAtDOM(box);
        } catch (e) {
          pos = `取れなかった: ${e && e.message}`;
        }
        let lineRange = null;
        if (typeof pos === "number") {
          const info = cm.lineBlockAt(pos);
          lineRange = `${cm.state.doc.lineAt(info.from).number}-${cm.state.doc.lineAt(info.to).number}`;
        }
        return {
          lineRange,
          rewritten: box.dataset.detailsFoldRaw !== undefined,
          head: box.textContent.slice(0, 40),
        };
      });
    }
    console.log("[details-fold] 診断", out);
    new obsidian.Notice("診断情報をコンソールに出しました");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshAll();
  }

  // 設定を変えたときに、開いているノートの表示をその場で作り直す。
  refreshAll() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view && view.previewMode && view.previewMode.rerender) view.previewMode.rerender(true);
      const cm = view && view.editor ? view.editor.cm : null;
      if (cm) {
        for (const box of cm.contentDOM.querySelectorAll(HTML_BOX_SELECTOR)) {
          delete box.dataset.detailsFoldRaw;
        }
      }
    }
  }
};
