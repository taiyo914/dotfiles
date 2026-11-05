-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

-- ビジュアルモードの Cmd + C で、選択した範囲を Mac のクリップボードにコピーする
vim.keymap.set("v", "<D-c>", '"+y', { desc = "Copy to clipboard" })

-- Cmd + Shift + C でファイル名をコピー
-- ビジュアルモードでは、選択した行の行番号を付けて path:10 や path:10-12 の形でコピーする
local function copy_relative_file_path()
  local relative_path = vim.fn.expand("%:.")
  if vim.fn.mode() ~= "n" then
    local start_line, end_line = vim.fn.line("v"), vim.fn.line(".")
    if start_line > end_line then
      start_line, end_line = end_line, start_line
    end
    local lines = start_line == end_line and tostring(start_line) or (start_line .. "-" .. end_line)
    relative_path = relative_path .. ":" .. lines
    vim.cmd("normal! \27")
  end
  vim.fn.setreg("+", relative_path)
  vim.notify("Copied: " .. relative_path)
end
for _, lhs in ipairs({ "<D-C>", "<D-S-c>" }) do
  vim.keymap.set({ "n", "x" }, lhs, copy_relative_file_path, { desc = "Copy relative file path" })
end

-- Cmd + S でファイルを保存する（LazyVim の Ctrl + S と同じ動作）
vim.keymap.set({ "i", "x", "n", "s" }, "<D-s>", "<cmd>w<cr><esc>", { desc = "Save File" })

-- ノーマルモードで Esc を3回押したら nvim を終了する（<leader>qq と同じ動作）
-- 保存していないファイルがあるときは終了せずにエラーを出す
vim.keymap.set("n", "<Esc><Esc><Esc>", "<cmd>qa<cr>", { desc = "Quit All" })

-- カーソル行（ビジュアルモードでは選択範囲）の、origin のデフォルトブランチ最新コミットでの GitHub パーマリンクをコピーし、必要ならブラウザでも開く
-- LazyVim の Git Browse は手元の HEAD のコミットを使い、push 前だと GitHub で開けないので、自作のスクリプトを使う
local function github_permalink(open_in_browser, blame)
  local start_line, end_line = vim.fn.line("v"), vim.fn.line(".")
  if vim.fn.mode() == "n" then
    start_line = end_line
  end
  if start_line > end_line then
    start_line, end_line = end_line, start_line
  end
  local lines = start_line == end_line and tostring(start_line) or (start_line .. "-" .. end_line)
  local target = vim.api.nvim_buf_get_name(0) .. ":" .. lines

  vim.cmd("normal! \27")
  local command = { "bash", vim.fn.stdpath("config") .. "/scripts/github-permalink.sh", target }
  if open_in_browser then
    table.insert(command, "--open")
  end
  if blame then
    table.insert(command, "--blame")
  end
  vim.system(command, { text = true }, function(result)
    local message = vim.trim(result.stdout or "")
    local level = result.code == 0 and vim.log.levels.INFO or vim.log.levels.ERROR
    vim.schedule(function()
      vim.notify(message, level)
    end)
  end)
end

-- <leader>gb で GitHub の blame ページを開き、LazyVim で <leader>gb だった Blame Line を <leader>gB に移す
vim.keymap.set({ "n", "x" }, "<leader>gb", function()
  github_permalink(true, true)
end, { desc = "Git Browse Blame (GitHub, default branch)" })
vim.keymap.set("n", "<leader>gB", function()
  Snacks.picker.git_log_line()
end, { desc = "Git Blame Line" })
vim.keymap.set({ "n", "x" }, "<leader>gy", function()
  github_permalink(false)
end, { desc = "Git Browse (copy permalink on default branch)" })
