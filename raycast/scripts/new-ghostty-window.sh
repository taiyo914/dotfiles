#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title New Ghostty Window
# @raycast.mode silent

# Optional parameters:
# @raycast.icon icons/ghostty-icon.png

# Documentation:
# @raycast.author You

osascript -e '
tell application "Ghostty" to activate
delay 0.2
tell application "System Events" to keystroke "n" using command down
'
