#!/bin/sh
set -eu

herdr="${HERDR_BIN_PATH:-herdr}"
self="sh $(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
projects_dir="$HOME/.claude/projects"
claude_sessions_dir="$HOME/.claude/sessions"
past_file_limit=80
refresh_seconds=2

row_format='
  def color($code): "\u001b[\($code)m\(.)\u001b[0m";
  def ago:
    ($now - .) as $s
    | if $s < 60 then "\($s | floor)s"
      elif $s < 3600 then "\($s / 60 | floor)m"
      elif $s < 86400 then "\($s / 3600 | floor)h"
      else "\($s / 86400 | floor)d" end;
  def lpad($n): " " * ($n - length) + .;
  def rpad($n): .[0:$n] | . + " " * ($n - length);
  def project:
    if test("/\\.claude/worktrees/") then
      split("/.claude/worktrees/") | "\(.[0] | split("/") | last):\(.[1] | split("/") | first)"
    else split("/") | last end;
  def state_label:
    {blocked: ["● 返事待ち", "1;33"],
     done:    ["✔ 完了    ", "32"],
     working: ["◐ 作業中  ", "36"],
     idle:    ["○ 待機中  ", "2"],
     past:    ["  過去    ", "2"]}[.] // ["? 不明    ", "2"];
  def row:
    (.state | state_label) as [$label, $code]
    | "\(.kind)\t\(.key)\t\(.cwd)\t"
      + ($label | color($code))
      + "  " + (.since | ago | lpad(4))
      + "  " + (.cwd | project | rpad(24) | color("34"))
      + "  " + .title
      + (if .note then "  " + ("[\(.note)]" | color("2")) else "" end);
'

status_since_by_session() {
  cat "$claude_sessions_dir"/*.json 2>/dev/null \
    | jq -s 'map({key: .sessionId, value: ((.statusUpdatedAt // .updatedAt // 0) / 1000)}) | from_entries' 2>/dev/null \
    || echo '{}'
}

list_live_sessions() {
  printf '%s' "$1" | jq -r \
    --argjson ws "$("$herdr" workspace list)" \
    --argjson since "$(status_since_by_session)" \
    --argjson now "$(date +%s)" "$row_format"'
    ($ws.result.workspaces | map({key: .workspace_id, value: .label}) | from_entries) as $workspace_label
    | .result.agents
    | map({
        kind: "live",
        key: .pane_id,
        cwd: (.foreground_cwd // .cwd),
        state: .agent_status,
        since: ($since[.agent_session.value // ""] // $now),
        title: (.terminal_title_stripped // "(タイトルなし)"),
        note: $workspace_label[.workspace_id]})
    | sort_by(({blocked: 0, done: 1, working: 2, idle: 3}[.state] // 4), -.since)[]
    | row'
}

build_past_sessions() {
  cd "$projects_dir"
  command ls -t ./*/*.jsonl 2>/dev/null | head -n "$past_file_limit" | while IFS= read -r file; do
    cwd=$(grep -m 1 -o '"cwd":"[^"]*"' "$file" | cut -d '"' -f 4)
    case "$cwd" in "" | /private/var/folders/* | /var/folders/* | /tmp/*) continue ;; esac
    title=$(grep '"type":"ai-title"' "$file" | tail -n 1 | jq -r '.aiTitle // empty')
    [ -n "$title" ] || continue
    printf '%s\t%s\t%s\t%s\n' "$(basename "$file" .jsonl)" "$cwd" "$(stat -f %m "$file")" "$title"
  done
}

list_past_sessions() {
  [ -f "${SESSIONS_PAST_CACHE:-}" ] || return 0
  jq -Rr \
    --argjson live "$(printf '%s' "$1" | jq '[.result.agents[].agent_session.value // empty]')" \
    --argjson now "$(date +%s)" "$row_format"'
    split("\t")
    | {kind: "past", key: .[0], cwd: .[1], state: "past", since: (.[2] | tonumber), title: .[3], note: null}
    | select(.key as $id | $live | index($id) | not)
    | row' "$SESSIONS_PAST_CACHE"
}

list_sessions() {
  agents=$("$herdr" agent list)
  list_live_sessions "$agents"
  list_past_sessions "$agents"
}

transcript_file() {
  command ls "$projects_dir"/*/"$1".jsonl 2>/dev/null | head -n 1
}

