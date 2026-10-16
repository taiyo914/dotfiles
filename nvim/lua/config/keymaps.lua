-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- ビジュアルモードの Cmd + C で、選択した範囲を Mac のクリップボードにコピーする
vim.keymap.set("v", "<D-c>", '"+y', { desc = "Copy to clipboard" })