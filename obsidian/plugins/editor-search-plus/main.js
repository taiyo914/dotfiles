const obsidian = require("obsidian");
const { Decoration, EditorView } = require("@codemirror/view");
const { StateEffect, StateField } = require("@codemirror/state");

// ハイライトする件数の上限。これを超えた分はハイライトも件数表示もしない
const MAX_MATCHES = 10000;
// 検索バーで「次へ」「置換」などに使う Obsidian 本体のメソッドのうち、このプラグインが差し替えるもの
const PATCHED_METHODS = [
  "show",
  "onSearchInput",
  "highlight",
  "clear",
  "searchAll",
  "replaceAll",
];

// ---- ハイライト ----

// 検索語（RegExp。検索していないときは null）を設定する
const setQuery = StateEffect.define();
// 今いる 1 件の範囲（{ from, to } のオフセット。なければ null）を設定する
const setCurrent = StateEffect.define();

const allMatchMark = Decoration.mark({ class: "esp-match" });
const currentMatchMark = Decoration.mark({ class: "esp-match esp-match-current" });

const searchHighlightField = StateField.define({
  create() {
    return { regex: null, current: null, decorations: Decoration.none };
  },
  update(value, tr) {
    let { regex, current } = value;
    let changed = tr.docChanged;
    if (current && tr.docChanged) {
      current = { from: tr.changes.mapPos(current.from, 1), to: tr.changes.mapPos(current.to, -1) };
      if (current.to < current.from) current = null;
    }
    for (const effect of tr.effects) {
      if (effect.is(setQuery)) {
        regex = effect.value;
        changed = true;
      } else if (effect.is(setCurrent)) {
        current = effect.value;
        changed = true;
      }
    }
    if (!changed) return value;
    return { regex, current, decorations: buildDecorations(tr.state.doc.toString(), regex, current) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

function buildDecorations(text, regex, current) {
  if (!regex) return Decoration.none;
  const ranges = [];
  for (const match of findMatches(regex, text)) {
    // 長さ 0 の一致 (^ や \b だけの検索など) は印を付けられないので飛ばす
    if (match.from === match.to) continue;
    const isCurrent = current && current.from === match.from && current.to === match.to;
    ranges.push((isCurrent ? currentMatchMark : allMatchMark).range(match.from, match.to));
  }
  return Decoration.set(ranges, true);
}

function findMatches(regex, text) {
  const matches = [];
  for (const m of text.matchAll(regex)) {
    // result は置換で $1 などを埋めるときに使う
    matches.push({ from: m.index, to: m.index + m[0].length, result: m });
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}

// ---- 検索語の組み立て ----

const SYNTAX_CHARS = "^$\\.*+?()[]{}|/";
const POSIX_CLASSES = {
  alpha: "a-zA-Z",
  digit: "0-9",
  alnum: "a-zA-Z0-9",
  upper: "A-Z",
  lower: "a-z",
  space: "\\s",
  blank: " \\t",
  word: "\\w",
  xdigit: "0-9A-Fa-f",
  punct: "!-\\/:-@\\[-`{-~",
  cntrl: "\\x00-\\x1f\\x7f",
};

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 通常の検索は Obsidian 本体と同じく、大文字と小文字を区別しない
function compileQuery(query, useRegex) {
  if (!useRegex) return new RegExp(escapeRegExp(query), "giu");

  // ^ と $ は行の先頭と末尾に一致させる。ファイル全体の先頭と末尾には \A と \z を使う
  let flags = "gmu";
  let source = query;
  const head = source.match(/^\(\?([a-z]+)\)/);
  if (head) {
    for (const flag of head[1]) {
      if (flag === "i" || flag === "s") flags += flag;
      else if (flag !== "m") throw new Error(`(?${flag}) には対応していません`);
    }
    source = source.slice(head[0].length);
  }
  return new RegExp(perlToJs(source), flags);
}

// Perl の書き方のうち JavaScript の正規表現にないものを、同じ意味の書き方に置き換える
function perlToJs(src) {
  let out = "";
  let inClass = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (c === "\\") {
      const n = src[i + 1];
      if (n === undefined) {
        out += "\\";
        break;
      }
      i++;

      if (!inClass && n === "Q") {
        // \Q ... \E の間はすべて普通の文字として扱う
        const end = src.indexOf("\\E", i + 1);
        out += escapeRegExp(end === -1 ? src.slice(i + 1) : src.slice(i + 1, end));
        i = end === -1 ? src.length : end + 1;
      } else if (!inClass && n === "A") {
        out += "(?<![\\s\\S])";
      } else if (!inClass && n === "z") {
        out += "(?![\\s\\S])";
      } else if (!inClass && n === "Z") {
        out += "(?=\\n?(?![\\s\\S]))";
      } else if (n === "x" && src[i + 1] === "{") {
        // \x{263A} → \u{263A}
        const end = src.indexOf("}", i);
        out += "\\u" + src.slice(i + 1, end + 1);
        i = end;
      } else if (n === "p" || n === "P") {
        // \p{L} はそのまま、\pL → \p{L}、\p{Han} → \p{Script=Han}
        let name;
        if (src[i + 1] === "{") {
          const end = src.indexOf("}", i);
          name = src.slice(i + 2, end);
          i = end;
        } else {
          name = src[i + 1] ?? "";
          i++;
        }
        out += `\\${n}{${unicodeProperty(name)}}`;
      } else if (!inClass && n === "g") {
        // \g1, \g{1} → \1、\g{name} → \k<name>
        const ref = src.slice(i + 1).match(/^(?:\{(\w+)\}|(\d+))/);
        if (!ref) throw new Error("\\g の後ろにグループの番号か名前が必要です");
        const name = ref[1] ?? ref[2];
        out += /^\d+$/.test(name) ? `\\${name}` : `\\k<${name}>`;
        i += ref[0].length;
      } else if (/[A-Za-z0-9]/.test(n) || SYNTAX_CHARS.includes(n) || (inClass && n === "-")) {
        out += "\\" + n;
      } else {
        // Perl は \# や \: のように記号の前に \ を付けても普通の文字になるが、
        // JavaScript (u フラグ付き) ではエラーになるので \ を外す
        out += n;
      }
      continue;
    }

    if (inClass) {
      const posix = src.slice(i).match(/^\[:(\^?)(\w+):\]/);
      if (posix) {
        if (posix[1] || !POSIX_CLASSES[posix[2]]) {
          throw new Error(`${posix[0]} には対応していません`);
        }
        out += POSIX_CLASSES[posix[2]];
        i += posix[0].length - 1;
      } else if (c === "[") {
        out += "\\[";
      } else {
        if (c === "]") inClass = false;
        out += c;
      }
      continue;
    }

    if (c === "[") {
      inClass = true;
      out += c;
      if (src[i + 1] === "^") out += src[++i];
      // Perl では [] の直後の ] は普通の文字
      if (src[i + 1] === "]") {
        out += "\\]";
        i++;
      }
    } else if (c === "{") {
      // 回数指定 ({2} や {2,5}) ではない { は普通の文字にする
      const quantifier = src.slice(i).match(/^\{\d*,?\d*\}/);
      if (quantifier && quantifier[0] !== "{}" && quantifier[0] !== "{,}") {
        out += quantifier[0].startsWith("{,") ? "{0" + quantifier[0].slice(1) : quantifier[0];
        i += quantifier[0].length - 1;
      } else {
        out += "\\{";
      }
    } else if (c === "}") {
      out += "\\}";
    } else if (src.startsWith("(?#", i)) {
      // (?# ... ) はコメントなので取り除く
      const end = src.indexOf(")", i);
      i = end === -1 ? src.length : end;
    } else if (src.startsWith("(?P<", i)) {
      out += "(?<";
      i += 3;
    } else if (src.startsWith("(?'", i)) {
      // (?'name' ...) → (?<name> ...)
      const end = src.indexOf("'", i + 3);
      out += `(?<${src.slice(i + 3, end)}>`;
      i = end;
    } else if (src.startsWith("(?P=", i)) {
      // (?P=name) → \k<name>
      const end = src.indexOf(")", i);
      out += `\\k<${src.slice(i + 4, end)}>`;
      i = end;
    } else {
      out += c;
    }
  }

  return out;
}

// Perl は \p{Han} や \p{IsHan} のように文字の種類 (Script) の名前だけを書けるが、
// JavaScript では \p{Script=Han} と書く必要がある
function unicodeProperty(name) {
  const isValid = (property) => {
    try {
      new RegExp(`\\p{${property}}`, "u");
      return true;
    } catch {
      return false;
    }
  };
  if (isValid(name)) return name;
  const script = `Script=${name.replace(/^Is/, "")}`;
  return isValid(script) ? script : name;
}

// ---- 置換文字列 ----

// Perl の s/// と同じく $1 ${1} $& ${name} $+{name} \1 \n \t \U \L \E \u \l を使える
function expandReplacement(template, match) {
  let out = "";
  let caseMode = null; // "U" か "L"。\E が来るまで続く
  let nextCase = null; // "u" か "l"。次の 1 文字だけに効く

  const push = (text) => {
    if (!text) return;
    if (caseMode === "U") text = text.toUpperCase();
    if (caseMode === "L") text = text.toLowerCase();
    if (nextCase) {
      const first = String.fromCodePoint(text.codePointAt(0));
      const rest = text.slice(first.length);
      text = (nextCase === "u" ? first.toUpperCase() : first.toLowerCase()) + rest;
      nextCase = null;
    }
    out += text;
  };
  const group = (key) => {
    const value = /^\d+$/.test(key) ? match[Number(key)] : match.groups?.[key];
    return value ?? "";
  };

  for (let i = 0; i < template.length; i++) {
    const c = template[i];

    if (c === "\\" && i + 1 < template.length) {
      const n = template[++i];
      if (n === "U" || n === "L") caseMode = n;
      else if (n === "E") caseMode = null;
      else if (n === "u" || n === "l") nextCase = n;
      else if (n === "n") push("\n");
      else if (n === "t") push("\t");
      else if (/[0-9]/.test(n)) push(group(n));
      else push(n);
      continue;
    }

    if (c === "$") {
      const rest = template.slice(i + 1);
      const ref =
        rest.match(/^&/) ??
        rest.match(/^\{(\w+)\}/) ??
        rest.match(/^\+\{(\w+)\}/) ??
        rest.match(/^(\d+)/);
      if (ref) {
        push(ref[0] === "&" ? match[0] : group(ref[1]));
        i += ref[0].length;
        continue;
      }
    }

    push(c);
  }

  return out;
}

// ---- 検索カーソル ----

// Obsidian 本体の editor.searchCursor() と同じメソッドを持つオブジェクトを作る。
// 本体の検索バーは findNext / replace などをこのオブジェクトに対して呼ぶ
function createCursor(editor, regex, useRegex) {
  const view = editor.cm;
  // 最初の 1 件は、検索を始めたときのカーソル位置以降から探す
  let start = view.state.selection.main.from;
  let current = null;

  const matches = () => findMatches(regex, editor.getValue());
  const toPositions = (match) => ({
    from: editor.offsetToPos(match.from),
    to: editor.offsetToPos(match.to),
  });
  const isCurrent = (match) =>
    current && match.from === current.from && match.to === current.to;
  const select = (match) => {
    current = match ? { from: match.from, to: match.to } : null;
    if (match) start = match.to;
    return match ? toPositions(match) : null;
  };
  const replacementFor = (text, match) =>
    useRegex ? expandReplacement(text, match.result) : text;

  return {
    current() {
      return current ? toPositions(current) : null;
    },
    findNext() {
      const all = matches();
      return select(all.find((m) => m.from >= start && !isCurrent(m)) ?? all[0]);
    },
    findPrevious() {
      const all = matches();
      const from = current ? current.from : start;
      return select(all.findLast((m) => m.to <= from && !isCurrent(m)) ?? all.at(-1));
    },
    findAll() {
      return matches().map(toPositions);
    },
    getIndexAndCount() {
      const all = matches();
      const index = all.findIndex(isCurrent);
      return [index + 1, all.length];
    },
    replace(text, origin) {
      if (!current) return;
      // ドキュメントが変わっていても、今の 1 件がまだ一致しているときだけ置き換える
      const match = matches().find(isCurrent);
      if (!match) return;
      const replacement = replacementFor(text, match);
      const { from, to } = toPositions(match);
      editor.replaceRange(replacement, from, to, origin);
      // 置き換えた文字の後ろから次を探す
      start = match.from + replacement.length;
      current = null;
    },
    replaceAll(text, origin) {
      const changes = matches().map((match) => ({
        ...toPositions(match),
        text: replacementFor(text, match),
      }));
      if (changes.length > 0) editor.transaction({ changes }, origin);
      current = null;
    },
  };
}

// ---- プラグイン本体 ----

function clearHighlights(search) {
  search.searchInputEl.removeAttribute("title");
  search.editor?.cm?.dispatch({ effects: [setQuery.of(null), setCurrent.of(null)] });
}

module.exports = class EditorSearchPlusPlugin extends obsidian.Plugin {
  settings = { useRegex: false };
  searchProto = null;
  originals = null;
  // ボタンを足した検索バー。プラグインを無効にしたときに元に戻すため覚えておく
  searches = new Set();

  async onload() {
    this.settings = Object.assign(this.settings, await this.loadData());
    this.registerEditorExtension(searchHighlightField);

    this.app.workspace.onLayoutReady(() => this.tryPatch());
    // 起動時にノートが開いていなかったときは、ノートが開かれたときに差し替える
    this.registerEvent(this.app.workspace.on("layout-change", () => this.tryPatch()));

    this.addCommand({
      id: "toggle-regex",
      name: "Toggle regex search",
      callback: () => this.toggleRegex(),
    });

    this.register(() => this.unpatch());
  }

  tryPatch() {
    if (this.searchProto) return;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const search = leaf.view?.editMode?.search;
      if (search && typeof search.onSearchInput === "function") {
        this.patch(Object.getPrototypeOf(search));
        return;
      }
    }
  }

  patch(proto) {
    const plugin = this;
    const originals = {};
    for (const name of PATCHED_METHODS) originals[name] = proto[name];
    this.searchProto = proto;
    this.originals = originals;

    proto.show = function(...args) {
      plugin.decorate(this);
      return originals.show.apply(this, args);
    };

    // 入力するたびに、すべての一致をハイライトして最初の 1 件へ移動する
    proto.onSearchInput = function() {
      const query = this.getQuery();
      const useRegex = plugin.settings.useRegex;
      let regex = null;
      let error = null;
      try {
        if (query) regex = compileQuery(query, useRegex);
      } catch (e) {
        error = e.message;
      }

      this.cursor = regex ? createCursor(this.editor, regex, useRegex) : null;
      this.editor.cm.dispatch({ effects: setQuery.of(regex) });
      const match = this.cursor ? this.cursor.findNext() : null;
      match ? this.highlight([match]) : this.clear();

      this.searchInputEl.toggleClass("mod-no-match", !!query && !match);
      if (error) this.searchInputEl.setAttribute("title", error);
      else this.searchInputEl.removeAttribute("title");
      this.requestUpdateCount();
    };

    // 本体のハイライトはエディタにフォーカスが移ると消えるので使わず、
    // 今いる 1 件の印を付けてスクロールだけする
    proto.highlight = function(ranges) {
      const range = ranges[0];
      if (!range) return this.clear();
      const from = this.editor.posToOffset(range.from);
      const to = this.editor.posToOffset(range.to);
      this.editor.cm.dispatch({ effects: setCurrent.of({ from, to }) });
      this.editor.scrollIntoView(range, true);
    };

    proto.clear = function() {
      this.editor.cm.dispatch({ effects: setCurrent.of(null) });
    };

    // 入力した時点ですべてハイライトしているので「すべて検索」(Alt+Enter) は何もしない
    proto.searchAll = function() { };

    proto.replaceAll = function(...args) {
      if (!this.cursor) return;
      return originals.replaceAll.apply(this, args);
    };
  }

  unpatch() {
    if (this.searchProto) {
      Object.assign(this.searchProto, this.originals);
      this.searchProto = null;
      this.originals = null;
    }
    for (const search of this.searches) {
      search.espRestore();
      delete search.espRestore;
      clearHighlights(search);
    }
    this.searches.clear();
  }

  // 検索バーに正規表現の切り替えボタンを足し、「すべて検索」ボタンを隠す
  decorate(search) {
    if (search.espRestore) {
      this.updateButton(search);
      return;
    }
    this.searches.add(search);

    // 本体は検索バーを作るときに、元の onSearchInput と hide を bind して登録している。
    // そのため prototype を差し替えても入力時と Esc で閉じたときには元の処理が呼ばれる。
    // 入力は先に受け取って元の処理を止め、閉じたことは本体が閉じるときに必ず呼ぶ
    // applyScope(null) で知る
    const onInput = (e) => {
      e.stopImmediatePropagation();
      search.onSearchInput();
    };
    search.searchInputEl.addEventListener("input", onInput, { capture: true });
    const applyScope = search.applyScope;
    search.applyScope = (scope) => {
      applyScope(scope);
      if (!scope) clearHighlights(search);
    };
    const findAllIcon = search.searchButtonContainerEl.querySelector(".lucide-text-select");
    search.espFindAllButton = findAllIcon?.closest("button") ?? null;
    search.espFindAllButton?.hide();

    const button = search.searchButtonContainerEl.createEl("button", {
      cls: "clickable-icon document-search-button esp-regex-button",
    });
    obsidian.setIcon(button, "regex");
    obsidian.setTooltip(button, "JS正規表現", { placement: "top" });
    // ボタンを押しても検索欄からフォーカスが外れないようにする
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", (e) => {
      e.preventDefault();
      this.toggleRegex();
    });
    search.espRegexButton = button;
    this.updateButton(search);

    search.espRestore = () => {
      search.searchInputEl.removeEventListener("input", onInput, { capture: true });
      search.applyScope = applyScope;
      button.remove();
      delete search.espRegexButton;
      search.espFindAllButton?.show();
      delete search.espFindAllButton;
    };
  }

  updateButton(search) {
    search.espRegexButton?.toggleClass("is-active", this.settings.useRegex);
  }

  async toggleRegex() {
    this.settings.useRegex = !this.settings.useRegex;
    await this.saveData(this.settings);
    for (const search of this.searches) {
      this.updateButton(search);
      if (search.isActive) search.onSearchInput();
    }
  }
};
