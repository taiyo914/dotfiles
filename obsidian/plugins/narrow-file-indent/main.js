const obsidian = require("obsidian");

// Obsidianはファイルエクスプローラーを仮想スクロールで描画していて、
// フォルダの開閉やスクロールのたびに行のDOM要素を使い回し、そのつど
// style属性にインデント幅を !important付きで直接書き込み直している。
// CSSスニペットでは「そのとき画面にある行」にしか勝てないので、
// MutationObserverで行が作られる/書き換えられるたびに毎回上書きし直す。
// Obsidianが書き込むのと同じプロパティ名(論理プロパティ)で上書きする。
// padding-left など別名のプロパティで書くと、あとから書かれた
// padding-inline-start のほうが勝ってしまい、上書きが効かない。
const PADDING = "9px";
const MARGIN = "0px";

module.exports = class NarrowFileIndentPlugin extends obsidian.Plugin {
  observer = null;
  observedContainer = null;

  async onload() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          this.applyIfMatch(mutation.target);
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => this.applyToSubtree(node));
        }
      }
    });

    this.app.workspace.onLayoutReady(() => this.setupObserver());

    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.setupObserver())
    );

    this.register(() => {
      if (this.observer) this.observer.disconnect();
    });
  }

  setupObserver() {
    const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
    const container = leaf?.view?.containerEl;
    if (!container) return;

    if (this.observedContainer !== container) {
      this.observer.disconnect();
      this.observer.observe(container, {
        attributes: true,
        attributeFilter: ["style"],
        childList: true,
        subtree: true,
      });
      this.observedContainer = container;
    }

    this.applyToSubtree(container);
  }

  applyToSubtree(node) {
    if (node.nodeType !== 1) return;
    if (node.classList.contains("nav-file-title")) this.applyStyle(node);
    node.querySelectorAll?.(".nav-file-title").forEach((el) => this.applyStyle(el));
  }

  applyIfMatch(target) {
    if (target?.nodeType === 1 && target.classList.contains("nav-file-title")) {
      this.applyStyle(target);
    }
  }

  applyStyle(el) {
    if (
      el.style.getPropertyValue("padding-inline-start") === PADDING &&
      el.style.getPropertyValue("margin-inline-start") === MARGIN
    ) {
      return;
    }
    el.style.setProperty("padding-inline-start", PADDING, "important");
    el.style.setProperty("margin-inline-start", MARGIN, "important");
    el.style.removeProperty("padding-left");
    el.style.removeProperty("margin-left");
  }
};
