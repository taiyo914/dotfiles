const obsidian = require("obsidian");
const { foldEffect, unfoldEffect, foldable, foldedRanges } = require("@codemirror/language");

const FOLD_DELAY_MS = 300;
const FOLD_MARKER = "-";
const UNFOLD_MARKER = "+";

module.exports = class AutoFoldHeadingsPlugin extends obsidian.Plugin {
  lastFoldedPath = null;

  async onload() {
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file) return;
        if (this.lastFoldedPath === file.path) return;
        this.lastFoldedPath = file.path;
        setTimeout(() => this.foldHeadings(file), FOLD_DELAY_MS);
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.lastFoldedPath = null;
      })
    );
  }

  foldHeadings(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.headings?.length) return;

    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) return;
    const cm = view.editor?.cm;
    if (!cm) return;

    const { foldTargets, unfoldTargets } = this.getTargets(cache);

    const effects = [];

    for (const lineNum of foldTargets) {
      const line = cm.state.doc.line(lineNum + 1);
      const range = foldable(cm.state, line.from, line.to);
      if (range) effects.push(foldEffect.of(range));
    }

    const folded = foldedRanges(cm.state);
    for (const lineNum of unfoldTargets) {
      const line = cm.state.doc.line(lineNum + 1);
      folded.between(line.from, line.to, (from, to) => {
        effects.push(unfoldEffect.of({ from, to }));
      });
    }

    if (effects.length) {
      cm.dispatch({ effects });
    }
  }

  getTargets(cache) {
    const fm = cache.frontmatter;
    const foldSpec = fm?.fold_headings;
    const foldTargets = [];
    const unfoldTargets = [];

    for (const h of cache.headings) {
      const line = h.position.start.line;

      if (h.heading.startsWith(UNFOLD_MARKER)) {
        unfoldTargets.push(line);
        continue;
      }

      if (h.heading.startsWith(FOLD_MARKER)) {
        foldTargets.push(line);
        continue;
      }

      if (foldSpec === "all") {
        foldTargets.push(line);
        continue;
      }

      if (Array.isArray(foldSpec) && foldSpec.includes(h.level)) {
        foldTargets.push(line);
      }
    }

    return { foldTargets, unfoldTargets };
  }
};
