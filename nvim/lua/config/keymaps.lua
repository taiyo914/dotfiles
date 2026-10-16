-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- ビジュアルモードの Cmd + C で、選択した範囲を Mac のクリップボードにコピーする
vim.keymap.set("v", "<D-c>", '"+y', { desc = "Copy to clipboard" })

-- ノーマルモードで Esc を3回押したら nvim を終了する（<leader>qq と同じ動作）
-- 保存していないファイルがあるときは終了せずにエラーを出す
vim.keymap.set("n", "<Esc><Esc><Esc>", "<cmd>qa<cr>", { desc = "Quit All" })