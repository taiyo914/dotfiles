#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title New Obsidian Window
# @raycast.mode silent

# Optional parameters:
# @raycast.icon icons/obsidian-icon.png

# Documentation:
# @raycast.author You

osascript -e '
tell application "Obsidian" to activate
delay 0.2
tell application "System Events" to keystroke "n" using {command down, option down}
'
