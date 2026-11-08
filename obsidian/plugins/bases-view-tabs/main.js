"use strict";

const { Plugin, setIcon } = require("obsidian");

// Bases のファイルを開いたタブの種類
const BASES_VIEW_TYPE = "bases";

// .base ファイルが書き換わってから、Obsidian が新しい内容を読み込み終わるのを待つ時間（ms）
const RELOAD_DELAY = 200;

// Bases の公開 API には表示を切り替える方法がないので、Obsidian 内部の controller を使う。
// 使うもの: viewHeaderEl / viewName / getQueryViewNames() / query.getViewConfig() /
// plugin.getRegistration() / selectView() / events の "view-changed"。
// どれかが無いとき（Obsidian の更新で中身が変わったとき）は何もせず、元のメニューのままにする。
function isSupportedController(controller) {
  return (
    controller &&
    controller.viewHeaderEl instanceof HTMLElement &&
    typeof controller.getQueryViewNames === "function" &&
    typeof controller.selectView === "function" &&
    typeof controller.events?.on === "function"
  );
}

class ViewTabs {
  constructor(controller) {
    this.controller = controller;
    this.toolbarEl = controller.viewHeaderEl.querySelector(".bases-toolbar");
    this.menuEl = this.toolbarEl?.querySelector(".bases-toolbar-views-menu");
    if (!this.toolbarEl || !this.menuEl) return;

    this.tabsEl = createDiv({ cls: "bases-view-tabs" });
    this.toolbarEl.insertBefore(this.tabsEl, this.menuEl);
    this.toolbarEl.addClass("has-view-tabs");

    this.eventRef = controller.events.on("view-changed", () => this.render());
    // 幅が変わるたびに、タブが入りきるかを確かめる
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.toolbarEl);
    this.render();
  }

  // 表示ごとに、その種類のアイコンと名前のタブを作る
  render() {
    if (!this.tabsEl) return;
    const { controller } = this;
    this.tabsEl.empty();

    for (const name of controller.getQueryViewNames()) {
      const type = controller.query?.getViewConfig?.(name)?.type;
      const icon = controller.plugin?.getRegistration?.(type)?.icon ?? "lucide-file-question";

      const tabEl = this.tabsEl.createDiv({ cls: "bases-view-tab" });
      tabEl.toggleClass("is-active", name === controller.viewName);
      setIcon(tabEl.createSpan({ cls: "bases-view-tab-icon" }), icon);
      tabEl.createSpan({ cls: "bases-view-tab-name", text: name });

      tabEl.addEventListener("click", () => controller.selectView(name));
      // 右クリックでは、元のメニューのボタンを右クリックしたときと同じ「表示の設定」を開く
      tabEl.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        controller.selectView(name);
        this.menuEl.querySelector(".text-icon-button")?.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        );
      });
    }
    this.fit();
  }

  // タブを表示してみて、はみ出すときは元のメニューに戻す
  fit() {
    if (!this.tabsEl) return;
    this.toolbarEl.removeClass("is-compact");
    if (this.tabsEl.scrollWidth > this.tabsEl.clientWidth + 1) {
      this.toolbarEl.addClass("is-compact");
    }
  }

  destroy() {
    if (!this.tabsEl) return;
    this.controller.events.offref(this.eventRef);
    this.resizeObserver.disconnect();
    this.tabsEl.remove();
    this.toolbarEl.removeClass("has-view-tabs", "is-compact");
  }
}

module.exports = class BasesViewTabsPlugin extends Plugin {
  onload() {
    // 開いている Bases の画面 → その画面に付けたタブ
    this.tabsByView = new Map();

    this.app.workspace.onLayoutReady(() => this.attachAll());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.attachAll()));
    // 表示の並び替えなどは "view-changed" が起きないので、.base ファイルの保存を合図に作り直す
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.extension !== "base") return;
        window.setTimeout(() => this.renderAll(), RELOAD_DELAY);
      })
    );
  }

  onunload() {
    for (const tabs of this.tabsByView.values()) tabs.destroy();
    this.tabsByView.clear();
  }

  // 新しく開いた Bases の画面にタブを付け、閉じた画面のタブを片付ける
  attachAll() {
    for (const [view, tabs] of this.tabsByView) {
      if (!view.containerEl.isConnected) {
        tabs.destroy();
        this.tabsByView.delete(view);
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(BASES_VIEW_TYPE)) {
      const view = leaf.view;
      if (this.tabsByView.has(view) || !isSupportedController(view.controller)) continue;
      this.tabsByView.set(view, new ViewTabs(view.controller));
    }
  }

  renderAll() {
    for (const tabs of this.tabsByView.values()) tabs.render();
  }
};
