#!/bin/bash
# Claude Code の /effort が settings.json に保存した effort レベルを消して、git に差分が出ないようにする。
# claude は --effort を付けて起動しているので、保存された effort レベルは使われず、消しても困らない。

settings=~/dotfiles/claude/settings.json

# effort の行がないときに書き戻すと、ConfigChange フックがもう一度動いてしまうため、何もせずに終わる
if ! jq -e 'any(.effortLevel, .modelSettings[]?.effortLevel; . != null)' "$settings" >/dev/null 2>&1; then
  exit 0
fi

# effort の行を消して、空になった modelSettings も消す
without_effort=$(jq 'del(.effortLevel, .modelSettings[]?.effortLevel)
  | if .modelSettings then .modelSettings |= with_entries(select(.value != {})) else . end
  | if .modelSettings == {} then del(.modelSettings) else . end' "$settings") || exit 0

# mv で置き換えずに中身だけ書き換えて、ファイルそのものは同じまま残す
printf '%s\n' "$without_effort" > "$settings"
exit 0
