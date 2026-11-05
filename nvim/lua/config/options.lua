-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- y や p で Mac のクリップボードを使う
vim.opt.clipboard = "unnamedplus"

-- カーソルを行の末尾より右にも置けるようにして、短い行にカーソルがあっても横スクロールできるようにする
-- 横スクロール以外でカーソルが行末より右に行ったときは、autocmds.lua で行末に戻している
vim.opt.virtualedit = "all"
