#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Focus Center Window
# @raycast.mode silent

# Documentation:
# @raycast.description 手前のウィンドウを、画面の中央に横 75%・縦 90% の大きさで置く
# @raycast.author You

# Raycast から実行すると PATH に /opt/homebrew/bin が入らないことがあるので、フルパスで呼ぶ
/opt/homebrew/bin/hs -c "moveFocusedWindowToCenter()"
