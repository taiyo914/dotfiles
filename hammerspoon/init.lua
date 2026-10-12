-- hs コマンドで外から Hammerspoon を操作できるようにする（nvim が入力ソースを英数に切り替えるときに使う）
require("hs.ipc")

require("window-dim")
require("copy-notify")

hs.alert.show("Hammerspoon loaded")
