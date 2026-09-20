#!/bin/bash
#
# ファイルパスと行番号を、ローカルにある origin のデフォルトブランチ最新コミットの
# GitHub permalink に変換し、クリップボードにコピーしたうえでブラウザで開く。
# リンク自体はローカルの git の情報だけで組み立てるので、GitHub には問い合わせない。
#
# 使い方:
#   github-permalink.sh app/models/foo.rb:42
#   github-permalink.sh /path/to/file.rb:10-20
#   GHLINK_SELECTION="$(選択したテキスト)" github-permalink.sh /path/to/file.rb:42
#   GHLINK_OPEN=0 github-permalink.sh /path/to/file.rb:42   # ブラウザを開かずコピーだけする
#
# VS Code のユーザータスク ghlink / ghlink-selection（dotfiles/vscode/tasks.json）から呼ばれる。

set -euo pipefail

die() { echo "$1"; exit 1; }

input="${1:-}"
[ -n "$input" ] || die "パスを渡してください（例: app/models/foo.rb:42）"

input="${input#file://}"
input="${input/#\~/$HOME}"
input="${input%:}"

# "path" / "path:42" / "path:10-20" / "path:42:8"（grep 形式）を分ける
path="${input%%:*}"
lines="${input#"$path"}"
lines="${lines#:}"
lines="${lines%%:*}"
case "$lines" in
  *[!0-9-]* ) lines="" ;;
esac

# 絶対パスでなければ、リポジトリ置き場から同じ相対パスを持つリポジトリを探す
if [ "${path#/}" != "$path" ]; then
  target="$path"
elif [ -e "$PWD/$path" ]; then
  target="$PWD/$path"
else
  matches=()
  for d in "$HOME"/dev/*/ "$HOME"/src/*/ "$HOME"/vault/; do
    [ -d "$d.git" ] && [ -e "$d$path" ] && matches+=("$d$path")
  done
  [ ${#matches[@]} -gt 0 ] || die "どのリポジトリにも見つかりません: $path"
  if [ ${#matches[@]} -gt 1 ]; then
    names=""
    for m in "${matches[@]}"; do names="$names $(basename "${m%/$path}")"; done
    die "候補が複数あります（フルパスで指定してください）:$names"
  fi
  target="${matches[0]}"
fi

dir=$(dirname "$target")
[ -d "$dir" ] || die "ディレクトリがありません: $dir"
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || die "git リポジトリの中ではありません: $target"

root=$(cd "$root" && pwd -P)
abs="$(cd "$dir" && pwd -P)/$(basename "$target")"
rel="${abs#"$root"/}"
[ "$rel" != "$abs" ] || die "リポジトリからの相対パスを作れません: $abs"

# 複数行を選んでいるときは範囲にする。
# VS Code は選択の開始行・終了行を変数で渡せないので、渡された行番号（カーソルの行）と
# 選択テキストの行数から候補を作り、ファイルの中身と突き合わせて本物の範囲を決める。
sel="${GHLINK_SELECTION:-}"
sel="${sel%$'\n'}"
if [ -n "$lines" ] && [ "${lines#*-}" = "$lines" ] && [ -n "$sel" ] && [ "$sel" != "${sel#*$'\n'}" ] && [ -f "$abs" ]; then
  count=$(printf '%s\n' "$sel" | wc -l | tr -d ' ')
  n="$lines"
  # 下向きに選択 / 下向きで行末の改行まで含む / 上向きに選択、の順に試す
  for cand in "$((n - count + 1)):$n" "$((n - count)):$((n - 1))" "$n:$((n + count - 1))"; do
    s="${cand%%:*}"
    e="${cand##*:}"
    [ "$s" -ge 1 ] || continue
    block=$(sed -n "${s},${e}p" "$abs")
    if [[ "$block" == *"$sel"* ]]; then
      lines="$s-$e"
      break
    fi
  done
fi

# origin のデフォルトブランチ（main / master / develop）をローカルの参照から取る。通信はしない
ref=$(git -C "$root" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null) \
  || die "origin/HEAD が未設定です。git -C $root remote set-head origin -a を実行してください"
sha=$(git -C "$root" rev-parse "$ref")

url=$(git -C "$root" remote get-url origin)
hostpath=$(printf '%s' "$url" | sed -E 's#^ssh://##; s#^https?://##; s#^[^@/]+@##; s#:#/#; s#\.git$##; s#/$##')
host="${hostpath%%/*}"
slug="${hostpath#*/}"

anchor=""
case "$lines" in
  *-*) anchor="#L${lines%%-*}-L${lines##*-}" ;;
  ?*)  anchor="#L${lines}" ;;
esac

permalink="https://$host/$slug/blob/$sha/$rel$anchor"
printf '%s' "$permalink" | pbcopy

# コピーと同時にブラウザでも開く。開きたくないときは GHLINK_OPEN=0 を渡す
if [ "${GHLINK_OPEN:-1}" != "0" ]; then
  open "$permalink"
fi

# そのコミットに無いファイルや、手元で書き換えたファイルは行がズレるので知らせる
note=""
if ! git -C "$root" cat-file -e "$sha:$rel" 2>/dev/null; then
  note=" ⚠ このコミットにこのファイルはありません"
elif ! git -C "$root" diff --quiet "$sha" -- "$rel" 2>/dev/null; then
  note=" ⚠ 手元と差分あり。行番号がズレているかもしれません"
fi

age=$(git -C "$root" log -1 --format='%ar' "$ref")
echo "コピーしました ${rel}${anchor} @ ${ref}（${age}）${note}"
