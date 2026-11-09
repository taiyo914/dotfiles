#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Emoji
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🔍
# @raycast.argument1 { "type": "text", "placeholder": "キーワード" }

# Documentation:
# @raycast.author You

# claude コマンドの起動方法は zsh の設定で決めているので、zsh の設定を全部読み込んでから zsh の emoji 関数を呼ぶ
# Raycast は端末ではないため zsh の設定の読み込み中にエラー文が出る。読み込み中のエラー文は捨て、emoji のエラー文だけ表示する
exec /bin/zsh -l -i -c 'emoji "$1" 2>&3' zsh "$1" 3>&2 2>/dev/null
