#!/bin/bash
# Claude Code の UserPromptSubmit hook から呼ぶ
# herdr の space（workspace）にまだ名前がないときだけ、質問の内容から「テーマ:タスクの要約」の名前を Haiku に作らせて、space の名前にする
# 一度名前を付けた space の名前は変えない。付け直したいときは /retitle コマンドを使う
# 名前を作るのに数秒かかるので、裏で動かしてすぐに終わる（質問の送信を待たせない）

# 名前を作るための claude -p から呼ばれたときは何もしない
[ "${CLAUDE_AUTO_TITLE:-}" = "1" ] && exit 0
# herdr の pane の中で動いているときだけ動かす
[ "${HERDR_ENV:-}" = "1" ] && [ -n "${HERDR_PANE_ID:-}" ] || exit 0

prompt=$(jq -r '.prompt // empty')
# スラッシュコマンドは質問ではないので名前を変えない
case "$prompt" in /*|"") exit 0 ;; esac
# 「おk」のような短い返事からは名前を作らない（次の質問で作る）
[ "${#prompt}" -lt 8 ] && exit 0

rules_file="$(dirname "$0")/workspace-title-rules.md"
log_file="${TMPDIR:-/tmp}/claude-auto-title.log"
log() { printf '%s %s %s\n' "$(date '+%m-%d %H:%M:%S')" "$HERDR_PANE_ID" "$1" >>"$log_file"; }

# space の名前が、herdr が最初に付ける名前（space を作ったフォルダの名前）のままかを調べる
# space を作ったフォルダは herdr から取れないので、pane のフォルダとその親フォルダの名前と比べる
has_default_label() {
  label=$1
  dir=$2
  [ -z "$label" ] && return 0
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    [ "$label" = "$(basename "$dir")" ] && return 0
    dir=$(dirname "$dir")
  done
  return 1
}

(
  herdr="${HERDR_BIN_PATH:-herdr}"
  pane_info=$("$herdr" pane get "$HERDR_PANE_ID") || exit 0
  # pane が別の workspace に移動していることがあるので、今いる workspace を調べる
  workspace=$(printf '%s' "$pane_info" | jq -r '.result.pane.workspace_id')
  cwd=$(printf '%s' "$pane_info" | jq -r '.result.pane.cwd // empty')
  current=$("$herdr" workspace get "$workspace" | jq -r '.result.workspace.label // empty') || exit 0
  has_default_label "$current" "$cwd" || exit 0

  [ -f "$rules_file" ] || { log "error: $rules_file がない"; exit 0; }
  system="あなたは、ターミナルの space に付ける短い名前を作る係です。
次のルールに従って名前を作り、名前を 1 行だけ出力してください。説明や引用符は付けないでください。

$(cat "$rules_file")"

  answer=$(cd "${TMPDIR:-/tmp}" && CLAUDE_AUTO_TITLE=1 claude -p \
    --model haiku \
    --settings '{"disableAllHooks": true}' \
    --no-session-persistence \
    --tools "" \
    --system-prompt "$system" \
    "質問:
${prompt:0:1000}") || { log "error: claude -p が失敗した"; exit 0; }

  # 1 行目だけを使い、前後の空白と引用符を取り除く
  title=$(printf '%s' "$answer" | head -n 1 | sed -E 's/^[[:space:]`"「]+//; s/[[:space:]`"」]+$//')
  title=${title:0:40}

  # 「テーマ:要約」の形になっていないときは使わない
  if ! printf '%s' "$title" | grep -qE '^[a-z0-9-]{1,8}:.+'; then
    log "skip (形が違う): $answer"
    exit 0
  fi
  "$herdr" workspace rename "$workspace" "$title" >/dev/null
  log "rename: $current -> $title"
) </dev/null >/dev/null 2>&1 &

exit 0
