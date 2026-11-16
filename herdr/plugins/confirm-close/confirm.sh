#!/bin/sh
# スペースを本当に閉じるか聞いて、Enter が押されたら close.sh で閉じる
# herdr/close-or-confirm.sh が、CLOSE_TARGET と HERDR_ACTIVE_* を --env で渡して開く前提
set -eu

herdr="${HERDR_BIN_PATH:-herdr}"

# 閉じるスペースの名前と中のタブ・ペインの数を見せる
"$herdr" workspace get "$HERDR_ACTIVE_WORKSPACE_ID" \
  | jq -r '.result.workspace | "Close space \"\(.label)\" (\(.tab_count) tabs, \(.pane_count) panes)?"'
printf '\n[Enter] close  [Esc] cancel'

# Enter が押されたら閉じて、Esc が押されたら閉じずに終わる。それ以外のキーは無視する
old_stty=$(stty -g)
stty -icanon -echo
while :; do
  key=$(dd bs=1 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')
  case "$key" in
    0a|0d) stty "$old_stty"; exec sh "$HOME/dotfiles/herdr/close.sh" "$CLOSE_TARGET" ;;
    1b) stty "$old_stty"; exit 0 ;;
  esac
done
