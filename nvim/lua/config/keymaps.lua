-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- ビジュアルモードの Cmd + C で、選択した範囲を Mac のクリップボードにコピーする
vim.keymap.set("v", "<D-c>", '"+y', { desc = "Copy to clipboard" })

-- Cmd + S でファイルを保存する（LazyVim の Ctrl + S と同じ動作）
vim.keymap.set({ "i", "x", "n", "s" }, "<D-s>", "<cmd>w<cr><esc>", { desc = "Save File" })

-- ノーマルモードで Esc を3回押したら nvim を終了する（<leader>qq と同じ動作）
-- 保存していないファイルがあるときは終了せずにエラーを出す
vim.keymap.set("n", "<Esc><Esc><Esc>", "<cmd>qa<cr>", { desc = "Quit All" })

-- LazyVim の Git Browse はブランチ名入りの URL を作るので、コミットハッシュ入りのパーマリンクを作るように上書きする
-- よく使う Browse を <leader>gb にして、LazyVim で <leader>gb だった Blame Line を <leader>gB に移す
vim.keymap.set({ "n", "x" }, "<leader>gb", function()
  Snacks.gitbrowse({ what = "permalink" })
end, { desc = "Git Browse (permalink)" })
vim.keymap.set("n", "<leader>gB", function()
  Snacks.picker.git_log_line()
end, { desc = "Git Blame Line" })
vim.keymap.set({ "n", "x" }, "<leader>gy", function()
  Snacks.gitbrowse({
    what = "permalink",
    open = function(url)
      vim.fn.setreg("+", url)
    end,
    notify = false,
  })
end, { desc = "Git Browse (copy permalink)" })
