#!/bin/bash
# Claude Code の UserPromptSubmit hook から呼ぶ
# 質問の内容から「テーマ:質問の要約」の名前を Haiku に作らせて、herdr の pane と workspace の名前にする
# 名前を作るのに数秒かかるので、裏で動かしてすぐに終わる（質問の送信を待たせない）

# 名前を作るための claude -p から呼ばれたときは何もしない
[ "${CLAUDE_AUTO_TITLE:-}" = "1" ] && exit 0
# herdr の pane の中で動いているときだけ動かす
[ "${HERDR_ENV:-}" = "1" ] && [ -n "${HERDR_PANE_ID:-}" ] || exit 0

prompt=$(jq -r '.prompt // empty')
# スラッシュコマンドは質問ではないので名前を変えない
case "$prompt" in /*|"") exit 0 ;; esac

log_file="${TMPDIR:-/tmp}/claude-auto-title.log"
log() { printf '%s %s %s\n' "$(date '+%m-%d %H:%M:%S')" "$HERDR_PANE_ID" "$1" >>"$log_file"; }

(
  herdr="${HERDR_BIN_PATH:-herdr}"
  pane_info=$("$herdr" pane get "$HERDR_PANE_ID") || exit 0
  current=$(printf '%s' "$pane_info" | jq -r '.result.pane.label // empty')
  # pane が別の workspace に移動していることがあるので、今いる workspace を調べる
  workspace=$(printf '%s' "$pane_info" | jq -r '.result.pane.workspace_id')

  # 「おk」のような短い返事では、すでに名前があれば変えない
  if [ -n "$current" ] && [ "${#prompt}" -lt 8 ]; then
    exit 0
  fi

  system='あなたは、ターミナルの pane に付ける短い名前を作る係です。
名前は「テーマ:質問の要約」の形で、1 行だけを出力してください。説明や引用符は付けないでください。

テーマは、何の話かがわかる英小文字の短い略語（8 文字以内）です。
次の表にある話題のときは、必ず表の略語を 1 文字も変えずにそのまま使ってください。

| 話題 | 略語 |
| Neovim | nvim |
| Ghostty | ghsty |
| Karabiner-Elements | kar |
| zsh | zsh |
| Claude Code | claude |
| herdr | herdr |
| Obsidian | obs |
| VS Code | vscode |
| Git | git |
| lazygit | lazygit |
| Keyball | keyball |
| ZMK | zmk |
| Chrome | chrome |
| macOS | mac |

表にない話題のときは、同じくらい短い略語を自分で作ってください。
質問の要約は、質問の内容を日本語で 20 文字以内にまとめたものです。

「今の名前」と同じ話を続けているときは、今の名前をそのまま出力してください。
話が変わったときだけ、新しい名前を作ってください。

例:
今の名前: （まだない） / 新しい質問: ghostty でフォントを変えたい → ghsty:フォントの変更
今の名前: ghsty:フォントの変更 / 新しい質問: サイズも大きくしたい → ghsty:フォントの変更
今の名前: ghsty:フォントの変更 / 新しい質問: 話変わるけど karabiner で caps を ctrl にしたい → kar:capsをctrlにする'

  answer=$(cd "${TMPDIR:-/tmp}" && CLAUDE_AUTO_TITLE=1 claude -p \
    --model haiku \
    --settings '{"disableAllHooks": true}' \
    --no-session-persistence \
    --tools "" \
    --system-prompt "$system" \
    "今の名前: ${current:-（まだない）}
新しい質問:
${prompt:0:1000}") || { log "error: claude -p が失敗した"; exit 0; }

  # 1 行目だけを使い、前後の空白と引用符を取り除く
  title=$(printf '%s' "$answer" | head -n 1 | sed -E 's/^[[:space:]`"「]+//; s/[[:space:]`"」]+$//')
  title=${title:0:40}

  # 「テーマ:要約」の形になっていないときは使わない
  if ! printf '%s' "$title" | grep -qE '^[a-z0-9-]{1,8}:.+'; then
    log "skip (形が違う): $answer"
    exit 0
  fi
  if [ "$title" = "$current" ]; then
    log "keep: $title"
    exit 0
  fi
  "$herdr" pane rename "$HERDR_PANE_ID" "$title" >/dev/null
  "$herdr" workspace rename "$workspace" "$title" >/dev/null
  log "rename: $current -> $title"
) </dev/null >/dev/null 2>&1 &

exit 0
