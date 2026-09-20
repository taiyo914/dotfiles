var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AutoTocPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var TOC_START = "%% toc-start %%";
var TOC_END = "%% toc-end %%";
var AutoTocPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.isUpdating = false;
  }
  async onload() {
    this.registerEvent(
      this.app.metadataCache.on(
        "changed",
        (0, import_obsidian.debounce)(
          (file) => this.onMetadataChanged(file),
          300,
          true
        )
      )
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        setTimeout(() => {
          const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
          if (view && view.file) this.onMetadataChanged(view.file);
        }, 200);
      })
    );
    this.addCommand({
      id: "insert-auto-toc",
      name: "Insert Auto TOC markers",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const text = `${TOC_START}
${TOC_END}
`;
        editor.replaceRange(text, cursor);
      }
    });
  }
  onMetadataChanged(file) {
    var _a;
    if (this.isUpdating) return;
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!activeView) return;
    if (activeView.file !== file) return;
    const editor = activeView.editor;
    const content = editor.getValue();
    const codeBlockRanges = [];
    const codeBlockRe = /```[\s\S]*?```/g;
    let codeMatch;
    while ((codeMatch = codeBlockRe.exec(content)) !== null) {
      codeBlockRanges.push([codeMatch.index, codeMatch.index + codeMatch[0].length]);
    }
    const insideCodeBlock = (pos) => codeBlockRanges.some(([s, e]) => pos >= s && pos < e);
    let startIdx = -1;
    let searchFrom = 0;
    while (true) {
      const idx = content.indexOf(TOC_START, searchFrom);
      if (idx === -1) break;
      if (!insideCodeBlock(idx)) {
        startIdx = idx;
        break;
      }
      searchFrom = idx + TOC_START.length;
    }
    if (startIdx === -1) return;
    let endIdx = -1;
    searchFrom = startIdx + TOC_START.length;
    while (true) {
      const idx = content.indexOf(TOC_END, searchFrom);
      if (idx === -1) break;
      if (!insideCodeBlock(idx)) {
        endIdx = idx;
        break;
      }
      searchFrom = idx + TOC_END.length;
    }
    if (endIdx === -1) return;
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return;
    const tocStartLine = editor.offsetToPos(startIdx).line;
    const lines = content.split("\n");
    const isQuoted = (lineNo) => /^\s{0,3}>/.test(lines[lineNo] != null ? lines[lineNo] : "");
    const headings = ((_a = cache.headings) != null ? _a : []).filter(
      (h) => h.level >= 1 && h.level <= 4 && h.position.start.line > tocStartLine && !isQuoted(h.position.start.line)
    );
    const minLevel = headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1;
    const tocLines = [];
    for (const h of headings) {
      const link = `[[#${h.heading}]]`;
      const indent = "    ".repeat(h.level - minLevel);
      tocLines.push(`${indent}- ${link}`);
    }
    const newTocBlock = tocLines.length > 0 ? `${TOC_START}
${tocLines.join("\n")}
${TOC_END}` : `${TOC_START}
${TOC_END}`;
    const oldTocBlock = content.substring(startIdx, endIdx + TOC_END.length);
    if (oldTocBlock === newTocBlock) return;
    const startLine = editor.offsetToPos(startIdx);
    const endPos = editor.offsetToPos(endIdx + TOC_END.length);
    this.isUpdating = true;
    try {
      editor.replaceRange(newTocBlock, startLine, endPos);
    } finally {
      setTimeout(() => {
        this.isUpdating = false;
      }, 100);
    }
  }
};
