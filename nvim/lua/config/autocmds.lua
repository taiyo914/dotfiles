-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- nvim を起動したときに、ファイルツリーを最初から開いておく
-- カーソルはファイルツリーに移さず、編集画面に残す
local function open_explorer()
  Snacks.explorer({ cwd = LazyVim.root(), enter = false })
end

-- このファイルは、引数なしで起動すると VimEnter より後に読み込まれるので、その場合はすぐに開く
if vim.v.vim_did_enter == 1 then
  open_explorer()
else
  vim.api.nvim_create_autocmd("VimEnter", { callback = open_explorer })
end
