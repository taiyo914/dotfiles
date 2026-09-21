#!/bin/sh
# 会話の内容から herdr のワークスペース名を自動でつける。
# Claude Code の UserPromptSubmit フック、resume 時の SessionStart フック、
# セッションを抜けるときの SessionEnd フックから呼ばれる。
# セッションの最初の質問のときだけ、その質問をもとに haiku にキーワードを
# 2〜3 個つくらせて `herdr workspace rename` に渡す。
# セッションを resume したときは、印のファイルを消すだけして終わる。
# そうすることで、resume 後の最初の質問がまた「最初の質問」として扱われ、
# 手動でつけた名前があってもその質問の内容で名前がつけ直される。
# セッションを抜けるとき（/clear は除く）は、最初にリネームする直前の
# 名前（初期値）に戻す。ただし同じ workspace で他のセッションがまだ
# 動いているときは、そのセッションの邪魔をしないよう何もしない。

set -eu

MAX_CHARS=14

input=$(cat)

# herdr の外で動いているとき、名前をつけるために起動した内側の claude から
# 呼ばれたときは、何もしないで終わる
[ "${HERDR_ENV:-}" = "1" ] || exit 0
[ -n "${HERDR_WORKSPACE_ID:-}" ] || exit 0
[ -z "${HERDR_WORKSPACE_TITLE_SKIP:-}" ] || exit 0
command -v herdr >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

session_id=$(printf '%s' "$input" | jq -r '.session_id // ""')
hook_event=$(printf '%s' "$input" | jq -r '.hook_event_name // ""')
[ -n "$session_id" ] || exit 0

state_dir="$HOME/.claude/state/herdr-workspace-title"
mkdir -p "$state_dir"
done_file="$state_dir/done-$session_id"

# SessionStart（resume）から呼ばれたときは、印のファイルを消すだけで終わる。
# 実際に名前をつけ直すのは、この後 UserPromptSubmit で呼ばれたときになる。
if [ "$hook_event" = "SessionStart" ]; then
	rm -f "$done_file"
	exit 0
fi

initial_file="$state_dir/initial-$HERDR_WORKSPACE_ID"

