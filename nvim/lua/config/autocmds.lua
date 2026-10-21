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
local function on_start()
  Snacks.explorer({ cwd = LazyVim.root(), enter = false })
end

local function start_ruby_lsp_if_gemfile_project()
  local root = vim.fs.root(vim.fn.getcwd(), { "Gemfile", ".git" })
  if not root or vim.fn.filereadable(root .. "/Gemfile") == 0 then
    return
  end

  require("lazy").load({ plugins = { "nvim-lspconfig" } })
  if not vim.lsp.is_enabled("ruby_lsp") then
    return
  end

  local config = vim.deepcopy(vim.lsp.config.ruby_lsp)
  config.name = "ruby_lsp"
  config.root_dir = root
  vim.lsp.start(config, { attach = false, reuse_client = config.reuse_client })
end

local function on_vim_enter()
  on_start()
  start_ruby_lsp_if_gemfile_project()
end

-- このファイルは、引数なしで起動すると VimEnter より後に読み込まれるので、その場合はすぐに開く
if vim.v.vim_did_enter == 1 then
  on_vim_enter()
else
  vim.api.nvim_create_autocmd("VimEnter", { callback = on_vim_enter })
end

-- macOS の入力ソースを英数（Google 日本語入力の英数モード）に切り替える
-- nvim からは入力ソースを直接変えられないので、Hammerspoon の hs コマンドに頼む
-- Hammerspoon が動いていないと hs コマンドが終わらないので、1秒で打ち切る
local function switch_to_eisuu()
  if vim.fn.executable("hs") ~= 1 then
    return
  end
  vim.system({ "hs", "-c", 'hs.keycodes.currentSourceID("com.google.inputmethod.Japanese.Roman")' }, { timeout = 1000 })
end

-- ノーマルモードでは日本語入力だとキー操作が効かないので、次の3つのタイミングで英数にする
-- 1. nvim を起動したとき（このファイルは起動時に1回読み込まれる）
switch_to_eisuu()

-- 2. インサートモードを抜けたとき
vim.api.nvim_create_autocmd("InsertLeave", { callback = switch_to_eisuu })

-- 3. 別のアプリから nvim の画面に戻ってきたとき
-- インサートモードで日本語を書いている途中なら、日本語入力のままにする
vim.api.nvim_create_autocmd("FocusGained", {
  callback = function()
    if vim.api.nvim_get_mode().mode == "n" then
      switch_to_eisuu()
    end
  end,
})

-- Markdown ではスペルチェックをオフにする
-- 必要なときは <leader>us でオンにできる
vim.api.nvim_create_autocmd("FileType", {
  pattern = "markdown",
  callback = function()
    vim.opt_local.spell = false
  end,
})
