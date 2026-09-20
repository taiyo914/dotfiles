"use strict";

const { Plugin, Modal, PluginSettingTab, Setting, setIcon } = require("obsidian");

const MODAL_CLASS = "mermaid-viewer-modal";

const DEFAULT_SETTINGS = {
  fitInline: true,
  maxHeight: 0,
  openOnClick: "always",
  sensitivity: 1
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// mermaid が出力する svg は viewBox を必ず持つので、そこから元の大きさを読む。
// viewBox が無いときだけ実際の描画サイズにフォールバックする。
function naturalSize(svg) {
  const box = svg.viewBox && svg.viewBox.baseVal;
  if (box && box.width > 0 && box.height > 0) {
    return { w: box.width, h: box.height };
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { w: rect.width, h: rect.height };
  }
  return null;
}

// トラックパッドのピンチは ctrlKey 付きの wheel イベントとして届く。
// 1 回のイベントの deltaY が小さいので、指数関数で少しずつ倍率を変える。
function wheelZoomFactor(e, sensitivity) {
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 33;
  else if (e.deltaMode === 2) delta *= 300;
  return Math.exp(-clamp(delta, -25, 25) * 0.01 * sensitivity);
}

class MermaidViewerModal extends Modal {
  constructor(app, sourceSvg, settings) {
    super(app);
    this.sourceSvg = sourceSvg;
    this.settings = settings;
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.dragPointerId = -1;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.pinchStartDistance = 0;
    this.pinchStartScale = 1;
  }

  onOpen() {
    this.modalEl.addClass(MODAL_CLASS);
    this.contentEl.empty();

    this.natural = naturalSize(this.sourceSvg) || { w: 800, h: 600 };

    this.stage = this.contentEl.createDiv({ cls: "mermaid-viewer-stage" });
    this.canvas = this.stage.createDiv({ cls: "mermaid-viewer-canvas" });

    // mermaid のスタイルは svg 内の <style> が id で対象を絞っているので、
    // id を含めてまるごと複製する。
    const clone = this.sourceSvg.cloneNode(true);
    clone.style.maxWidth = "none";
    clone.style.width = this.natural.w + "px";
    clone.style.height = this.natural.h + "px";
    this.canvas.appendChild(clone);

    this.buildToolbar();
    this.registerInteractions();
    this.registerShortcuts();

    // モーダルの大きさが確定してから初期表示倍率を計算する。
    window.requestAnimationFrame(() => this.fit());
  }

  buildToolbar() {
    const bar = this.contentEl.createDiv({ cls: "mermaid-viewer-toolbar" });

    this.scaleLabel = bar.createSpan({ cls: "mermaid-viewer-scale", text: "100%" });

    const addButton = (icon, label, onClick) => {
      const button = bar.createEl("button", { cls: "mermaid-viewer-btn" });
      setIcon(button, icon);
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
    };

    addButton("zoom-out", "縮小 ( - )", () => this.zoomAtCenter(1 / 1.25));
    addButton("zoom-in", "拡大 ( + )", () => this.zoomAtCenter(1.25));
    addButton("maximize", "全体を表示 ( 0 / ダブルクリック )", () => this.fit());
  }

  registerInteractions() {
    const sensitivity = this.settings.sensitivity;

    // ピンチ ( ctrlKey 付き ) は拡大縮小、二本指スクロールは移動に割り当てる。
    this.stage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          this.zoomAt(e.clientX, e.clientY, wheelZoomFactor(e, sensitivity));
        } else {
          this.translateX -= e.deltaX;
          this.translateY -= e.deltaY;
          this.apply();
        }
      },
      { passive: false }
    );

    this.stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      this.dragPointerId = e.pointerId;
      this.dragStartX = e.clientX - this.translateX;
      this.dragStartY = e.clientY - this.translateY;
      this.stage.setPointerCapture(e.pointerId);
      this.stage.addClass("is-dragging");
    });

    this.stage.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.dragPointerId) return;
      this.translateX = e.clientX - this.dragStartX;
      this.translateY = e.clientY - this.dragStartY;
      this.apply();
    });

    const endDrag = (e) => {
      if (e.pointerId !== this.dragPointerId) return;
      this.dragPointerId = -1;
      this.stage.removeClass("is-dragging");
      if (this.stage.hasPointerCapture(e.pointerId)) {
        this.stage.releasePointerCapture(e.pointerId);
      }
    };
    this.stage.addEventListener("pointerup", endDrag);
    this.stage.addEventListener("pointercancel", endDrag);

    this.stage.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.fit();
    });

    this.registerTouchGestures();
  }

  // スマホやタブレット用。指二本の距離の変化をそのまま倍率にする。
  registerTouchGestures() {
    const distanceOf = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    const centerOf = (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    });

    this.stage.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 2) {
          this.pinchStartDistance = distanceOf(e.touches);
          this.pinchStartScale = this.scale;
        } else if (e.touches.length === 1) {
          this.dragStartX = e.touches[0].clientX - this.translateX;
          this.dragStartY = e.touches[0].clientY - this.translateY;
        }
      },
      { passive: true }
    );

    this.stage.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 2 && this.pinchStartDistance > 0) {
          e.preventDefault();
          const center = centerOf(e.touches);
          const target = this.pinchStartScale * (distanceOf(e.touches) / this.pinchStartDistance);
          this.zoomAt(center.x, center.y, target / this.scale);
        } else if (e.touches.length === 1) {
          e.preventDefault();
          this.translateX = e.touches[0].clientX - this.dragStartX;
          this.translateY = e.touches[0].clientY - this.dragStartY;
          this.apply();
        }
      },
      { passive: false }
    );

    this.stage.addEventListener("touchend", () => {
      this.pinchStartDistance = 0;
    });
  }

  registerShortcuts() {
    this.scope.register([], "0", () => {
      this.fit();
      return false;
    });
    for (const key of ["+", "=", "]"]) {
      this.scope.register([], key, () => {
        this.zoomAtCenter(1.25);
        return false;
      });
    }
    for (const key of ["-", "["]) {
      this.scope.register([], key, () => {
        this.zoomAtCenter(1 / 1.25);
        return false;
      });
    }
  }

  apply() {
    this.canvas.style.transform =
      "translate(" + this.translateX + "px, " + this.translateY + "px) scale(" + this.scale + ")";
    if (this.scaleLabel) {
      this.scaleLabel.setText(Math.round(this.scale * 100) + "%");
    }
  }

  // 指定した画面上の点を固定したまま拡大縮小する。
  zoomAt(clientX, clientY, factor) {
    const rect = this.stage.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const next = clamp(this.scale * factor, 0.05, 20);
    if (next === this.scale) return;
    const ratio = next / this.scale;
    this.translateX = x - (x - this.translateX) * ratio;
    this.translateY = y - (y - this.translateY) * ratio;
    this.scale = next;
    this.apply();
  }

  zoomAtCenter(factor) {
    const rect = this.stage.getBoundingClientRect();
    this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  // 図の全体が見える倍率にして中央に置く。元の大きさより大きくはしない。
  fit() {
    const rect = this.stage.getBoundingClientRect();
    const padding = 24;
    const availableW = Math.max(1, rect.width - padding * 2);
    const availableH = Math.max(1, rect.height - padding * 2);
    this.scale = Math.min(1, availableW / this.natural.w, availableH / this.natural.h);
    this.translateX = (rect.width - this.natural.w * this.scale) / 2;
    this.translateY = (rect.height - this.natural.h * this.scale) / 2;
    this.apply();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class MermaidViewerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("ノート内で図を縮めて表示する")
      .setDesc("図がノートの幅より大きいとき、全体が見えるように縮小する。元の大きさより拡大はしない。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.fitInline).onChange(async (value) => {
          this.plugin.settings.fitInline = value;
          await this.plugin.saveSettings();
          this.plugin.applyBodyState();
          this.plugin.refreshAllBlocks();
        })
      );

    new Setting(containerEl)
      .setName("ノート内での図の高さの上限")
      .setDesc(
        "この高さ ( ピクセル ) に収まるところまで縮小する。0 なら高さを制限しない。" +
          "0 のときは CSS だけで幅を合わせるが、1 以上にすると JS で大きさを書き換えるので、" +
          "スクロール中に図がちらつくことがある。"
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.maxHeight))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) return;
            this.plugin.settings.maxHeight = parsed;
            await this.plugin.saveSettings();
            this.plugin.applyBodyState();
            this.plugin.refreshAllBlocks();
          })
      );

    new Setting(containerEl)
      .setName("図をクリックしたときにビューアを開く")
      .setDesc(
        "「編集画面でも開く」にすると、編集画面でクリックしてもソースに戻らなくなる。" +
          "ソースを編集したいときは、ブロックの右上に出る「ブロックを編集」ボタンを押す。"
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("always", "編集画面でも開く")
          .addOption("reading", "閲覧画面でだけ開く")
          .addOption("off", "開かない ( コマンドからだけ開く )")
          .setValue(this.plugin.settings.openOnClick)
          .onChange(async (value) => {
            this.plugin.settings.openOnClick = value;
            await this.plugin.saveSettings();
            this.plugin.applyBodyState();
          })
      );

    new Setting(containerEl)
      .setName("ズームの効き具合")
      .setDesc("ピンチやホイールで倍率が変わる速さ。大きくすると速くなる。")
      .addSlider((slider) =>
        slider
          .setLimits(0.25, 3, 0.25)
          .setValue(this.plugin.settings.sensitivity)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.sensitivity = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = class MermaidViewerPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MermaidViewerSettingTab(this.app, this));

    this.pendingBlocks = new Set();
    this.frameId = 0;

    this.applyBodyState();
    this.register(() => {
      delete document.body.dataset.mermaidViewerClick;
      delete document.body.dataset.mermaidViewerFit;
    });

    this.setupClickHandling();
    this.setupMutationObserver();

    // ペインの幅が変わったら測り直す。図ごとに ResizeObserver を付けると
    // ノートを開き直すたびに監視対象が溜まっていくので、まとめて 1 か所で扱う。
    this.registerEvent(this.app.workspace.on("resize", () => this.refreshAllBlocks()));

    this.registerMarkdownPostProcessor((el) => this.scan(el));
    this.app.workspace.onLayoutReady(() => this.scan(document.body));

    this.addCommand({
      id: "open-first-mermaid",
      name: "このノートの最初の mermaid 図をビューアで開く",
      callback: () => {
        const block = document.querySelector(".workspace-leaf.mod-active .mermaid");
        if (block) this.openViewer(block);
      }
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // 図そのものに class を足さず、body の属性だけで見た目を切り替える。
  // 編集画面の mermaid は CodeMirror の管理下にあり、外から要素や class を
  // 足すと図ごと作り直されてちらつくため。
  applyBodyState() {
    document.body.dataset.mermaidViewerClick = this.settings.openOnClick;
    document.body.dataset.mermaidViewerFit = this.fitMode();
  }

  // off … 何もしない
  // css … 幅に収めるだけ。CSS だけで済むので JS は図に触らない
  // js  … 高さの上限があるので、JS で大きさを計算して書き込む
  fitMode() {
    if (!this.settings.fitInline) return "off";
    return this.settings.maxHeight > 0 ? "js" : "css";
  }

  // ---- 図を見つける ----

  setupMutationObserver() {
    // mermaid の svg は少し遅れて差し込まれる。全体を走査し直すとスクロールが
    // 重くなるので、増えた要素の周りだけを対象にする。
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          this.collect(node);
        }
      }
      this.scheduleFlush();
    });
    this.mutationObserver.observe(this.app.workspace.containerEl, {
      childList: true,
      subtree: true
    });
    this.register(() => {
      this.mutationObserver.disconnect();
      window.cancelAnimationFrame(this.frameId);
    });
  }

  collect(node) {
    if (node.closest("." + MODAL_CLASS)) return;
    const own = node.closest(".mermaid");
    if (own) this.pendingBlocks.add(own);
    if (node.querySelectorAll) {
      for (const el of Array.from(node.querySelectorAll(".mermaid"))) {
        this.pendingBlocks.add(el);
      }
    }
  }

  scheduleFlush() {
    if (this.pendingBlocks.size === 0 || this.frameId !== 0) return;
    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = 0;
      const blocks = Array.from(this.pendingBlocks);
      this.pendingBlocks.clear();
      for (const block of blocks) {
        if (block.isConnected) this.prepare(block);
      }
    });
  }

  scan(root) {
    if (!root || !root.querySelectorAll) return;
    for (const el of Array.from(root.querySelectorAll(".mermaid"))) {
      if (el.closest("." + MODAL_CLASS)) continue;
      this.prepare(el);
    }
  }

  prepare(block) {
    if (!block.querySelector("svg")) return;
    this.fitBlock(block);
  }

  // ---- クリックで開く ----

  // 図ごとにリスナーを付けず、document で 1 組だけ受ける。
  // 捕捉フェーズ ( 第 4 引数の true ) にするのは、編集画面の CodeMirror が
  // カーソルを動かすより先に止める必要があるため。
  setupClickHandling() {
    this.registerDomEvent(
      document,
      "mousedown",
      (e) => {
        const block = this.clickTargetBlock(e);
        if (!block) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );

    this.registerDomEvent(
      document,
      "click",
      (e) => {
        const block = this.clickTargetBlock(e);
        if (!block) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().length > 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.openViewer(block);
      },
      true
    );
  }

  // クリックを横取りしてよい図なら、その図の要素を返す。
  clickTargetBlock(e) {
    const mode = this.settings.openOnClick;
    if (mode === "off") return null;
    if (e.button !== 0) return null;

    const target = e.target;
    if (!(target instanceof Element)) return null;

    const block = target.closest(".mermaid");
    if (!block) return null;
    if (block.closest("." + MODAL_CLASS)) return null;
    if (!block.querySelector("svg")) return null;
    if (mode === "reading" && !block.closest(".markdown-reading-view")) return null;

    // 図の中のリンクとブロック編集ボタンは邪魔しない。
    if (target.closest("a")) return null;
    if (target.closest(".edit-block-button")) return null;

    return block;
  }

  // ---- 大きさを合わせる ----

  fitBlock(block) {
    const svg = block.querySelector("svg");
    if (!svg) return;

    // 幅に収めるだけなら CSS が担当するので、JS は何も書き込まない。
    if (this.fitMode() !== "js") {
      this.writeSize(svg, "", "", "");
      return;
    }

    const size = naturalSize(svg);
    if (!size) return;

    // 幅は親の内側の幅から測る。図そのものの幅は svg を縮めると一緒に縮む
    // 作りのことがあり、それだと縮小が止まらなくなる。
    const host = block.parentElement || block;
    const style = window.getComputedStyle(host);
    const available =
      host.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    if (available <= 0) return;

    const maxHeight = this.settings.maxHeight > 0 ? this.settings.maxHeight : Infinity;
    const scale = Math.min(1, available / size.w, maxHeight / size.h);

    this.writeSize(svg, Math.round(size.w * scale) + "px", Math.round(size.h * scale) + "px", "none");
  }

  // 同じ値でも書き込めば DOM の変更として扱われ、編集画面では図の作り直しの
  // きっかけになる。値が変わるときだけ書き込む。
  writeSize(svg, width, height, maxWidth) {
    if (svg.style.width === width && svg.style.height === height && svg.style.maxWidth === maxWidth) {
      return;
    }
    if (width === "") {
      svg.style.removeProperty("width");
      svg.style.removeProperty("height");
      svg.style.removeProperty("max-width");
      return;
    }
    svg.style.maxWidth = maxWidth;
    svg.style.width = width;
    svg.style.height = height;
  }

  refreshAllBlocks() {
    for (const block of Array.from(document.querySelectorAll(".mermaid"))) {
      if (block.closest("." + MODAL_CLASS)) continue;
      this.fitBlock(block);
    }
  }

  // ---- ビューア ----

  openViewer(block) {
    const svg = block.querySelector("svg");
    if (!svg) return;
    new MermaidViewerModal(this.app, svg, this.settings).open();
  }

  onunload() {
    for (const svg of Array.from(document.querySelectorAll(".mermaid svg"))) {
      svg.style.removeProperty("width");
      svg.style.removeProperty("height");
      svg.style.removeProperty("max-width");
    }
  }
};
