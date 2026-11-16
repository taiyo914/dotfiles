#!/bin/sh
# フォーカスしている pane を、fzf で選んだタブ（または新しいタブ）に移す
# herdr の [[keys.command]] の popup から呼ばれる前提（HERDR_* の環境変数を使う）
set -eu

herdr="${HERDR_BIN_PATH:-herdr}"
pane="$HERDR_ACTIVE_PANE_ID"
tab="$HERDR_ACTIVE_TAB_ID"
workspace="$HERDR_ACTIVE_WORKSPACE_ID"

# 一覧の列の幅（半角 1 文字を 1 とした表示幅）
ws_width=24
tab_width=8

panes=$("$herdr" pane list)

# タイトルがない pane について、中で動いているプログラムの名前を pane の ID ごとに集める
procs=$(printf '%s' "$panes" \
  | jq -r '.result.panes[] | select(.terminal_title_stripped == null) | .pane_id' \
  | while read -r id; do "$herdr" pane process-info --pane "$id" || true; done \
  | jq -s 'map(.result.process_info | select(. != null)
      | {key: .pane_id, value: .foreground_processes[0].name}) | from_entries')

# 1 行に「タブの ID<TAB>表示する文字」を出す。今のタブは出さず、今の workspace のタブを先に並べる
list=$(jq -rn \
  --argjson ws "$("$herdr" workspace list)" \
  --argjson tabs "$("$herdr" tab list)" \
  --argjson panes "$panes" \
  --argjson procs "$procs" \
  --arg tab "$tab" --arg cur "$workspace" \
  --argjson wsw "$ws_width" --argjson tabw "$tab_width" '
  # 1 文字の表示幅。日本語などの全角文字は 2、それ以外は 1 とする
  def cw:
    if (. >= 4352 and . <= 4447) or (. >= 11904 and . <= 42191) or (. >= 44032 and . <= 55203)
      or (. >= 63744 and . <= 64255) or (. >= 65040 and . <= 65049) or (. >= 65072 and . <= 65135)
      or (. >= 65280 and . <= 65376) or (. >= 65504 and . <= 65510) or (. >= 127744 and . <= 129791)
    then 2 else 1 end;
  def width: [explode[] | cw] | add // 0;
  # 表示幅が $n を超える文字列は、末尾を「…」にして $n に収める
  def trunc($n):
    if width <= $n then . else
      (reduce explode[] as $c ({s: [], w: 0, full: false};
        if .full or .w + ($c | cw) > $n - 1 then .full = true
        else .s += [$c] | .w += ($c | cw) end)
      | (.s | implode) + "…")
    end;
  # 表示幅が $n になるまで右に空白を足す
  def pad($n): trunc($n) | . + " " * ($n - width);

  ($ws.result.workspaces | map({key: .workspace_id, value: .label}) | from_entries) as $wsLabel
  | ($panes.result.panes | group_by(.tab_id)
      # タイトルがない pane は「[プログラム名] ディレクトリ名」で表す
      | map({key: .[0].tab_id, value: map(.terminal_title_stripped
          // "[\($procs[.pane_id] // "?")] \((.foreground_cwd // .cwd) | split("/") | last)") | join(" | ")})
      | from_entries) as $paneTitles
  | "new\t＋ 新しいタブ",
    ($tabs.result.tabs
      | map(select(.tab_id != $tab))
      | sort_by(.workspace_id != $cur, .workspace_id, .number)[]
      | "\(.tab_id)\t\($wsLabel[.workspace_id] | pad($wsw))  \("タブ \(.label)" | pad($tabw))  \($paneTitles[.tab_id] // "")")
')

header=$(printf "%-${ws_width}s  %-${tab_width}s  %s" workspace tab pane)
choice=$(printf '%s\n' "$list" \
  | fzf --delimiter='\t' --with-nth=2 --prompt='pane の移動先 > ' --reverse --header="$header") || exit 0
dest=$(printf '%s' "$choice" | cut -f1)

if [ "$dest" = "new" ]; then
  "$herdr" pane move "$pane" --new-tab --focus >/dev/null
else
  # 移動先のタブでは右に並べる。上下にしたいときは移動したあとに toggle-split.sh で切り替える
  "$herdr" pane move "$pane" --tab "$dest" --split right --focus >/dev/null
fi
