-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- y や p で Mac のクリップボードを使う
vim.opt.clipboard = "unnamedplus"

-- カーソルを行の末尾より右にも置けるようにして、短い行にカーソルがあっても横スクロールできるようにする
-- 注意: 行末より右の空白にもカーソルが止まり、そこで文字を打つと行末からその位置までスペースが自動で入る
vim.opt.virtualedit = "all"
