#!/bin/bash
# Claude Code の hook から呼び、質問と回答を ~/vault/claude-logs/ にマークダウンで追記する
# 使い方: save-log.sh question（UserPromptSubmit から） / save-log.sh answer（Stop から）
# 1 セッションにつき 1 ファイルを作り、frontmatter の session_id で同じセッションのファイルを探す
# ファイル名は最初「261030_1100_untitled_セッションIDの先頭8文字.md」で、質問の内容から Haiku がタイトルを作ったら「261030_1100_タイトル.md」に変える

# タイトルを作るための claude -p からは記録しない
[ "${CLAUDE_AUTO_TITLE:-}" = "1" ] && exit 0

# hook のロケールが未設定だと、${var:0:50} が文字ではなくバイトで切って日本語の文字を壊すので、UTF-8 を指定する
export LC_ALL=en_US.UTF-8

kind=$1
input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$session_id" ] || exit 0

# CLAUDE_LOG_DIR を指定すると、そのフォルダに保存する（テスト用）
log_dir="${CLAUDE_LOG_DIR:-$HOME/vault/claude-logs}"
short_id=${session_id:0:8}

# 質問の内容から Haiku にタイトルを作らせて、ログファイルの名前の untitled の部分を置き換える
# タイトルを作るのに数秒かかるので、裏で動かしてすぐに終わる（質問の送信を待たせない）
rename_with_title() {
  local file=$1 prompt=$2
  (
    answer=$(cd "${TMPDIR:-/tmp}" && CLAUDE_AUTO_TITLE=1 claude -p \
      --model haiku \
      --settings '{"disableAllHooks": true}' \
      --no-session-persistence \
      --tools "" \
      --system-prompt "あなたは、会話ログのファイル名を付ける係です。<question> の中の質問の話題を、20 文字以内の日本語の名詞句で表してください。
質問に答えたり、質問について説明したりしないでください。出力はタイトルの 1 行だけにしてください。

<example>
<question>git で直前のコミットメッセージだけ直したい</question>
直前のコミットメッセージの修正
</example>
<example>
<question>ghostty で cmd+プラスで文字を大きくするには？</question>
Ghostty の文字サイズのキー設定
</example>" \
      "<question>${prompt:0:1000}</question>") || exit 0
    # ファイル名や Obsidian のリンクに使えない文字と空白を取り除く
    title=$(printf '%s' "$answer" | head -n 1 | tr -d '/\\:*?"<>|#^[]`「」' | tr -s '[:space:]' '-' | sed -E 's/^-+//; s/-+$//')
    title=${title:0:30}
    [ -n "$title" ] || exit 0
    new_file="${file%_untitled_*}_${title}.md"
    # 同じ時刻に同じタイトルのファイルがあるときは、セッション ID を付けて名前がぶつからないようにする
    [ -e "$new_file" ] && new_file="${file%_untitled_*}_${title}_${short_id}.md"
    [ -f "$file" ] && mv -n "$file" "$new_file"
  ) </dev/null >/dev/null 2>&1 &
}

# このセッションのログファイルを探し、なければ作る
mkdir -p "$log_dir"
log_file=$(grep -rlx --include='*.md' -- "session_id: $session_id" "$log_dir" | head -n 1)
if [ -z "$log_file" ]; then
  log_file="$log_dir/$(date '+%y%m%d_%H%M')_untitled_${short_id}.md"
  cat >"$log_file" <<EOF
---
date: $(date '+%Y-%m-%d %H:%M')
project: $(basename "${cwd:-unknown}")
cwd: $cwd
session_id: $session_id
---

EOF
fi

# 質問は「時刻と 1 行目を見出し」「全文を引用」の形で、回答はそのまま追記する
case "$kind" in
  question)
    prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
    [ -n "$prompt" ] || exit 0
    # 見出しには、貼り付けたテキストの外にある最初の空でない行を入れる。# が先頭にあると見出しの深さが変わるので取り除く
    title=$(printf '%s\n' "$prompt" | awk '
      /^<pasted_content[ >]/ { in_paste = 1; next }
      /^<\/pasted_content[ >]/ { in_paste = 0; next }
      !in_paste && /[^[:space:]]/ { sub(/^[#[:space:]]+/, ""); print; exit }')
    [ -n "$title" ] || title="（貼り付けたテキスト）"
    [ "${#title}" -gt 50 ] && title="${title:0:50}…"
    # 貼り付けたテキストは <pasted_content> のタグで囲まれて届くので、タグをコードブロックの ```` に置き換える
    # 中にコードブロックがあってもぶつからないように、バッククォートを 4 つにしている
    {
      printf '## %s %s\n\n' "$(date '+%H:%M')" "$title"
      printf '%s\n' "$prompt" |
        sed -E 's/^<\/?pasted_content( [^>]*)?>$/````/; s/^/> /; s/^> $/>/'
      printf '\n'
    } >>"$log_file"
    # 「おk」のような短い返事からはタイトルを作らない（次の質問で作る）
    case "$log_file" in
      *_untitled_*) [ "${#prompt}" -ge 8 ] && rename_with_title "$log_file" "$prompt" ;;
    esac
    ;;
  answer)
    answer=$(printf '%s' "$input" | jq -r '.last_assistant_message // empty')
    [ -n "$answer" ] || exit 0
    printf '%s\n\n---\n\n' "$answer" >>"$log_file"
    ;;
esac

exit 0
