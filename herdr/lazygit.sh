#!/bin/sh
# フォーカスしている pane の作業ディレクトリで lazygit を開く
# herdr の [[keys.command]] の popup から呼ばれる前提（HERDR_* の環境変数を使う）
set -eu

herdr="${HERDR_BIN_PATH:-herdr}"

# pane の中で動いているプログラム（Claude Code など）のディレクトリを優先する
# 取れないときは pane のシェルのディレクトリを使う
dir=$("$herdr" pane get "$HERDR_ACTIVE_PANE_ID" \
  | jq -r '.result.pane.foreground_cwd // .result.pane.cwd // empty') || true
dir="${dir:-${HERDR_ACTIVE_PANE_CWD:-$PWD}}"

cd "$dir"
exec lazygit
