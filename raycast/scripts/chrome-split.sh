#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Split Chrome Window
# @raycast.mode silent

# Documentation:
# @raycast.description Chrome の新しいウィンドウを開いて、今のウィンドウと左右半分ずつに並べる
# @raycast.author You

# Raycast から実行すると PATH に /opt/homebrew/bin が入らないことがあるので、フルパスで呼ぶ
/opt/homebrew/bin/hs -c "splitChromeWindow()"
