#!/bin/bash
#
# ファイルのフルパスと行番号を、ローカルにある origin のデフォルトブランチ最新コミットの
# GitHub permalink に変換し、クリップボードにコピーする。--open を付けるとブラウザでも開く。
# リンク自体はローカルの git の情報だけで組み立てるので、GitHub には問い合わせない。
#
# 使い方:
#   github-permalink.sh /path/to/file.rb:42
#   github-permalink.sh /path/to/file.rb:10-20
#   github-permalink.sh /path/to/file.rb:42 --open
#
# nvim の <leader>gb / <leader>gy（dotfiles/nvim/lua/config/keymaps.lua）から呼ばれる。

set -euo pipefail

die() { echo "$1"; exit 1; }

input="${1:-}"
[ -n "$input" ] || die "パスを渡してください（例: /path/to/file.rb:42）"

# "path" / "path:42" / "path:10-20" を分ける
path="${input%%:*}"
lines="${input#"$path"}"
lines="${lines#:}"
case "$lines" in
  *[!0-9-]* ) lines="" ;;
esac

dir=$(dirname "$path")
[ -d "$dir" ] || die "ディレクトリがありません: $dir"
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || die "git リポジトリの中ではありません: $path"

root=$(cd "$root" && pwd -P)
abs="$(cd "$dir" && pwd -P)/$(basename "$path")"
rel="${abs#"$root"/}"
[ "$rel" != "$abs" ] || die "リポジトリからの相対パスを作れません: $abs"

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

# GitHub は .md を整形して表示するので、そのままだと #L… で行をハイライトできない。
# ?plain=1 を付けるとソースのまま表示され、行のハイライトが効く
query=""
if [ -n "$anchor" ]; then
  case "$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]')" in
    *.md|*.markdown) query="?plain=1" ;;
  esac
fi

permalink="https://$host/$slug/blob/$sha/$rel$query$anchor"
printf '%s' "$permalink" | pbcopy

# --open を付けたときだけ、コピーと同時にブラウザでも開く
if [ "${2:-}" = "--open" ]; then
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
