#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title New Ghostty Light Window
# @raycast.mode silent

# Optional parameters:
# @raycast.icon icons/ghostty-icon.png

# Documentation:
# @raycast.author You

open -na Ghostty --args --config-default-files=false --config-file="$HOME/dotfiles/ghostty/light.config"