# SessionEnd（clear 以外）から呼ばれたときは、名前を初期値に戻して終わる。
if [ "$hook_event" = "SessionEnd" ]; then
	# まだ一度も自動リネームしていない workspace なら、戻す先が無いので何もしない
	[ -f "$initial_file" ] || exit 0
	initial_title=$(cat "$initial_file")
	[ -n "$initial_title" ] || exit 0

	# 同じ workspace で自分以外のセッションがまだ動いているなら、何もしない
	other_alive=$(herdr agent list 2>/dev/null | jq -r --arg ws "$HERDR_WORKSPACE_ID" --arg me "$session_id" '
    .result.agents[]
    | select(.workspace_id == $ws)
    | .agent_session.value // empty
    | select(length > 0 and . != $me)
  ' | head -n 1)
	[ -z "$other_alive" ] || exit 0

	herdr workspace rename "$HERDR_WORKSPACE_ID" "$initial_title" >/dev/null 2>&1 || true
	exit 0
fi

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // ""')
prompt=$(printf '%s' "$input" | jq -r '.prompt // ""')

# 名前をつけるのは、このセッションの最初の質問のときだけ。
# 2 回目以降は、印のファイルがあるので何もしないで終わる。
[ ! -e "$done_file" ] || exit 0
: >"$done_file"

# 1 つの space の名前をつける権利は、最初に取ったセッションだけが持つ。
# 同じ space で 2 つ目以降のエージェントを動かしても、名前は奪われない。
# 権利を持っていたセッションが終わっていたら、自分が引き継ぐ。
owner_file="$state_dir/owner-$HERDR_WORKSPACE_ID"
owner=$(cat "$owner_file" 2>/dev/null || echo '')
if [ -n "$owner" ] && [ "$owner" != "$session_id" ]; then
	owner_alive=$(herdr agent list 2>/dev/null | jq -r --arg ws "$HERDR_WORKSPACE_ID" --arg owner "$owner" '
    .result.agents[]
    | select(.workspace_id == $ws)
    | .agent_session.value // empty
    | select(. == $owner)
  ' | head -n 1)
	# 権利を持つセッションがまだこの space で動いているなら、何もしない
	[ -z "$owner_alive" ] || exit 0
fi
printf '%s' "$session_id" >"$owner_file"

# この workspace で初めてリネームするときは、リネームする直前の名前を
# 初期値として控えておく（SessionEnd で戻すときに使う）。一度控えたら
# 上書きしない
if [ ! -e "$initial_file" ]; then
	current_label=$(herdr workspace get "$HERDR_WORKSPACE_ID" 2>/dev/null | jq -r '.result.workspace.label // empty')
	[ -z "$current_label" ] || printf '%s' "$current_label" >"$initial_file"
fi

# 直近のユーザー発言を材料にする（ツールの実行結果や自動の差し込みは除く）
material=''
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
	material=$(jq -r '
    select(.type == "user" and (.isMeta | not) and (.isSidechain | not))
    | .message.content
    | if type == "string" then . else (map(select(.type == "text") | .text) | join(" ")) end
    | select(type == "string" and length > 0)
  ' "$transcript" 2>/dev/null | grep -v '^<' | tail -n 20 || true)
fi
material=$(printf '%s\n%s\n' "$material" "$prompt")

instruction='以下は、ターミナルで進行中の AI との会話で、ユーザーが送った発言です。
この会話が何についてのものかを表すキーワードを 2〜3 個、重要な順に並べて 1 行だけ出力してください。

条件:
- 半角スペース区切り
- 全体で全角 '"$MAX_CHARS"' 文字以内に必ず収める
- 日本語を主体にする。固有名詞やコマンド名は英字のままでよい
- 「について」「の話」などの説明語、句読点、記号、引用符は使わない
- 説明や前置きは書かず、キーワードの行だけを出力する

例: herdr space名 自動更新'

# キーワードを考えさせるだけなので、作業用のからのディレクトリで動かして
# プロジェクトのファイルやスキルを読み込ませない
work_dir="${TMPDIR:-/tmp}/herdr-workspace-title-work"
mkdir -p "$work_dir"

workspace_id="$HERDR_WORKSPACE_ID"

# 返事を待たずに裏で走らせる（フックが会話の進行を止めないようにするため）
(
	cd "$work_dir" || exit 0

	title=$(printf '%s' "$material" |
		env -u HERDR_ENV -u HERDR_PANE_ID -u HERDR_TAB_ID -u HERDR_WORKSPACE_ID -u HERDR_SOCKET_PATH \
			HERDR_WORKSPACE_TITLE_SKIP=1 \
			claude -p --model haiku \
			--strict-mcp-config --mcp-config '{"mcpServers":{}}' \
			--disable-slash-commands \
			--disallowed-tools 'Bash,Read,Write,Edit,Glob,Grep,Task,WebSearch,WebFetch,TodoWrite' \
			--append-system-prompt 'あなたはキーワード抽出器です。ツールは一切使わず、質問もせず、指示された1行だけを出力します。' \
			"$instruction" 2>/dev/null) || exit 0

	title=$(printf '%s' "$title" | MAX_CHARS="$MAX_CHARS" python3 -c '
import os, re, sys

raw = sys.stdin.read()
line = next((l.strip() for l in raw.splitlines() if l.strip()), "")
line = re.sub(r"[\"'"'"'`「」、。]", "", line)
line = re.sub(r"\s+", " ", line).strip()

# 全角を 1 文字、半角を 0.5 文字として数えて、はみ出す分を切り捨てる
limit = float(os.environ["MAX_CHARS"])
width = 0.0
out = []
for ch in line:
    width += 0.5 if ord(ch) < 0x1100 else 1.0
    if width > limit:
        break
    out.append(ch)
print("".join(out).strip())
')

	[ -n "$title" ] || exit 0
	herdr workspace rename "$workspace_id" "$title" >/dev/null 2>&1 || true
) >/dev/null 2>&1 &

exit 0
