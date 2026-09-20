#!/bin/sh
# Chrome で分割ビューを開いた直後に出る「タブを選択」画面を、新しいタブに差し替える。
# karabiner.json の「Chrome で Cmd+D を分割ビューに変換」ルールから呼ばれる。
#
# 「タブを選択」画面は chrome://tab-search.top-chrome/split_new_tab_page.html という
# 普通のタブなので、その URL を chrome://newtab/ に書き換えると
# 分割ビューを保ったまま右側だけが新しいタブになる。

/usr/bin/osascript <<'AS'
tell application "Google Chrome"
  -- 分割ビューが開くまで少し待つので、最大 2 秒ぶん探す
  repeat 20 times
    try
      repeat with t in tabs of front window
        if (URL of t) contains "split_new_tab_page" then
          set URL of t to "chrome://newtab/"
          return
        end if
      end repeat
    end try
    delay 0.1
  end repeat
end tell
AS
