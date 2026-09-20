#!/bin/bash
# Claude Code の hook から呼ぶ通知スクリプト
# 使い方: notify.sh <メッセージを取り出す jq のフィールド> <サウンド名>
# hook の JSON を標準入力から受け取り、terminal-notifier で通知を出す
FIELD="$1"
SOUND="$2"

MSG=$(jq -r "$FIELD")

# 通知をクリックしたとき、Claude Code を起動したターミナルを最前面に出す
case "$TERM_PROGRAM" in
    ghostty) APP="com.mitchellh.ghostty" ;;
    vscode)  APP="com.microsoft.VSCode" ;;
    *)       APP="" ;;
esac

if [ -n "$APP" ]; then
    terminal-notifier -title 'Claude Code' -message "$MSG" -sound "$SOUND" -activate "$APP"
else
    terminal-notifier -title 'Claude Code' -message "$MSG" -sound "$SOUND"
fi
