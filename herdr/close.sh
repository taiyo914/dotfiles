#!/bin/sh
set -eu

herdr="${HERDR_BIN_PATH:-herdr}"
target="$1"

case "$target" in
  pane) filter='select(.pane_id == $id)'; id="$HERDR_ACTIVE_PANE_ID" ;;
  tab) filter='select(.tab_id == $id)'; id="$HERDR_ACTIVE_TAB_ID" ;;
  workspace) filter='select(.workspace_id == $id)'; id="$HERDR_ACTIVE_WORKSPACE_ID" ;;
  *) echo "usage: $0 pane|tab|workspace" >&2; exit 2 ;;
esac

panes=$("$herdr" pane list | jq -r --arg id "$id" ".result.panes[] | $filter | .pane_id")

panes_running_nvim() {
  for pane in $panes; do
    "$herdr" pane process-info --pane "$pane" \
      | jq -e '.result.process_info.foreground_processes | any(.name == "nvim")' >/dev/null \
      && echo "$pane"
  done
  return 0
}

nvim_panes=$(panes_running_nvim)
for pane in $nvim_panes; do
  "$herdr" pane send-keys "$pane" esc : q a enter >/dev/null
done

if [ -n "$nvim_panes" ]; then
  tries=0
  while [ -n "$(panes_running_nvim)" ]; do
    tries=$((tries + 1))
    [ "$tries" -gt 30 ] && exit 0
    sleep 0.1
  done
fi

"$herdr" "$target" close "$id" >/dev/null