preview_past_session() {
  file=$(transcript_file "$1")
  [ -n "$file" ] || { echo "会話の記録が見つかりませんでした"; return 0; }
  grep -E '"type":"(user|assistant)"' "$file" | tail -n 400 | jq -r '
    select(.isSidechain != true)
    | if .type == "user" then
        (.message.content
          | if type == "string" then . else [.[]? | select(.type == "text") | .text] | join("\n") end)
        | select(length > 0 and (startswith("<") | not))
        | "\u001b[1;33m▶ あなた\u001b[0m\n\(.)\n"
      elif .type == "assistant" then
        [.message.content[]? | select(.type == "text") | .text] | join("\n")
        | select(length > 0)
        | "\u001b[1;36m◀ Claude\u001b[0m\n\(.)\n"
      else empty end'
}

preview_session() {
  case "$1" in
    live) "$herdr" agent read "$2" --source recent --lines 200 --ansi 2>/dev/null || echo "画面を読み取れませんでした" ;;
    past) preview_past_session "$2" ;;
  esac
}

reply_to_session() {
  if [ "$1" != live ]; then
    echo "過去のセッションには返事を送れません。Enter で再開してください"
    sleep 2
    return 0
  fi
  state=$("$herdr" agent list | jq -r --arg pane "$2" '.result.agents[] | select(.pane_id == $pane) | .agent_status')
  if [ "$state" = blocked ]; then
    printf '選択肢の番号（空のままで Enter でやめる）> '
    read -r choice
    case "$choice" in
      [1-9]) "$herdr" agent send-keys "$2" "$choice" >/dev/null ;;
    esac
  else
    printf '返事（空のままで Enter でやめる）> '
    read -r text
    [ -n "$text" ] || return 0
    "$herdr" agent prompt "$2" "$text" >/dev/null 2>&1 || { echo "送れませんでした"; sleep 2; }
  fi
}

resume_in_new_workspace() {
  session_id=$1
  cwd=$2
  if [ ! -d "$cwd" ]; then
    printf '%s がもうないので再開できません\n' "$cwd"
    sleep 2
    return 0
  fi
  label=$(awk -F '\t' -v id="$session_id" '$1 == id { print $4 }' "$SESSIONS_PAST_CACHE" | jq -Rr '.[0:24]')
  pane=$("$herdr" workspace create --cwd "$cwd" --label "${label:-resume}" --focus | jq -r '.result.root_pane.pane_id')
  "$herdr" pane run "$pane" "cc --resume $session_id" >/dev/null
}

open_session() {
  case "$1" in
    live) "$herdr" agent focus "$2" >/dev/null ;;
    past) resume_in_new_workspace "$2" "$3" ;;
  esac
}

refresh_loop() {
  while sleep "$refresh_seconds"; do
    curl -fsS -X POST "localhost:$FZF_PORT" -d "reload-sync($self list)+refresh-preview" >/dev/null 2>&1 || break
  done
}

main() {
  work_dir=$(mktemp -d)
  trap 'rm -rf "$work_dir"' EXIT
  export SESSIONS_PAST_CACHE="$work_dir/past.tsv"
  (build_past_sessions > "$work_dir/past.tsv.tmp" && mv "$work_dir/past.tsv.tmp" "$SESSIONS_PAST_CACHE") &

  list_sessions | fzf \
    --ansi --listen --reverse --no-sort \
    --delimiter '\t' --with-nth '4..' --id-nth 2 --track \
    --prompt 'session > ' \
    --header 'Enter: 移動 / 再開   Ctrl-S: 返事を送る   Ctrl-R: 更新   Esc: 閉じる' \
    --preview "$self preview {1} {2}" \
    --preview-window 'down,60%,follow,border-top' \
    --bind "start:execute-silent($self refresh-loop >/dev/null 2>&1 &)" \
    --bind "ctrl-s:execute($self reply {1} {2})+reload-sync($self list)+refresh-preview" \
    --bind "ctrl-r:reload-sync($self list)+refresh-preview" \
    --bind "enter:become($self open {1} {2} {3})" \
    || true
}

case "${1:-}" in
  list) list_sessions ;;
  preview) preview_session "$2" "$3" ;;
  reply) reply_to_session "$2" "$3" ;;
  open) open_session "$2" "$3" "${4:-}" ;;
  refresh-loop) refresh_loop ;;
  *) main ;;
esac
