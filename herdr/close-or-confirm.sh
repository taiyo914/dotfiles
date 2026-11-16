#!/bin/sh
# ペインかスペースを close.sh で閉じる。スペースが閉じるときだけ、確認の popup を開いて聞く
# herdr の [[keys.command]] の shell から呼ばれる前提（HERDR_* の環境変数を使う）
set -eu

herdr="${HERDR_BIN_PATH:-herdr}"
target="$1"

case "$target" in
  pane|workspace) ;;
  *) echo "usage: $0 pane|workspace" >&2; exit 2 ;;
esac

# ペインを閉じてもスペースに他のペインが残るときは、聞かずにすぐ閉じる
pane_count=$("$herdr" workspace get "$HERDR_ACTIVE_WORKSPACE_ID" | jq '.result.workspace.pane_count')
if [ "$target" = pane ] && [ "$pane_count" -gt 1 ]; then
  exec sh "$HOME/dotfiles/herdr/close.sh" pane
fi

# 確認の popup を開く。popup には HERDR_ACTIVE_* が渡されないので、close.sh が使う値を --env で渡す
exec "$herdr" plugin pane open \
  --plugin dotfiles.confirm-close --entrypoint confirm \
  --env "CLOSE_TARGET=$target" \
  --env "HERDR_ACTIVE_PANE_ID=$HERDR_ACTIVE_PANE_ID" \
  --env "HERDR_ACTIVE_TAB_ID=$HERDR_ACTIVE_TAB_ID" \
  --env "HERDR_ACTIVE_WORKSPACE_ID=$HERDR_ACTIVE_WORKSPACE_ID" >/dev/null
